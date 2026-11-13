import { describe, expect, it } from 'vitest';
import { DEFAULT_BOAT_CLASSES } from '../../engine/defaults';
import { RECT_BASIN_SITE } from '../../engine/demos';
import type { Layout, Stats } from '../../engine/model';
import { createAppStore } from '../../state/store';
import { fitBounds, gridStep, niceStep, panBy, scaleBar, screenToWorld, visibleBounds, worldToScreen, zoomAt, type View } from '../../state/view';
import { bestIndices, comparisonRows } from '../compare';
import { buildCsv } from '../export/csv';
import { formatArea, formatCount, formatLength, formatPercent, formatRatio } from '../format';
import { calibrateBackground, placeBackground } from '../tools/background';
import { closesPolygon, siteSnapTargets, snapPoint } from '../tools/snap';

describe('number formatting (SPEC §3)', () => {
  it('lengths have 1 decimal, areas and counts are integers', () => {
    expect(formatLength(12)).toBe('12.0');
    expect(formatLength(148.04)).toBe('148.0');
    expect(formatLength(3.65)).toBe('3.7');
    expect(formatArea(28799.6)).toBe('28,800');
    expect(formatCount(264)).toBe('264');
    expect(formatRatio(1.29870)).toBe('1.30');
    expect(formatPercent(0.35)).toBe('35 %');
  });

  it('Finnish uses a decimal comma', () => {
    expect(formatLength(148.04, 'fi')).toBe('148,0');
    expect(formatArea(950, 'fi')).toBe('950');
  });
});

describe('view transform (SPEC §8: pan, zoom to cursor)', () => {
  const size = { width: 800, height: 600 };
  const view: View = { cx: 100, cy: 50, zoom: 4 };

  it('the view centre maps to the middle of the canvas and north is up', () => {
    expect(worldToScreen(view, size, { x: 100, y: 50 })).toEqual({ x: 400, y: 300 });
    // 10 m east and 10 m north → 40 px right and 40 px UP.
    expect(worldToScreen(view, size, { x: 110, y: 60 })).toEqual({ x: 440, y: 260 });
  });

  it('screenToWorld inverts worldToScreen', () => {
    const p = { x: 123.4, y: -56.7 };
    const back = screenToWorld(view, size, worldToScreen(view, size, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('zooming keeps the world point under the cursor fixed', () => {
    const cursor = { x: 650, y: 120 };
    const before = screenToWorld(view, size, cursor);
    const zoomed = zoomAt(view, size, cursor, 1.5);
    expect(zoomed.zoom).toBe(6);
    const after = screenToWorld(zoomed, size, cursor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('zoom is clamped', () => {
    expect(zoomAt(view, size, { x: 0, y: 0 }, 1e9).zoom).toBe(400);
    expect(zoomAt(view, size, { x: 0, y: 0 }, 1e-9).zoom).toBe(0.02);
  });

  it('dragging right and down moves the content with the cursor', () => {
    const panned = panBy(view, 40, 20);
    // The world point that was at the centre is now 40 px right and 20 px below it.
    expect(worldToScreen(panned, size, { x: 100, y: 50 })).toEqual({ x: 440, y: 320 });
  });

  it('fitBounds shows the whole box with padding', () => {
    const fitted = fitBounds({ minX: 0, minY: 0, maxX: 220, maxY: 140 }, size, 40);
    // Width limits: (800 − 80) / 220 = 3.27; height: (600 − 80) / 140 = 3.71.
    expect(fitted.zoom).toBeCloseTo(720 / 220, 9);
    expect(fitted.cx).toBe(110);
    expect(fitted.cy).toBe(70);
    const bounds = visibleBounds(fitted, size);
    expect(bounds.minX).toBeLessThan(0);
    expect(bounds.maxY).toBeGreaterThan(140);
  });

  it('grid steps and the scale bar use round numbers', () => {
    expect(niceStep(7)).toBe(10);
    expect(niceStep(10)).toBe(10);
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(23)).toBe(50);
    expect(gridStep(4)).toBe(10); // 40 px / 4 px per m = 10 m
    expect(gridStep(1)).toBe(50);
    // At 4 px/m a 160 px bar could show 40 m; the round value below that is 20 m.
    expect(scaleBar(4, 160)).toEqual({ metres: 20, pixels: 80 });
    expect(scaleBar(3.2, 160)).toEqual({ metres: 50, pixels: 160 });
    expect(scaleBar(0.5, 160)).toEqual({ metres: 200, pixels: 100 });
  });
});

describe('snapping (SPEC §8: snap to vertices)', () => {
  const targets = siteSnapTargets(RECT_BASIN_SITE);

  it('snaps to a vertex within the tolerance', () => {
    expect(snapPoint({ x: 219, y: 1.5 }, targets, 3)).toEqual({ point: { x: 220, y: 0 }, kind: 'vertex' });
  });

  it('otherwise snaps to the nearest point on the water boundary', () => {
    const snapped = snapPoint({ x: 100, y: 2 }, targets, 3);
    expect(snapped.kind).toBe('edge');
    expect(snapped.point).toEqual({ x: 100, y: 0 });
  });

  it('a vertex wins over an edge, and far points are left alone', () => {
    expect(snapPoint({ x: 2, y: 0.5 }, targets, 3).kind).toBe('vertex');
    expect(snapPoint({ x: 100, y: 50 }, targets, 3)).toEqual({ point: { x: 100, y: 50 }, kind: 'none' });
  });

  it('a polygon closes when the first point is clicked again, from three points on', () => {
    const draft = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    expect(closesPolygon(draft, { x: 0.5, y: 0.5 }, 1)).toBe(true);
    expect(closesPolygon(draft, { x: 5, y: 5 }, 1)).toBe(false);
    expect(closesPolygon(draft.slice(0, 2), { x: 0, y: 0 }, 1)).toBe(false);
  });
});

describe('background image (SPEC §3.2: two-point calibration)', () => {
  it('a new image is centred and spans the requested width', () => {
    const bg = placeBackground('data:image/png;base64,AA', { width: 1000, height: 500 }, { x: 100, y: 50 }, 200);
    expect(bg.metresPerPixel).toBe(0.2);
    // 200 m wide and 100 m high around (100, 50): top-left corner at (0, 100).
    expect(bg.origin).toEqual({ x: 0, y: 100 });
  });

  it('two points 100 px apart that are really 50 m apart give 0.5 m per pixel', () => {
    // At 1 m/px the two points are 100 m apart in world units.
    const bg = { dataUrl: 'data:image/png;base64,AA', origin: { x: 0, y: 0 }, metresPerPixel: 1, rotation: 0, opacity: 1 };
    const calibrated = calibrateBackground(bg, { x: 20, y: -30 }, { x: 120, y: -30 }, 50)!;
    expect(calibrated.metresPerPixel).toBe(0.5);
    // The first clicked point stays put: the origin moves halfway towards it.
    expect(calibrated.origin).toEqual({ x: 10, y: -15 });
    // The image pixel under the second point (100 px from the first) is now 50 m from it.
    expect(20 + 100 * calibrated.metresPerPixel).toBe(70);
  });

  it('works the same for a rotated image and rejects unusable input', () => {
    const bg = { dataUrl: 'data:image/png;base64,AA', origin: { x: 5, y: 5 }, metresPerPixel: 2, rotation: 30, opacity: 1 };
    const calibrated = calibrateBackground(bg, { x: 0, y: 0 }, { x: 30, y: 40 }, 25)!; // 50 m shown, 25 m real
    expect(calibrated.metresPerPixel).toBe(1);
    expect(calibrated.rotation).toBe(30);
    expect(calibrated.origin).toEqual({ x: 2.5, y: 2.5 });
    expect(calibrateBackground(bg, { x: 0, y: 0 }, { x: 0, y: 0 }, 25)).toBeNull();
    expect(calibrateBackground(bg, { x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBeNull();
  });
});

describe('comparison table (SPEC §8: best value per row highlighted)', () => {
  it('bestIndices marks the highest or lowest value, and nothing when all are equal', () => {
    expect(bestIndices([3, 7, 7, 1], 'higher')).toEqual([1, 2]);
    expect(bestIndices([3, 7, 7, 1], 'lower')).toEqual([3]);
    expect(bestIndices([5, 5, 5], 'higher')).toEqual([]);
    expect(bestIndices([5, 9], 'none')).toEqual([]);
    expect(bestIndices([5], 'higher')).toEqual([]);
  });

  const stats = (over: Partial<Stats>): Stats => ({
    totalBerths: 100,
    berthsByClass: { c5: 30, c7: 35, c9: 25, c12: 10 },
    mainPierLength: 200,
    fingerLength: 200,
    pontoonLength: 400,
    pontoonDeckArea: 800,
    fairwayArea: 5000,
    marinaWaterArea: 7000,
    freeWaterArea: 20000,
    berthsPer1000m2: 3.2,
    pontoonPerBerth: 4,
    mixDeviation: 0,
    issueCounts: { error: 0, warning: 0 },
    ...over,
  });
  const layout = (id: string, over: Partial<Stats>): Layout =>
    ({ id, name: id, strategy: 'A', piers: [], fingers: [], berths: [], fairways: [], feasibility: 'operationalOK', issues: [], stats: stats(over), score: 0, modified: false }) as Layout;

  it('more berths and free water are better; less pontoon and fewer issues are better', () => {
    const rows = comparisonRows(
      [layout('a', {}), layout('b', { totalBerths: 120, pontoonLength: 520.04, issueCounts: { error: 0, warning: 3 } })],
      DEFAULT_BOAT_CLASSES,
    );
    const row = (key: string) => rows.find((r) => 'key' in r.label && r.label.key === key)!;
    expect(row('stat.totalBerths').values).toEqual(['100', '120']);
    expect(row('stat.totalBerths').best).toEqual([1]);
    expect(row('stat.pontoonLength').values).toEqual(['400.0', '520.0']);
    expect(row('stat.pontoonLength').unit).toBe('m');
    expect(row('stat.pontoonLength').best).toEqual([0]);
    expect(row('stat.warnings').best).toEqual([0]);
    expect(row('stat.errors').best).toEqual([]); // equal
    expect(row('stat.mainPierLength').best).toEqual([]); // no "better" direction
    // One row per boat class follows the total.
    expect(rows.slice(1, 5).map((r) => ('text' in r.label ? r.label.text : ''))).toEqual(['5 m', '7 m', '9 m', '12 m']);
    expect(rows[1]!.values).toEqual(['30', '30']);
  });

  it('values that are displayed the same are both marked', () => {
    const rows = comparisonRows(
      [layout('a', { pontoonLength: 400.01 }), layout('b', { pontoonLength: 400.04 }), layout('c', { pontoonLength: 450 })],
      [],
    );
    expect(rows.find((r) => 'key' in r.label && r.label.key === 'stat.pontoonLength')!.best).toEqual([0, 1]);
  });
});

describe('CSV export (SPEC §8, §10)', () => {
  const store = createAppStore();
  store.getState().loadDemo('rectBasin');
  store.getState().generate();
  const project = store.getState().project;
  const selected = project.layouts[0]!;
  const csv = buildCsv(project, selected.id);
  /** Minimal CSV reader for the test: handles quoted cells with commas and doubled quotes. */
  const parseLine = (text: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else current += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') {
        cells.push(current);
        current = '';
      } else current += ch;
    }
    cells.push(current);
    return cells;
  };
  const rows = csv.trimEnd().split('\r\n').map(parseLine);

  it('starts with the title and the disclaimer', () => {
    expect(rows[0]![0]).toBe('Marina Layout Planner');
    expect(csv.split('\r\n')[1]).toBe(
      'Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.',
    );
    expect(rows[2]).toEqual(['Project', 'Rectangular basin']);
  });

  it('has one column per alternative with plain numbers', () => {
    const header = rows.find((r) => r[0] === 'Alternative')!;
    expect(header).toHaveLength(project.layouts.length + 1);
    expect(header.slice(1)).toEqual(project.layouts.map((l) => l.name));
    const total = rows.find((r) => r[0] === 'Total berths')!;
    expect(total.slice(1).map(Number)).toEqual(project.layouts.map((l) => l.stats.totalBerths));
    const free = rows.find((r) => r[0] === 'Free water (m²)')!;
    // No thousands separators: the value parses as a number.
    expect(Number(free[1])).toBe(Math.round(selected.stats.freeWaterArea));
    const pontoon = rows.find((r) => r[0] === 'Total pontoon (m)')!;
    expect(pontoon[1]).toBe(selected.stats.pontoonLength.toFixed(1));
  });

  it('lists the berths of the selected alternative', () => {
    const start = rows.findIndex((r) => r[0] === 'Berth');
    expect(rows[start]).toEqual(['Berth', 'Pier', 'Side', 'Boat class', 'Status']);
    expect(rows.length - start - 1).toBe(selected.berths.length);
    expect(rows[start + 1]![4]).toBe('In use');
  });

  it('quotes cells that contain commas or quotes', () => {
    const named = buildCsv({ ...project, name: 'Bay, "north"' }, null);
    expect(named).toContain('Project,"Bay, ""north"""');
    // Without a selected layout there is no berth list.
    expect(named).not.toContain('Berth,Pier');
  });
});
