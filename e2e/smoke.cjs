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

/**
 * I113: a vector tile (Mapbox Vector Tile 2.1) whose `ocean` layer holds the part of the lake
 * 60.14–60.16 N, 24.92–24.99 E that lies in tile z/x/y (clipped to the tile with a small buffer).
 */
async function lakeTile(z, x, y) {
  const { PbfWriter } = await import('pbf');
  const n = 2 ** z;
  const tx = (lon) => ((lon + 180) / 360) * n - x;
  const ty = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n - y;
  const clamp = (v) => Math.round(Math.max(-0.05, Math.min(1.05, v)) * 4096);
  const [x0, x1, y0, y1] = [clamp(tx(24.92)), clamp(tx(24.99)), clamp(ty(60.16)), clamp(ty(60.14))];
  const pbf = new PbfWriter();
  if (x1 > x0 && y1 > y0) {
    const zz = (v) => (v << 1) ^ (v >> 31);
    const geometry = [9, zz(x0), zz(y0), 26, zz(x1 - x0), 0, 0, zz(y1 - y0), zz(x0 - x1), 0, 15];
    pbf.writeMessage(3, () => {
      pbf.writeVarintField(15, 2);
      pbf.writeStringField(1, 'ocean');
      pbf.writeMessage(2, () => {
        pbf.writeVarintField(3, 3);
        pbf.writePackedVarint(4, geometry);
      });
      pbf.writeVarintField(5, 4096);
    });
  }
  return Buffer.from(pbf.finish());
}

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
      // Far enough sideways to run into the neighbouring rows (how far depends on the generated layout).
      for (let i = 1; i <= 16; i++) await page.mouse.move(p.x + i * 6, p.y);
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

    await step('export PNG, CSV and DXF', async () => {
      const png = fs.readFileSync(await download('Export PNG'));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.ok(png.length > 20000, `PNG is ${png.length} bytes`);
      const csv = fs.readFileSync(await download('Export CSV'), 'utf8');
      assert.ok(csv.includes(DISCLAIMER));
      assert.ok(csv.includes('Total berths'));
      assert.ok(csv.includes('Berth,Pier,Side,Boat class,Status'));
      // D61, I111: DXF (R12) with the product library as blocks.
      const dxf = fs.readFileSync(await download('Export DXF'), 'utf8');
      assert.ok(dxf.startsWith('0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009'));
      assert.ok(dxf.includes('\r\nBLOCK\r\n') && dxf.includes('\r\nINSERT\r\n') && dxf.includes('PRODUCT LIBRARY'));
      assert.ok(dxf.endsWith('0\r\nEOF\r\n'));
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

    await step('berth types: Y-boom (booms and fingers), mixed and stern buoy (D33–D35, D51)', async () => {
      await page.getByRole('combobox', { name: 'Load example' }).selectOption('rectBasin');
      await page.getByRole('combobox', { name: 'Berth type', exact: true }).first().selectOption('yBoom');
      await generate();
      const s = await state();
      const best = s.project.layouts[0];
      assert.ok(best.berths.every((b) => b.type === 'yBoom'), 'all berths are Y-boom berths');
      assert.ok(best.fingers.some((f) => f.kind === 'boom') && best.fingers.some((f) => !f.kind), 'booms and fingers');
      assert.equal(best.stats.issueCounts.error, 0);
      // Mixed (D51): booms between the small boats and fingers for the large ones, in the same layout.
      await page.getByRole('combobox', { name: 'Berth type', exact: true }).first().selectOption('mixed');
      await generate();
      const mixed = (await state()).project.layouts[0];
      assert.ok(mixed.berths.every((b) => b.type === 'mixed'), 'mixed berths');
      assert.ok(mixed.fingers.some((f) => f.kind === 'boom') && mixed.fingers.some((f) => !f.kind), 'booms and fingers');
      assert.equal(mixed.stats.issueCounts.error, 0);
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
      // Piers beside the pontoon reach the shore by their own gangway, with 2 shore chains each (D49).
      const onPontoon = (p) =>
        Math.abs(p.start.y - edge) < 0.6 && p.start.x >= Math.min(pontoon.start.x, pontoon.end.x) - 0.1 && p.start.x <= Math.max(pontoon.start.x, pontoon.end.x) + 0.1;
      const ownGangways = best.piers.filter((p) => !onPontoon(p)).length;
      assert.equal(await fixings.locator('xpath=following-sibling::span').textContent(), String(2 + 2 * ownGangways));
      // Two gangways placed by hand (D32): 2 shore chains each.
      await page.getByLabel(`Gangways at (m from its first point) (${pontoon.id})`, { exact: true }).fill('20; 150');
      await page.waitForFunction(() => (window.__marina.getState().project.site.accessPontoons[0].gangways ?? []).length === 2);
      assert.equal(await fixings.locator('xpath=following-sibling::span').textContent(), String(4 + 2 * ownGangways));
      // I122: the piers starting from it hold it with their chains; it has no chains of its own into the berths.
      assert.match(await page.getByTestId('anchoring-issues').textContent(), new RegExp(`Access pontoon ${pontoon.id} \\(D28\\): off the wall it is held by two shore chains at each gangway and by the piers attached to it`));
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
      // D44, D49: piers of Premier 2700 modules, 4 m off the south shore (y = 0), reached by a gangway.
      const rect = await state();
      const best = rect.project.layouts.find((l) => l.id === rect.selectedLayoutId);
      for (const pier of best.piers) {
        assert.equal(pier.width, 2.7);
        assert.ok(Math.min(pier.start.y, pier.end.y) >= 3.9, `pier ${pier.id} starts ${Math.min(pier.start.y, pier.end.y)} m from the shore`);
      }
      // D52: AS 3962-2001 advisory checks, e.g. the gangway width by the berths it serves.
      await page.getByText(/^AS 3962-2001 checks \(advisory\)/).click();
      assert.match(await page.getByTestId('as3962').textContent(), /Table 3\.3/);
      await page.getByText(/^AS 3962-2001 checks \(advisory\)/).click();
      const total = page.getByText(/^Total VAT 0 %( \(excludes \d+ unpriced items?, see list\))?$/);
      await total.scrollIntoViewIfNeeded();
      assert.ok(await total.isVisible());
      assert.ok(await page.getByText('Anchor lines', { exact: true }).isVisible());
      // Legend (U22): closed until opened; lists the anchoring symbols while that layer is on.
      await page.getByRole('button', { name: '▸ Legend', exact: true }).click();
      const legend = page.getByTestId('legend');
      assert.ok(await legend.getByText('Concrete anchor', { exact: true }).isVisible());
      assert.ok(await legend.getByText('Gangway', { exact: true }).isVisible());
      // D65: rescue ladders, safety equipment posts and pedestals on their own layer, in the bill of materials.
      for (const label of ['Rescue ladder', 'Safety equipment post', 'Power and water pedestal']) assert.ok(await legend.getByText(label, { exact: true }).isVisible(), label);
      await page.getByRole('button', { name: '▾ Legend', exact: true }).click();
      const bomText = await page.getByTestId('bom-lines').textContent();
      for (const name of ['Turvaporras', 'Pelastusvälinepylväs', 'Sähköpylväs RM Platinum 4×16A + vesi']) assert.ok(bomText.includes(name), name);
      // D64: the spec's required text, the status and the unpriced pile anchors (the demo's lines on clay need more than 5 t).
      assert.match(await page.getByTestId('mooring-disclaimer').textContent(), /^Preliminary sizing\. Does not replace the designer's calculation/);
      assert.match(await page.getByTestId('anchoring-status').textContent(), /^Anchoring status\d+ lines with concrete anchors, \d+ with pile anchors$/);
      assert.match(await page.getByTestId('unpriced-items').textContent(), /Pile anchor – length and section by geotechnical design/);
      // Grouped warnings (U21): one row for the pile lines of the many piers, expandable.
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
      const before = await page.getByText(/^Total VAT 0 %( \(excludes \d+ unpriced items?, see list\))?$/).locator('xpath=following-sibling::span').textContent();
      await page.getByTestId('import-price-list').setInputFiles(list);
      await page.getByText('(imported)').first().waitFor();
      const after = await page.getByText(/^Total VAT 0 %( \(excludes \d+ unpriced items?, see list\))?$/).locator('xpath=following-sibling::span').textContent();
      assert.equal(after, before);
      await page.getByRole('button', { name: 'Use built-in', exact: true }).click();
      await page.screenshot({ path: path.join(outDir, 'cost.png') });
    });

    await step('mooring sizing of the spec: seabed and loads change the anchors; load and line tables; data package; reset keeps site values (D64, U19, D25)', async () => {
      const status = async () => (await page.getByTestId('anchoring-status').textContent()).match(/(\d+) lines with concrete anchors, (\d+) with pile anchors/).slice(1).map(Number);
      const [okClay] = await status();
      assert.equal(okClay, 0);
      await page.getByText('Anchoring parameters', { exact: true }).click();
      // Gravel, a light design wind and a wave analysis below the minimum: concrete anchors hold some lines.
      await page.getByTestId('seabed').selectOption('gravelCoarseSand');
      await page.getByLabel('Design wind, 30 s ULS (m/s)', { exact: true }).fill('12');
      await page.getByLabel('Minimum wave line load (kN/m)', { exact: true }).fill('0.2');
      await page.waitForFunction(() => window.__marina.getState().project.anchoring.waveMin === 0.2);
      const [okGravel] = await status();
      assert.ok(okGravel > 0, `some lines should hold with concrete anchors, got ${okGravel}`);
      assert.ok(await page.getByTestId('anchoring-issues').getByText(/Minimum wave line load 0\.2 kN\/m < 2 kN\/m/).first().isVisible());
      // The load table and the line table with the colours of the spec.
      await page.getByText('Loads per pontoon (kN)', { exact: true }).click();
      assert.ok((await page.getByTestId('mooring-loads').locator('tbody tr').count()) >= 4);
      await page.getByText(/^Lines \(\d+\)$/).click();
      assert.ok((await page.getByTestId('mooring-lines').locator('.bg-green-100, .bg-yellow-100, .bg-red-100').count()) > 0);
      // The data package for the manufacturer of an elastic mooring (spec §7).
      const pkg = await download('Data package for the manufacturer (.json)');
      const json = JSON.parse(fs.readFileSync(pkg, 'utf8'));
      assert.equal(json.seabed.type, 'gravelCoarseSand');
      assert.ok(json.loads_kN.length > 0);
      // Square chains leave the load along the piers unresisted: an error (spec §4).
      await page.getByLabel('Design water depth (m)', { exact: true }).fill('6');
      await page.getByLabel('Chain splay from square to the pier (°)', { exact: true }).fill('0');
      await page.waitForFunction(() => window.__marina.getState().project.anchoring.splayAngle === 0);
      assert.ok(await page.getByTestId('anchoring-issues').getByText(/No anchor leg resists this load direction/).first().isVisible());
      await page.getByRole('button', { name: 'Reset factors to defaults', exact: true }).click();
      const a = await page.evaluate(() => window.__marina.getState().project.anchoring);
      assert.equal(a.depth, 6);
      assert.equal(a.seabed, 'gravelCoarseSand');
      assert.equal(a.windSpeed, 12);
      assert.equal(a.splayAngle, 45);
      assert.equal(a.waveMin, 2);
      await page.getByTestId('seabed').selectOption('mediumClay');
      await page.getByLabel('Design wind, 30 s ULS (m/s)', { exact: true }).fill('22');
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

    await step('wave screening: fetches by direction sector and winds give waves, criteria, the bad directions, FMI station winds, depths along the fetches, the shelter behind a breakwater and the printed wave report (D40, D47, D58, I108, I110, U29)', async () => {
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
      // D58, I107: with a breakwater drawn east of the piers the shelter of the piers is listed.
      await page.evaluate(() => {
        const s = window.__marina.getState();
        const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId);
        const xs = layout.piers.flatMap((p) => [p.start.x, p.end.x]);
        const ys = layout.piers.flatMap((p) => [p.start.y, p.end.y]);
        const x = Math.max(...xs) + 10;
        s.updateSite((site) => ({ ...site, breakwaters: [{ id: 'breakwater-1', start: { x, y: Math.min(...ys) - 5 }, end: { x, y: Math.max(...ys) + 5 }, product: '3300K' }] }));
      });
      await tool.getByTestId('shelter').waitFor();
      assert.ok((await tool.getByTestId('shelter').locator('tbody tr').count()) > 0);
      await page.evaluate(() => window.__marina.getState().updateSite((site) => ({ ...site, breakwaters: [] })));
      await tool.getByTestId('shelter').waitFor({ state: 'detached' });
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
      // I121: the design depth was typed in (6 m), so the position does not start a depth lookup.
      const emodnetAsked = [];
      await page.route('https://rest.emodnet-bathymetry.eu/**', (route) => {
        emodnetAsked.push(route.request().url());
        route.fulfill({ json: new Array(1000).fill(-3.64) });
      });
      await tool.getByLabel('Position').fill('60.15, 24.95');
      await page.waitForTimeout(1200);
      const sd = await page.evaluate(() => window.__marina.getState().project);
      assert.deepEqual([emodnetAsked.length, sd.anchoring.depth, sd.siteDepth.auto], [0, 6, false]);
      await page.unroute('https://rest.emodnet-bathymetry.eu/**');
      await tool.getByLabel('First year', { exact: true }).fill('2016');
      await tool.getByLabel('Last year', { exact: true }).fill('2024');
      await tool.getByRole('button', { name: 'Fetch wind data', exact: true }).click();
      await tool.getByTestId('wind-rose').waitFor({ timeout: 20000 });
      assert.deepEqual(requests, ['2016-01-01', '2021-01-01']);
      assert.equal(await tool.getByTestId('wind-sectors').locator('tbody tr').count(), 16);
      // D47: the sectors now take their winds from the climate (largest of the three 22.5° sectors).
      const w = await page.evaluate(() => window.__marina.getState().project.waves);
      assert.equal(w.climate.startYear, 2016);
      assert.ok((await tool.locator('tr[data-sector="E"] td[title*="from the wind climate"]').count()) >= 1);
      await page.unroute('https://archive-api.open-meteo.com/**');
      // I108: FMI station observations (mocked): stations near the position, then a month per request.
      const fmiMonths = [];
      const point = (id, name, lat, lon) => `<gml:Point gml:id="point-${id}" srsDimension="2"><gml:name>${name}</gml:name><gml:pos>${lat} ${lon} </gml:pos></gml:Point>`;
      await page.route('https://opendata.fmi.fi/wfs?**', (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('storedquery_id') !== 'fmi::observations::weather::hourly::multipointcoverage') return route.fallback();
        let positions = '';
        let values = '';
        let points = '';
        if (url.searchParams.get('bbox')) {
          points = point('100996', 'Helsinki Harmaja', '60.10512', '24.97539') + point('100971', 'Helsinki Kaisaniemi', '60.17523', '24.94459');
          positions = '60.10512 24.97539  1763200000\n60.17523 24.94459  1763200000';
          values = '9.0 200.0\n4.0 190.0';
        } else {
          fmiMonths.push(url.searchParams.get('starttime'));
          points = point('100996', 'Helsinki Harmaja', '60.10512', '24.97539');
          const start = Date.parse(url.searchParams.get('starttime')) / 1000;
          const end = Date.parse(url.searchParams.get('endtime')) / 1000;
          const p = [];
          const v = [];
          for (let t = start, k = 0; t <= end; t += 3600, k++) {
            p.push(`60.10512 24.97539  ${t}`);
            v.push(`${(6 + 12 * Math.sin(k / 89) ** 2).toFixed(1)} ${(k * 41) % 360}.0`);
          }
          positions = p.join('\n');
          values = v.join('\n');
        }
        route.fulfill({ contentType: 'text/xml', body: `<wfs:FeatureCollection>${points}<gmlcov:positions>${positions}</gmlcov:positions><gml:doubleOrNilReasonTupleList>${values}</gml:doubleOrNilReasonTupleList></wfs:FeatureCollection>` });
      });
      const stationSection = tool.getByTestId('station-wind');
      await stationSection.getByLabel('First year of the observations').fill('2023');
      await stationSection.getByLabel('Last year of the observations').fill('2024');
      await stationSection.getByRole('button', { name: 'Find FMI stations', exact: true }).click();
      await stationSection.getByTestId('station-list').waitFor();
      // Nearest first; the island station is the one to use on the coast.
      assert.match(await stationSection.getByTestId('station-list').textContent(), /Helsinki Kaisaniemi.*Helsinki Harmaja/);
      await stationSection.getByTestId('station-list').locator('li', { hasText: 'Harmaja' }).getByRole('button', { name: 'Fetch' }).click();
      await stationSection.getByTestId('station-compare').waitFor({ timeout: 20000 });
      assert.equal(fmiMonths.length, 24);
      const ws = await page.evaluate(() => window.__marina.getState().project.waves);
      assert.equal(ws.stationClimate.startYear, 2023);
      assert.equal(ws.stationClimate.averagingS, 600);
      assert.equal(ws.climateChoice, 'larger');
      assert.equal(await stationSection.getByTestId('station-compare').locator('tbody tr').count(), 16);
      await page.unroute('https://opendata.fmi.fi/wfs?**');
      // D47, I113: fetches from OpenStreetMap water polygons in vector tiles (tiles.versatiles.org mocked):
      // a lake 60.14–60.16 N, 24.92–24.99 E around the position, land elsewhere.
      // First a tile server that does not answer: the status counts tiles and seconds; Cancel stops the lookup.
      const fetchesBefore = await page.evaluate(() => window.__marina.getState().project.waves.sectors.map((x) => x.fetch));
      await page.route('https://tiles.versatiles.org/**', () => {});
      await tool.getByRole('button', { name: 'Find fetches from the map', exact: true }).click();
      await tool.getByTestId('auto-fetch-status').filter({ hasText: /Reading the map… 0 map tiles, \d+ s/ }).waitFor();
      await tool.getByRole('button', { name: 'Cancel', exact: true }).click();
      await tool.getByText('Lookup cancelled; the fetches were not changed.').waitFor();
      assert.deepEqual(await page.evaluate(() => window.__marina.getState().project.waves.sectors.map((x) => x.fetch)), fetchesBefore);
      assert.equal(await page.evaluate(() => window.__marina.getState().project.waves.autoFetch), null);
      await page.unroute('https://tiles.versatiles.org/**');
      const tilesAsked = [];
      await page.route('https://tiles.versatiles.org/tiles/osm/**', async (route) => {
        const [z, x, y] = route.request().url().split('/').slice(-3).map(Number);
        tilesAsked.push(`${z}/${x}/${y}`);
        route.fulfill({ status: 200, contentType: 'application/vnd.mapbox-vector-tile', body: await lakeTile(z, x, y) });
      });
      await tool.getByRole('button', { name: 'Find fetches from the map', exact: true }).click();
      await page.waitForFunction(() => window.__marina.getState().project.waves.autoFetch !== null);
      const af = await page.evaluate(() => window.__marina.getState().project.waves);
      assert.equal(af.autoFetch.distances.length, 72);
      assert.match(af.autoFetch.source, /VersaTiles/);
      assert.ok(tilesAsked.length > 0 && tilesAsked.every((k) => /^1[34]\//.test(k)), tilesAsked.join(' '));
      assert.match(await tool.getByTestId('auto-fetch-found').innerText(), new RegExp(`Shore met by 72 / 72 rays · ${tilesAsked.length} map tiles read`));
      // N: 1.1 km to 60.16 N (longest ray at ±20°: 1.2 km); E: 2.2 km to 24.99 E (longest about 2.4 km).
      const fetchN = af.sectors[0].fetch;
      const fetchE = af.sectors[2].fetch;
      assert.ok(fetchN > 1100 && fetchN < 1300, `N ${fetchN}`);
      assert.ok(fetchE > 2200 && fetchE < 2500, `E ${fetchE}`);
      assert.ok(af.sectors.every((x) => x.fetch > 0));
      await page.unroute('https://tiles.versatiles.org/tiles/osm/**');
      // I110: depths along the rays (EMODnet mocked: 4.2 m everywhere; SYKE not asked).
      await page.route('https://rest.emodnet-bathymetry.eu/**', (route) => route.fulfill({ json: new Array(1000).fill(-4.2) }));
      await tool.getByRole('button', { name: 'Find depths along the fetches', exact: true }).click();
      await tool.getByTestId('auto-depth-result').waitFor();
      const wd = await page.evaluate(() => window.__marina.getState().project.waves);
      assert.deepEqual(wd.sectors.map((x) => x.depth), new Array(8).fill(4.2));
      assert.equal(wd.autoDepth.sectors[0].source, 'emodnet');
      await page.unroute('https://rest.emodnet-bathymetry.eu/**');
      // U29: the wave window prints a report of its own (wind rose, fetch figure, depths) and a PDF from it.
      await tool.getByRole('button', { name: 'Print', exact: true }).click();
      await page.frameLocator('iframe[data-testid="report-frame"]').getByRole('heading', { name: 'Fetch and depth lookups' }).waitFor({ state: 'attached' });
      const waveHtml = await page.evaluate(() => document.querySelector('iframe[data-testid="report-frame"]').contentDocument.documentElement.outerHTML);
      for (const text of ['Wave screening report (preliminary)', 'Preliminary geometric study', 'data-testid="wind-rose"', 'aria-label="Fetch per direction"', '<polygon', 'EMODnet', 'Helsinki Harmaja', 'Alternative: ']) {
        assert.ok(waveHtml.includes(text), `wave report: ${text}`);
      }
      const wavePdfPage = await page.context().newPage();
      await wavePdfPage.setContent(waveHtml, { waitUntil: 'load' });
      const waveFile = path.join(outDir, 'waves-report.pdf');
      await wavePdfPage.pdf({ path: waveFile, format: 'A4', printBackground: true });
      await wavePdfPage.close();
      const wavePdf = fs.readFileSync(waveFile);
      assert.equal(wavePdf.subarray(0, 5).toString(), '%PDF-');
      console.log(`        waves-report.pdf: ${(wavePdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length} pages, ${Math.round(wavePdf.length / 1024)} kB`);
      await page.screenshot({ path: path.join(outDir, 'waves.png'), fullPage: true });
      await tool.getByRole('button', { name: 'Close', exact: true }).click();
      assert.equal(await page.getByTestId('wave-tool').count(), 0);
    });

    await step('water levels from a gauge near the position: FMI mareograph (mocked), extremes and normal range (D50)', async () => {
      const el = (pos, param, value) =>
        `<BsWfs:BsWfsElement gml:id="x"><BsWfs:Location><gml:Point><gml:pos>${pos} </gml:pos></gml:Point></BsWfs:Location><BsWfs:ParameterName>${param}</BsWfs:ParameterName><BsWfs:ParameterValue>${value}</BsWfs:ParameterValue></BsWfs:BsWfsElement>`;
      const params = ['WLEVP1YAVG_P30Y_AVG', 'WLEVP1YMAX_P30Y_AVG', 'WLEVP1YMAX_P30Y_MAX', 'WLEVP1YMIN_P30Y_AVG', 'WLEVP1YMIN_P30Y_MIN'];
      const simple = [20, 977, 1512, -594, -927].map((v, i) => el('60.15371 24.95622', params[i], v)).join('');
      await page.route('https://opendata.fmi.fi/**', (route) =>
        route.fulfill({
          contentType: 'text/xml',
          body: route.request().url().includes('timevaluepair') ? '<gml:Point gml:id="p"><gml:name>Helsinki Kaivopuisto</gml:name><gml:pos>60.15371 24.95622 </gml:pos></gml:Point>' : simple,
        }),
      );
      await page.route('https://rajapinnat.ymparisto.fi/**', (route) => route.fulfill({ json: { value: [] } }));
      await page.getByText('Anchoring parameters', { exact: true }).click();
      // I121: ticked again, the design depth follows the mean depth around the position (EMODnet mocked: 3.64 m).
      await page.route('https://rest.emodnet-bathymetry.eu/**', (route) => route.fulfill({ json: new Array(1000).fill(-3.64) }));
      await page.getByTestId('site-depth-auto').check();
      await page.getByTestId('site-depth-result').waitFor();
      const sd = await page.evaluate(() => window.__marina.getState().project);
      assert.equal(sd.anchoring.depth, 3.6);
      assert.deepEqual([sd.siteDepth.result.source, sd.siteDepth.result.radius, sd.siteDepth.auto], ['emodnet', 200, true]);
      assert.match(await page.getByTestId('site-depth-result').innerText(), /^Mean depth 3\.6 m \(samples 3\.6–3\.6 m; EMODnet; 100 % of the samples in water; within 200 m of 60\.1500, 24\.9500; \d{4}-\d{2}-\d{2}\) · used as the design depth$/);
      await page.unroute('https://rest.emodnet-bathymetry.eu/**');
      await page.getByRole('button', { name: 'Find water-level gauges', exact: true }).click();
      const box = page.getByTestId('water-levels');
      await box.getByText(/Helsinki Kaivopuisto/).waitFor();
      await box.getByRole('button', { name: 'Use', exact: true }).first().click();
      await page.waitForFunction(() => window.__marina.getState().project.waterLevels !== null);
      const a = await page.evaluate(() => window.__marina.getState().project);
      assert.equal(a.waterLevels.station, 'Helsinki Kaivopuisto');
      assert.deepEqual([a.anchoring.highWater, a.anchoring.lowWater, a.anchoring.normalHighWater, a.anchoring.normalLowWater], [1.5, 1, 1, 0.6]);
      assert.match(await box.textContent(), /Water levels from Helsinki Kaivopuisto/);
      await page.unroute('https://opendata.fmi.fi/**');
      await page.unroute('https://rajapinnat.ymparisto.fi/**');
      await page.getByText('Anchoring parameters', { exact: true }).click();
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
