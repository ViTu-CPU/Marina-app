/**
 * I102: the anchor model against the owner's reference drawing (Iisalmen sataman aallonmurtaja,
 * asennuspiirustus 23.1.2023, D46): 100 m of 20 m pontoons, chains from the joints at about 45° to
 * 20 anchors of 3 200 kg, 22 mm Grade 40 chains of 30 m. Its design depth, fetches, loads and
 * anchor type are not known (D56), so the case uses the tool's defaults (design depth 4 m,
 * Assumption) with Porovesi's water levels (SYKE 0406100: high and low water 1.4 m, I95) and the
 * built-in price list, and only shows the order of the anchors.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePriceListFile } from '../../catalog/priceList';
import { anchoringPlan, DEFAULT_ANCHORING, type AnchoringParams } from '../anchoring';
import type { PriceList } from '../catalog';
import type { MainPier, Site } from '../model';

const parsed = parsePriceListFile(readFileSync('data/hinnasto.xlsx'), 'hinnasto.xlsx');
if (!parsed.ok) throw new Error(parsed.errors.join('; '));
const LIST: PriceList = parsed.priceList;

// 5 × 19.90 m Premier 2700 modules (D44), the shore 30 m away (no shore chains), waves from the east.
const pier: MainPier = { id: 'P1', start: { x: 0, y: 0 }, end: { x: 0, y: 99.5 }, width: 2.7, locked: false, origin: 'manual' };
const site: Site = {
  water: [{ x: -300, y: -30 }, { x: 300, y: -30 }, { x: 300, y: 300 }, { x: -300, y: 300 }],
  shoreline: [{ x: -300, y: -30 }, { x: 300, y: -30 }],
  entrance: { a: { x: -300, y: 300 }, b: { x: 300, y: 300 } },
  obstacles: [],
  zones: [],
};
const plan = (over: Partial<AnchoringParams>, waves: boolean, hs50?: number) =>
  anchoringPlan({
    layout: { piers: [pier], berths: [] },
    site,
    classes: [],
    params: { ...DEFAULT_ANCHORING, highWater: 1.4, lowWater: 1.4, maxAnchorMass: 1e9, ...over },
    priceList: LIST,
    vatPct: 25.5,
    pierFreeboard: 0.56,
    moduleLengths: [19.9, 16.05, 12.2],
    ...(waves ? { waves: { from: [90], exceeding: [], ...(hs50 === undefined ? {} : { hs50: [hs50] }) } } : {}),
  });
const largest = (p: ReturnType<typeof plan>) => Math.max(...p.lines.filter((l) => l.fixing === 'seabed').map((l) => l.requiredAnchorKg));

describe('reference drawing, Iisalmi (I102)', () => {
  const blockWind = plan({ seabed: 'clay', anchorType: 'block' }, false);
  const blockWaves = plan({ seabed: 'clay', anchorType: 'block' }, true);
  const wedgeWaves = plan({ seabed: 'clay', anchorType: 'wedge' }, true);

  it('has as many chains as the drawing', () => {
    expect(blockWind.lines.filter((l) => l.fixing === 'seabed')).toHaveLength(20);
  });

  it('plain blocks on clay for wind alone are of the drawing’s 3 200 kg', () => {
    expect(largest(blockWind)).toBeGreaterThan(3000);
    expect(largest(blockWind)).toBeLessThan(4000);
  });

  it('with the 2 kN/m wave load, wedges are of the drawing’s 3 200 kg and blocks about nine times heavier', () => {
    expect(blockWaves.loads[0]!.lateralKn).toBeCloseTo(27 + 2 * 99.5, 0);
    expect(largest(wedgeWaves)).toBeGreaterThan(3000);
    expect(largest(wedgeWaves)).toBeLessThan(3500);
    expect(largest(blockWaves) / largest(wedgeWaves)).toBeGreaterThan(8);
    expect(largest(blockWaves) / largest(wedgeWaves)).toBeLessThan(10);
  });

  it('with the wave load from the wave height (I104), lake waves bring plain blocks back towards the drawing', () => {
    // A lake of 1–2 km fetch, 50-year wind 15–20 m/s (10 min), 4 m deep: Hm0 0.24–0.48 m (CEM, waves.ts).
    expect(largest(plan({ seabed: 'clay', anchorType: 'block' }, true, 0.25))).toBeCloseTo(largest(blockWind), 6);
    const mid = largest(plan({ seabed: 'clay', anchorType: 'block' }, true, 0.4));
    expect(mid).toBeGreaterThan(largest(blockWind));
    expect(mid).toBeLessThan(largest(blockWaves) / 2);
    // From 0.6 m the full 2 kN/m, as before.
    expect(largest(plan({ seabed: 'clay', anchorType: 'block' }, true, 0.6))).toBeCloseTo(largest(blockWaves), 6);
  });

  it('the comparison and the note say the same', () => {
    expect(blockWaves.comparison?.other.anchorType).toBe('wedge');
    expect(blockWaves.comparison!.other.maxKg).toBeCloseTo(largest(wedgeWaves), 6);
    expect(blockWaves.comparison!.current.maxKg).toBeCloseTo(largest(blockWaves), 6);
    expect(blockWaves.issues.some((i) => i.code === 'WAVE_LOAD_PLAIN_BLOCKS')).toBe(true);
    expect(blockWind.issues.some((i) => i.code === 'WAVE_LOAD_PLAIN_BLOCKS')).toBe(false);
    expect(wedgeWaves.issues.some((i) => i.code === 'WAVE_LOAD_PLAIN_BLOCKS')).toBe(false);
    expect(wedgeWaves.comparison?.other.anchorType).toBe('block');
  });
});
