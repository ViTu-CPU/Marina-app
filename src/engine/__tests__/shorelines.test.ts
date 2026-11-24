/**
 * Several separate pieces of shoreline (D69): drawn one after another, edited and deleted one by
 * one, kept in the project file, and used everywhere the shoreline is: pier connection, generator,
 * anchoring, gangways.
 */
import { describe, expect, it } from 'vitest';
import { anchoringPlan, DEFAULT_ANCHORING, landDistance } from '../anchoring';
import { DEFAULT_BOAT_CLASSES, DEFAULT_OBJECTIVE, DEFAULT_PARAMS } from '../defaults';
import { generateLayouts, shoreSections } from '../generate';
import type { Site } from '../model';
import { pierShoreLink, shorelinesOf } from '../site';
import { IssueCode } from '../validate';
import { createAppStore } from '../../state/store';
import { parseProject, serializeProject } from '../../state/projectFile';
import { deleteSiteObject, moveVertex, sitePaths } from '../../ui/tools/sitePaths';

/** A basin 200 × 120 m: quays on the west and east banks only; the south edge is not shore. */
const twoBanks: Site = {
  water: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }],
  shoreline: [{ x: 0, y: 0 }, { x: 0, y: 120 }],
  shorelines: [[{ x: 200, y: 0 }, { x: 200, y: 120 }]],
  entrance: { a: { x: 60, y: 120 }, b: { x: 140, y: 120 } },
  obstacles: [],
  zones: [],
};

describe('several shorelines (D69)', () => {
  it('all pieces count; a piece of fewer than two points does not', () => {
    expect(shorelinesOf(twoBanks)).toHaveLength(2);
    expect(shorelinesOf({ shoreline: [], shorelines: [[{ x: 0, y: 0 }]] })).toHaveLength(0);
    // Sections never join two pieces: the gap between the banks is no shore.
    const sections = shoreSections(shorelinesOf(twoBanks));
    expect(sections.map((s) => [Math.round(s.bearing), Math.round(s.length)])).toEqual([
      [0, 120],
      [0, 120],
    ]);
  });

  it('a pier reaches the shore from either bank', () => {
    const east = { start: { x: 196, y: 60 }, end: { x: 150, y: 60 }, width: 3 };
    expect(pierShoreLink(east, twoBanks, 6)?.kind).toBe('gangway');
    expect(pierShoreLink(east, { ...twoBanks, shorelines: [] }, 6)).toBeNull();
  });

  it('the generator builds piers from both banks, all connected to the shore', () => {
    const r = generateLayouts({ site: twoBanks, boatClasses: DEFAULT_BOAT_CLASSES, params: DEFAULT_PARAMS, objective: DEFAULT_OBJECTIVE });
    expect(r.diagnostics).toEqual([]);
    const sides = new Set(r.layouts.flatMap((l) => l.piers.map((p) => (p.start.x < 100 ? 'west' : 'east'))));
    expect(sides).toEqual(new Set(['west', 'east']));
    for (const l of r.layouts) expect(l.issues.some((i) => i.code === IssueCode.PIER_NOT_CONNECTED_TO_SHORE)).toBe(false);
    // With only the west bank, no pier starts from the east.
    const west = generateLayouts({ site: { ...twoBanks, shorelines: [] }, boatClasses: DEFAULT_BOAT_CLASSES, params: DEFAULT_PARAMS, objective: DEFAULT_OBJECTIVE });
    expect(west.layouts.every((l) => l.piers.every((p) => p.start.x < 100))).toBe(true);
  });

  it('anchors keep off the land behind any piece', () => {
    expect(landDistance(twoBanks, { x: 190, y: 60 }, { x: 1, y: 0 }, 30)).toBeCloseTo(10, 9);
    const r = generateLayouts({ site: twoBanks, boatClasses: DEFAULT_BOAT_CLASSES, params: DEFAULT_PARAMS, objective: DEFAULT_OBJECTIVE });
    const layout = r.layouts[0]!;
    const plan = anchoringPlan({ layout, site: twoBanks, classes: DEFAULT_BOAT_CLASSES, params: DEFAULT_ANCHORING, priceList: { title: '', parameters: [], products: [] }, vatPct: 25.5 });
    // No chain to the seabed crosses either piece of shoreline; those that would were moved.
    for (const l of plan.lines.filter((x) => x.fixing === 'seabed' && x.role !== 'buoy')) {
      expect(landDistance(twoBanks, l.fix, { x: l.anchor.x - l.fix.x, y: l.anchor.y - l.fix.y }, 1)).toBeNull();
    }
    expect(plan.lines.some((x) => x.landed && x.fix.x > 100)).toBe(true);
  });
});

describe('drawing, editing and saving several shorelines (D69)', () => {
  const draw = (store: ReturnType<typeof createAppStore>, points: { x: number; y: number }[]) => {
    store.getState().setTool('shoreline');
    for (const p of points) store.getState().addDraftPoint(p, 0.5);
    store.getState().finishDraft();
  };

  it('a second shoreline is added as a piece of its own; one undo step each', () => {
    const store = createAppStore();
    draw(store, [{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    draw(store, [{ x: 200, y: 0 }, { x: 200, y: 100 }]);
    const site = store.getState().project.site;
    expect(site.shoreline).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    expect(site.shorelines).toEqual([[{ x: 200, y: 0 }, { x: 200, y: 100 }]]);
    store.getState().undo();
    expect(store.getState().project.site.shorelines ?? []).toEqual([]);
  });

  it('each piece is edited and deleted on its own; the next takes the place of a deleted first one', () => {
    const keys = sitePaths(twoBanks).map((p) => p.key);
    expect(keys).toContain('shoreline:1');
    const moved = moveVertex(twoBanks, 'shoreline:1', 0, { x: 195, y: 0 });
    expect(moved.shorelines![0]![0]).toEqual({ x: 195, y: 0 });
    expect(moved.shoreline).toEqual(twoBanks.shoreline);
    expect(deleteSiteObject(twoBanks, 'shoreline:1').shoreline).toEqual(twoBanks.shoreline);
    expect(deleteSiteObject(twoBanks, 'shoreline:1').shorelines).toBeUndefined();
    const first = deleteSiteObject(twoBanks, 'shoreline');
    expect(first.shoreline).toEqual(twoBanks.shorelines![0]);
    expect(first.shorelines).toBeUndefined();
  });

  it('is kept in the project file; older files have one shoreline', () => {
    const store = createAppStore();
    store.getState().updateSite(() => twoBanks);
    const parsed = parseProject(serializeProject(store.getState().project));
    expect(parsed.ok && parsed.project.site.shorelines).toEqual(twoBanks.shorelines);
    const file = JSON.parse(serializeProject(store.getState().project));
    delete file.project.site.shorelines;
    const old = parseProject(JSON.stringify(file));
    expect(old.ok && old.project.site.shorelines).toBeUndefined();
  });
});
