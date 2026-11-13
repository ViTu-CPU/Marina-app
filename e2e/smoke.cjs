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
      return JSON.parse(JSON.stringify({ project: s.project, view: s.view, viewport: s.viewport, selectedLayoutId: s.selectedLayoutId, tool: s.tool, draft: s.draft }));
    });
    /** Screen position of a world point. */
    const toScreen = (s, p) => ({
      x: box.x + (p.x - s.view.cx) * s.view.zoom + s.viewport.width / 2,
      y: box.y - (p.y - s.view.cy) * s.view.zoom + s.viewport.height / 2,
    });
    const centre = (poly) => ({ x: poly.reduce((a, p) => a + p.x, 0) / poly.length, y: poly.reduce((a, p) => a + p.y, 0) / poly.length });
    const tool = (name) => page.getByRole('button', { name, exact: true }).click();
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
      await page.getByRole('button', { name: 'Generate', exact: true }).click();
      await page.getByTestId('alternative').first().waitFor();
      const count = await page.getByTestId('alternative').count();
      assert.ok(count >= 2, `expected several alternatives, got ${count}`);
      await page.getByTestId('comparison').waitFor();
      const s = await state();
      assert.ok(s.project.layouts[0].stats.totalBerths > 0);
      assert.equal(s.project.layouts[0].issues.length, 0);
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
      assert.ok(moved.issues.length > 0, 'moving a pier off the design pitch raises issues');
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
      await page.getByText('Background image').click();
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

    await step('both demo projects give at least 3 alternatives in under 2 seconds', async () => {
      for (const id of ['rectBasin', 'irregularBay']) {
        await page.getByRole('combobox', { name: 'Load example' }).selectOption(id);
        const ms = await page.evaluate(() => {
          const t0 = performance.now();
          window.__marina.getState().generate();
          return performance.now() - t0;
        });
        const s = await state();
        console.log(`        ${id}: ${s.project.layouts.length} alternatives in ${ms.toFixed(0)} ms`);
        assert.ok(s.project.layouts.length >= 3);
        assert.ok(ms < 2000, `${id} took ${ms.toFixed(0)} ms`);
        assert.ok(s.project.layouts.every((l) => l.issues.length === 0));
      }
      await page.screenshot({ path: path.join(outDir, 'app.png') });
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
