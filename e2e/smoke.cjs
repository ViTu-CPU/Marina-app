/**
 * End-to-end smoke test of the Definition of Done (SPEC §10) in a real browser.
 *
 *   npm run build && node e2e/smoke.cjs
 *
 * Needs the `playwright` package and a Chromium it can launch. Playwright is not a
 * dependency of this project (see README); install it separately to run this script.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const PORT = 4173;
const URL_BASE = `http://localhost:${PORT}/`;
const DISCLAIMER = 'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.';
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marina-e2e-'));
const steps = [];
const step = async (name, fn) => {
  await fn();
  steps.push(name);
  console.log(`  ok  ${name}`);
};

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(URL_BASE)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('preview server did not start');
}

(async () => {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('dialog', (d) => d.accept());
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });

    const canvas = page.getByTestId('canvas');
    const box = await canvas.boundingBox();
    const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
    const click = async (fx, fy) => {
      const p = at(fx, fy);
      await page.mouse.click(p.x, p.y);
    };
    const state = () => page.evaluate(() => {
      const s = window.__marina.getState();
      return JSON.parse(JSON.stringify({ project: s.project, view: s.view, viewport: s.viewport, selectedLayoutId: s.selectedLayoutId, tool: s.tool, draft: s.draft, selection: s.selection }));
    });
    /** Screen position of a world point. */
    const toScreen = (s, p) => ({
      x: box.x + (p.x - s.view.cx) * s.view.zoom + s.viewport.width / 2,
      y: box.y - (p.y - s.view.cy) * s.view.zoom + s.viewport.height / 2,
    });
    const centre = (poly) => ({ x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length });
    const tool = (name) => page.getByRole('button', { name, exact: true }).click();
    /** Click Generate and wait for the worker's result (U23). */
    const generate = async () => {
      // "Regenerate" when the inputs changed since the last run.
      await page.getByRole('button', { name: /^(Generate|Regenerate)$/ }).click();
      await page.waitForFunction(() => !window.__marina.getState().generating && window.__marina.getState().project.layouts.length > 0, null, { timeout: 20000 });
    };
    const download = async (buttonName) => {
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: buttonName, exact: true }).click()]);
      const file = path.join(outDir, d.suggestedFilename());
      await d.saveAs(file);
      return file;
    };

    await step('the disclaimer is visible', async () => {
      assert.equal(await page.getByRole('note').textContent(), DISCLAIMER);
    });

    await step('draw a site from scratch: water, shoreline, entrance, obstacle', async () => {
      await tool('Water area');
      await click(0.15, 0.85);
      await click(0.85, 0.85);
      await click(0.85, 0.15);
      await click(0.15, 0.15);
      await click(0.15, 0.85); // back on the first point closes the polygon
      let s = await state();
      assert.equal(s.project.site.water.length, 4);
      assert.equal(s.tool, 'select');

      await tool('Shoreline');
      await click(0.152, 0.848); // snaps to the south-west corner
      await click(0.848, 0.852); // snaps to the south-east corner
      await page.keyboard.press('Enter');
      s = await state();
      assert.equal(s.project.site.shoreline.length, 2);
      const ys = s.project.site.water.map((p) => p.y);
      assert.equal(s.project.site.shoreline[0].y, Math.min(...ys), 'shoreline start snapped to a water vertex');

      await tool('Entrance');
      await click(0.6, 0.155); // snaps onto the north edge
      await click(0.8, 0.145);
      s = await state();
      assert.equal(s.project.site.entrance.a.y, Math.max(...ys), 'entrance snapped onto the water boundary');
      assert.notEqual(s.project.site.entrance.a.x, s.project.site.entrance.b.x);

      await tool('Obstacle');
      await click(0.5, 0.5);
      await click(0.52, 0.5);
      await click(0.51, 0.47);
      await page.keyboard.press('Enter');
      s = await state();
      assert.equal(s.project.site.obstacles.length, 1);
      await tool('Select');
    });

    await step('generate layouts and compare them', async () => {
      await generate();
      await page.getByTestId('alternative').first().waitFor();
      const count = await page.getByTestId('alternative').count();
      assert.ok(count >= 2, `expected several alternatives, got ${count}`);
      await page.getByTestId('comparison').waitFor();
      const s = await state();
      assert.ok(s.project.layouts[0].stats.totalBerths > 0);
      assert.equal(s.project.layouts[0].stats.issueCounts.error, 0);
    });

    let berthsBefore;
    await step('remove a berth from the canvas; the layout is marked as manually edited', async () => {
      let s = await state();
      const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      berthsBefore = layout.stats.totalBerths;
      const p = toScreen(s, centre(layout.berths[2].slot));
      await page.mouse.click(p.x, p.y);
      await page.getByRole('button', { name: 'Remove berth' }).click();
      s = await state();
      const edited = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      assert.equal(edited.stats.totalBerths, berthsBefore - 1);
      assert.equal(edited.modified, true);
      assert.ok((await page.getByTestId('alternative').first().textContent()).includes('Manually edited'));
    });

    await step('move a pier by dragging; issues update; undo restores it', async () => {
      let s = await state();
      const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      const pier = layout.piers[layout.piers.length > 1 ? 1 : 0];
      const mid = { x: (pier.start.x + pier.end.x) / 2, y: (pier.start.y + pier.end.y) / 2 };
      const p = toScreen(s, mid);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(p.x + i * 4, p.y);
      await page.mouse.up();
      s = await state();
      const moved = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      const movedPier = moved.piers.find((x) => x.id === pier.id);
      const shift = Math.hypot(movedPier.start.x - pier.start.x, movedPier.start.y - pier.start.y);
      assert.ok(shift > 2, `pier moved by ${shift.toFixed(2)} m`);
      assert.ok(moved.issues.length > layout.issues.length, 'moving a pier off its place raises issues');
      await page.getByTestId('issues').waitFor();
      // The whole drag is one undo step.
      await page.getByRole('button', { name: 'Undo' }).click();
      s = await state();
      const back = s.project.layouts.find((l) => l.id === s.selectedLayoutId).piers.find((x) => x.id === pier.id);
      assert.deepEqual(back.start, pier.start);
    });

    let savedFile;
    let savedProject;
    await step('save to JSON', async () => {
      savedFile = await download('Save');
      const file = JSON.parse(fs.readFileSync(savedFile, 'utf8'));
      assert.equal(file.app, 'marina-layout-planner');
      assert.equal(file.disclaimer, DISCLAIMER);
      assert.ok(file.project.layouts.length >= 2);
      savedProject = (await state()).project;
    });

    await step('a page reload restores the autosaved project', async () => {
      await page.waitForTimeout(700); // autosave is debounced
      await page.reload({ waitUntil: 'networkidle' });
      const s = await state();
      assert.deepEqual(s.project, savedProject);
    });

    await step('New clears the project; Open restores it from the file', async () => {
      await page.getByRole('button', { name: 'New', exact: true }).click();
      assert.equal((await state()).project.layouts.length, 0);
      await page.getByTestId('open-file').setInputFiles(savedFile);
      await page.getByTestId('alternative').first().waitFor();
      const s = await state();
      assert.deepEqual(s.project, savedProject);
      const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      assert.equal(layout.stats.totalBerths, berthsBefore - 1);
    });

    await step('export PNG and CSV', async () => {
      const png = fs.readFileSync(await download('Export PNG'));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.ok(png.length > 20000, `PNG is ${png.length} bytes`);
      const csv = fs.readFileSync(await download('Export CSV'), 'utf8');
      assert.ok(csv.includes(DISCLAIMER));
      assert.ok(csv.includes('Total berths'));
      assert.ok(csv.includes('Berth,Pier,Side,Boat class,Status'));
    });

    await step('editing a point changes the site and shows the Regenerate hint', async () => {
      await tool('Edit points');
      let s = await state();
      const before = s.project.site.water[2];
      const p = toScreen(s, before);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x - 20, p.y + 15, { steps: 4 });
      await page.mouse.up();
      s = await state();
      assert.notDeepEqual(s.project.site.water[2], before);
      assert.equal(await page.getByRole('status').textContent(), 'Inputs have changed since the layouts were generated.');
      await page.getByRole('button', { name: 'Undo' }).click();
      assert.deepEqual((await state()).project.site.water[2], before);
      await tool('Select');
    });

    await step('measure tool shows the distance between two clicks', async () => {
      await tool('Measure');
      await click(0.3, 0.3);
      await click(0.5, 0.3);
      const s = await state();
      const expected = Math.hypot(s.draft[1].x - s.draft[0].x, s.draft[1].y - s.draft[0].y);
      const text = await page.getByText(/^Distance:/).textContent();
      assert.ok(text.includes(expected.toFixed(1)), `${text} should show ${expected.toFixed(1)}`);
      await tool('Select');
    });

    await step('background image with two-point calibration', async () => {
      const png = path.join(outDir, 'bg.png');
      // 1 × 1 pixel PNG.
      fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
      await page.locator('summary', { hasText: 'Background' }).click();
      await page.getByTestId('background-file').setInputFiles(png);
      await page.getByRole('button', { name: 'Calibrate scale' }).waitFor();
      const before = (await state()).project.background.metresPerPixel;
      await page.getByRole('button', { name: 'Calibrate scale' }).click();
      await click(0.3, 0.6);
      await click(0.5, 0.6);
      const s = await state();
      const shown = Math.hypot(s.draft[1].x - s.draft[0].x, s.draft[1].y - s.draft[0].y);
      await page.getByLabel('Real distance (m)').fill('25');
      await page.getByRole('button', { name: 'Apply scale' }).click();
      const after = (await state()).project.background.metresPerPixel;
      assert.ok(Math.abs(after - (before * 25) / shown) < 1e-9);
      await page.getByRole('button', { name: 'Remove image' }).click();
      assert.equal((await state()).project.background, null);
    });

    await step('both demo projects give at least 3 alternatives in under 2 seconds, computed in a Web Worker (U23)', async () => {
      for (const id of ['rectBasin', 'irregularBay']) {
        await page.getByRole('combobox', { name: 'Load example' }).selectOption(id);
        const { ms, async } = await page.evaluate(async () => {
          const store = window.__marina;
          const t0 = performance.now();
          store.getState().generate();
          // U23: the worker computes while the page keeps running.
          const async = store.getState().generating;
          await new Promise((resolve) => {
            const check = () => (store.getState().generating ? setTimeout(check, 5) : resolve());
            check();
          });
          return { ms: performance.now() - t0, async };
        });
        assert.ok(async, 'generation runs in a Web Worker');
        const s = await state();
        console.log(`        ${id}: ${s.project.layouts.length} alternatives in ${ms.toFixed(0)} ms`);
        assert.ok(s.project.layouts.length >= 3);
        assert.ok(ms < 2000, `${id} took ${ms.toFixed(0)} ms`);
        // No errors; the only warning a generated layout may carry is the one about
        // berths left out as unreachable.
        for (const l of s.project.layouts) {
          assert.equal(l.stats.issueCounts.error, 0);
          assert.deepEqual(l.issues.map((i) => i.code), l.unreachableRemoved > 0 ? ['BERTHS_LEFT_OUT_UNREACHABLE'] : []);
          assert.equal(l.feasibility, l.unreachableRemoved > 0 ? 'geometricOK' : 'operationalOK');
        }
      }
      await page.screenshot({ path: path.join(outDir, 'app.png') });
      // Cancel (U23): the alternatives stay as they were.
      const cancelled = await page.evaluate(() => {
        const store = window.__marina;
        const before = store.getState().project.layouts.map((l) => l.id).join();
        store.getState().generate();
        const running = store.getState().generating;
        store.getState().cancelGeneration();
        return { running, after: store.getState().generating, same: store.getState().project.layouts.map((l) => l.id).join() === before };
      });
      assert.deepEqual(cancelled, { running: true, after: false, same: true });
    });

    await step('berth types: Y-boom (booms and fingers) and stern buoy (D33–D35)', async () => {
      await page.getByRole('combobox', { name: 'Load example' }).selectOption('rectBasin');
      await page.getByRole('combobox', { name: 'Berth type', exact: true }).first().selectOption('yBoom');
      await generate();
      const s = await state();
      const best = s.project.layouts[0];
      assert.ok(best.berths.every((b) => b.type === 'yBoom'), 'all berths are Y-boom berths');
      assert.ok(best.fingers.some((f) => f.kind === 'boom') && best.fingers.some((f) => !f.kind), 'booms and fingers');
      assert.equal(best.stats.issueCounts.error, 0);
      // Stern buoys (D35): no fingers; each buoy at boat length + design depth, inside its slot.
      await page.getByRole('combobox', { name: 'Berth type', exact: true }).first().selectOption('sternBuoy');
      await generate();
      const sb = (await state()).project.layouts[0];
      assert.equal(sb.fingers.length, 0);
      assert.ok(sb.berths.length > 0 && sb.berths.every((b) => b.type === 'sternBuoy' && b.buoy), 'stern-buoy berths with buoys');
      assert.equal(sb.stats.issueCounts.error, 0);
      // Stern-buoy sizing (D36): a weight column (empty = estimated from the length), the sinker
      // method; the anchoring plan lists the buoys and their heaviest sinker.
      await page.waitForFunction(() => window.__marina.getState().builtInPriceList !== null, null, { timeout: 10000 });
      const weight = page.getByRole('textbox', { name: 'Weight (t): 5 m', exact: true });
      assert.equal(await weight.getAttribute('placeholder'), '≈1.3');
      await weight.fill('1.5');
      await page.waitForFunction(() => window.__marina.getState().project.boatClasses.find((c) => c.name === '5 m').weight === 1.5);
      const buoys = page.getByText('Stern buoys', { exact: true });
      await buoys.scrollIntoViewIfNeeded();
      assert.ok(await buoys.isVisible());
      const sinker = () => page.getByText('Heaviest buoy sinker', { exact: true }).locator('xpath=following-sibling::span').textContent();
      // Default: Båtunionen's table (D37); 3 × boat weight is far heavier; an exposed harbour one size up.
      const byTable = await sinker();
      await page.getByText('Anchoring parameters', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Stern-buoy sinker' }).selectOption('factor');
      await page.waitForFunction(() => window.__marina.getState().project.anchoring.buoySinkerMethod === 'factor');
      const byFactor = await sinker();
      const kg = (text) => Number(text.replace(/[^\d]/g, ''));
      assert.ok(kg(byFactor) > kg(byTable), `factor ${byFactor} vs table ${byTable}`);
      await page.getByRole('combobox', { name: 'Stern-buoy sinker' }).selectOption('table');
      await page.getByLabel('Exposed harbour (one size up)').check();
      await page.waitForFunction(() => window.__marina.getState().project.anchoring.buoyExposed === true);
      // The 12 m class already uses the last row, so the heaviest sinker stays; the plan says so.
      assert.ok(kg(await sinker()) >= kg(byTable), 'exposed: no lighter sinkers');
      assert.ok(await page.getByTestId('anchoring-issues').getByText(/one row up for an exposed harbour/).first().isVisible());
      await page.getByLabel('Exposed harbour (one size up)').uncheck();
      await page.getByText('Anchoring parameters', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Berth type', exact: true }).first().selectOption('finger');
    });

    await step('access pontoon in front of a quay wall: piers start from its edge, shore chains at its gangways hold it (D21, D28, D32)', async () => {
      await page.getByRole('combobox', { name: 'Load example' }).selectOption('rectBasin');
      await tool('Access pontoon');
      let s = await state();
      // The demo shore runs along y = 0; the pontoon centreline 2.5 m off it, 3 m wide.
      for (const p of [{ x: 20, y: 2.5 }, { x: 200, y: 2.5 }]) {
        const q = toScreen(s, p);
        await page.mouse.click(q.x, q.y);
      }
      s = await state();
      const [pontoon] = s.project.site.accessPontoons;
      assert.ok(pontoon, 'pontoon drawn');
      assert.ok(Math.abs(pontoon.start.y - 2.5) < 0.6 && Math.abs(pontoon.end.y - 2.5) < 0.6);
      await generate();
      s = await state();
      assert.ok(s.project.layouts.length >= 1);
      const edge = Math.max(pontoon.start.y, pontoon.end.y) + pontoon.width / 2;
      const best = s.project.layouts[0];
      assert.ok(best.stats.accessPontoonLength > 170);
      // Every pier between the pontoon's ends starts at its outer edge.
      const between = best.piers.filter((p) => p.start.x > pontoon.start.x + 2 && p.start.x < pontoon.end.x - 2);
      assert.ok(between.length > 0);
      for (const p of between) assert.ok(Math.abs(p.start.y - edge) < 0.6, `pier ${p.id} starts at y = ${p.start.y}`);
      // Held off the wall by two shore chains at its gangway (D28).
      await page.waitForFunction(() => window.__marina.getState().builtInPriceList !== null, null, { timeout: 10000 });
      const fixings = page.getByText('Wall fixings of shore chains', { exact: true });
      await fixings.scrollIntoViewIfNeeded();
      assert.equal(await fixings.locator('xpath=following-sibling::span').textContent(), '2');
      // Two gangways placed by hand (D32): 2 shore chains each.
      await page.getByLabel(`Gangways at (m from its first point) (${pontoon.id})`, { exact: true }).fill('20; 150');
      await page.waitForFunction(() => (window.__marina.getState().project.site.accessPontoons[0].gangways ?? []).length === 2);
      assert.equal(await fixings.locator('xpath=following-sibling::span').textContent(), '4');
      await page.screenshot({ path: path.join(outDir, 'access-pontoon.png') });
    });

    await step('delete a pier, draw a new one with "Add pier" and fill its sides (D22)', async () => {
      let s = await state();
      const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      const pier = layout.piers.find((p) => !p.locked);
      await page.evaluate((id) => window.__marina.getState().select({ kind: 'pier', id }), pier.id);
      await page.getByRole('button', { name: 'Delete pier', exact: true }).click();
      s = await state();
      assert.ok(!s.project.layouts.find((l) => l.id === s.selectedLayoutId).piers.some((p) => p.id === pier.id));
      await page.getByRole('button', { name: 'Add pier', exact: true }).click();
      for (const p of [pier.start, pier.end]) {
        const q = toScreen(s, p);
        await page.mouse.click(q.x, q.y);
      }
      s = await state();
      const edited = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      const added = edited.piers.find((p) => p.origin === 'manual');
      assert.ok(added, 'pier added');
      assert.equal(s.selection.id, added.id);
      await page.getByRole('button', { name: 'Fill left side', exact: true }).click();
      await page.getByRole('button', { name: 'Fill right side', exact: true }).click();
      s = await state();
      const filled = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
      assert.ok(filled.berths.filter((b) => b.pierId === added.id).length > 0);
      await page.screenshot({ path: path.join(outDir, 'add-pier.png') });
    });

    await step('anchoring plan and cost estimate from the built-in price list; legend and grouped warnings; BOM and price list export (D23, D24, U21, U22)', async () => {
      await page.getByRole('combobox', { name: 'Load example' }).selectOption('rectBasin');
      await generate();
      // The built-in price list is loaded at start-up.
      await page.waitForFunction(() => window.__marina.getState().builtInPriceList !== null, null, { timeout: 10000 });
      const total = page.getByText('Total VAT 0 %', { exact: true });
      await total.scrollIntoViewIfNeeded();
      assert.ok(await total.isVisible());
      assert.ok(await page.getByText('Anchor lines', { exact: true }).isVisible());
      // Legend (U22): closed until opened; lists the anchoring symbols while that layer is on.
      await page.getByRole('button', { name: '▸ Legend', exact: true }).click();
      const legend = page.getByTestId('legend');
      assert.ok(await legend.getByText('Concrete anchor', { exact: true }).isVisible());
      assert.ok(await legend.getByText('Gangway', { exact: true }).isVisible());
      await page.getByRole('button', { name: '▾ Legend', exact: true }).click();
      // Grouped warnings (U21): one row for the many "several anchors" lines, expandable.
      const groupToggle = page.getByTestId('anchoring-issues').getByRole('button', { name: /similar – show all$/ }).first();
      await groupToggle.scrollIntoViewIfNeeded();
      await groupToggle.click();
      assert.ok(await page.getByTestId('anchoring-issues').getByRole('button', { name: 'hide', exact: true }).first().isVisible());
      const bom = await download('Export bill of materials (.xlsx)');
      assert.match(path.basename(bom), /^Rectangular-basin-L\d+-bom\.xlsx$/);
      assert.ok(fs.statSync(bom).size > 2000);
      assert.equal(fs.readFileSync(bom).subarray(0, 2).toString(), 'PK'); // a zip container
      const list = await download('Download price list (.xlsx)');
      assert.ok(fs.statSync(list).size > 10000);
      // Importing the downloaded list keeps the totals.
      const before = await page.getByText('Total VAT 0 %', { exact: true }).locator('xpath=following-sibling::span').textContent();
      await page.getByTestId('import-price-list').setInputFiles(list);
      await page.getByText('(imported)').first().waitFor();
      const after = await page.getByText('Total VAT 0 %', { exact: true }).locator('xpath=following-sibling::span').textContent();
      assert.equal(after, before);
      await page.getByRole('button', { name: 'Use built-in', exact: true }).click();
      await page.screenshot({ path: path.join(outDir, 'cost.png') });
    });

    await step('anchor type: wedge anchors need lighter anchors than blocks; splay angle; reset keeps site values and type (I59, U19, D25)', async () => {
      const largest = async () => {
        const text = await page.getByText('Largest anchor needed', { exact: true }).locator('xpath=following-sibling::span').textContent();
        return Number(text.replace(/[^\d]/g, ''));
      };
      const blockKg = await largest();
      await page.getByText('Anchoring parameters', { exact: true }).click();
      await page.getByRole('combobox', { name: 'Anchor type' }).selectOption('wedge');
      await page.waitForFunction(() => window.__marina.getState().project.anchoring.anchorType === 'wedge');
      const wedgeKg = await largest();
      assert.ok(wedgeKg > 0 && wedgeKg < blockKg, `wedge ${wedgeKg} kg should be below block ${blockKg} kg`);
      await page.getByLabel('Design water depth (m)', { exact: true }).fill('6');
      await page.getByLabel('Drag coefficient', { exact: true }).fill('1.2');
      // Square chains leave the wind along the piers unheld (D25).
      await page.getByLabel('Chain splay from square to the pier (°)', { exact: true }).fill('0');
      await page.waitForFunction(() => window.__marina.getState().project.anchoring.splayAngle === 0);
      await page.getByRole('button', { name: 'Reset factors to defaults', exact: true }).click();
      const a = await page.evaluate(() => window.__marina.getState().project.anchoring);
      assert.equal(a.depth, 6);
      assert.equal(a.dragCoefficient, 1.6);
      assert.equal(a.splayAngle, 45);
      assert.equal(a.anchorType, 'wedge');
      await page.getByRole('combobox', { name: 'Anchor type' }).selectOption('block');
      await page.getByText('Anchoring parameters', { exact: true }).click();
    });

    await step('report of the selected alternative: printable, and a real PDF from it (U24)', async () => {
      await page.getByRole('button', { name: 'Report (PDF)', exact: true }).click();
      const frame = page.frameLocator('iframe[data-testid="report-frame"]');
      await frame.getByRole('heading', { name: 'Sources and assumptions' }).waitFor({ state: 'attached' });
      const html = await page.evaluate(() => document.querySelector('iframe[data-testid="report-frame"]').contentDocument.documentElement.outerHTML);
      assert.ok(html.includes('Preliminary geometric study'), 'disclaimer in the report');
      assert.ok(html.includes('<img class="map" src="data:image/png'), 'map image in the report');
      // What the browser's "Save as PDF" gives: print the same HTML to a PDF file.
      const pdfPage = await page.context().newPage();
      await pdfPage.setContent(html, { waitUntil: 'load' });
      const file = path.join(outDir, 'report.pdf');
      await pdfPage.pdf({ path: file, format: 'A4', printBackground: true });
      await pdfPage.close();
      const pdf = fs.readFileSync(file);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      console.log(`        report.pdf: ${pages} pages, ${Math.round(pdf.length / 1024)} kB`);
      assert.ok(pages >= 2, `expected several pages, got ${pages}`);
    });

    await step('wave screening: fetches by direction sector and winds give waves, criteria and the bad directions (D40, D47)', async () => {
      await page.getByRole('button', { name: 'Waves', exact: true }).click();
      const tool = page.getByTestId('wave-tool');
      await tool.waitFor();
      assert.ok(await tool.getByText(/^Enter a fetch \(m\) for at least one direction/).isVisible());
      assert.equal(await tool.getByTestId('wave-results').locator('tbody tr').count(), 8);
      await tool.getByLabel('Fetch (m) E', { exact: true }).fill('2000');
      await tool.getByLabel('Fetch (m) S', { exact: true }).fill('600');
      await tool.getByLabel('Common wind once a year (m/s)').fill('15');
      await tool.getByLabel('Common wind once in 50 years (m/s)').fill('22');
      await page.waitForFunction(() => window.__marina.getState().project.waves.wind50 === 22);
      const w0 = await page.evaluate(() => window.__marina.getState().project.waves);
      assert.deepEqual(w0.sectors.map((x) => x.fetch), [0, 0, 2000, 0, 600, 0, 0, 0]);
      assert.equal(w0.criteria, 'as3962');
      await tool.getByTestId('wave-checks').waitFor();
      assert.match(await tool.locator('tr[data-sector="E"]').textContent(), /Exceeds|OK/);
      const advice = await tool.getByTestId('wave-advice').textContent();
      assert.match(advice, /floating wave attenuator|no wave protection|fixed breakwater/);
      // D48: a direction exceeds the criteria, so Marinetek's floating breakwaters are compared.
      assert.match(await tool.getByTestId('breakwater').textContent(), /Proposed type: Marinetek|None of Marinetek/);
      // D41: wind climate from Open-Meteo (mocked: the test must not depend on the network or its quota).
      const requests = [];
      await page.route('https://archive-api.open-meteo.com/**', (route) => {
        const url = new URL(route.request().url());
        requests.push(url.searchParams.get('start_date'));
        const start = Date.parse(`${url.searchParams.get('start_date')}T00:00:00Z`) / 1000;
        const end = Date.parse(`${url.searchParams.get('end_date')}T23:00:00Z`) / 1000;
        const time = [];
        const speed = [];
        const dir = [];
        for (let t = start, k = 0; t <= end; t += 3600, k++) {
          time.push(t);
          dir.push((k * 37) % 360);
          speed.push(4 + 10 * Math.sin(k / 97) ** 2 + (k % 1009 === 0 ? 8 : 0));
        }
        route.fulfill({ json: { latitude: 60.25, longitude: 25.0, hourly: { time, wind_speed_10m: speed, wind_direction_10m: dir } } });
      });
      await tool.getByLabel('Position').fill('60.15, 24.95');
      await tool.getByLabel('First year').fill('2016');
      await tool.getByLabel('Last year').fill('2024');
      await tool.getByRole('button', { name: 'Fetch wind data', exact: true }).click();
      await tool.getByTestId('wind-rose').waitFor({ timeout: 20000 });
      assert.deepEqual(requests, ['2016-01-01', '2021-01-01']);
      assert.equal(await tool.getByTestId('wind-sectors').locator('tbody tr').count(), 16);
      // D47: the sectors now take their winds from the climate (largest of the three 22.5° sectors).
      const w = await page.evaluate(() => window.__marina.getState().project.waves);
      assert.equal(w.climate.startYear, 2016);
      assert.ok((await tool.locator('tr[data-sector="E"] td[title*="from the wind climate"]').count()) >= 1);
      await page.unroute('https://archive-api.open-meteo.com/**');
      await page.screenshot({ path: path.join(outDir, 'waves.png'), fullPage: true });
      await tool.getByRole('button', { name: 'Close', exact: true }).click();
      assert.equal(await page.getByTestId('wave-tool').count(), 0);
    });

    await step('language toggle', async () => {
      await page.getByRole('button', { name: 'FI', exact: true }).click();
      assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Venesataman asettelusuunnittelu');
      await page.getByRole('button', { name: 'EN', exact: true }).click();
    });

    assert.deepEqual(errors, [], 'no errors in the browser console');
    console.log(`\n${steps.length} steps passed. Files written to ${outDir}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(`\nFAILED after ${steps.length} steps:\n`, error);
  process.exit(1);
});
