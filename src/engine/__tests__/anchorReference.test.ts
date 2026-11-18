/**
 * I102, D64: the anchor model against the owner's reference drawing (Iisalmen sataman aallonmurtaja,
 * asennuspiirustus 23.1.2023, D46): 100 m of 20 m pontoons, chains from the joints at about 45° to
 * 20 anchors of 3 200 kg, 22 mm Grade 40 chains of 30 m. Its design depth, loads and seabed are not
 * known (D56), so the case uses the defaults (design depth 4 m, Assumption) with Porovesi's water
 * levels (SYKE 0406100: high and low water 1.4 m, I95) and the built-in price list.
 *
 * Since D64 the sizing is the owner's specification: the minimum wave line load of 2 kN/m (× 1.5)
 * applies to every pontoon and the anchor holds by friction only. The plan has the drawing's 20
 * chains; the friction model asks for many times the drawing's 3 200 kg, as the spec's own
 * Appendix B note says for 10 t anchors ("the tool does not hide this difference").
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

// 5 × 19.90 m Premier 2700 modules (D44), the shore 30 m away (no shore chains).
const pier: MainPier = { id: 'P1', start: { x: 0, y: 0 }, end: { x: 0, y: 99.5 }, width: 2.7, locked: false, origin: 'manual' };
const site: Site = {
  water: [{ x: -300, y: -30 }, { x: 300, y: -30 }, { x: 300, y: 300 }, { x: -300, y: 300 }],
  shoreline: [{ x: -300, y: -30 }, { x: 300, y: -30 }],
  entrance: { a: { x: -300, y: 300 }, b: { x: 300, y: 300 } },
  obstacles: [],
  zones: [],
};
const plan = (over: Partial<AnchoringParams> = {}) =>
  anchoringPlan({
    layout: { piers: [pier], berths: [] },
    site,
    classes: [],
    params: { ...DEFAULT_ANCHORING, highWater: 1.4, lowWater: 1.4, ...over },
    priceList: LIST,
    vatPct: 25.5,
    pierFreeboard: 0.56,
    moduleLengths: [19.9, 16.05, 12.2],
  });
const largest = (p: ReturnType<typeof plan>) => Math.max(...p.lines.filter((l) => l.fixing === 'seabed').map((l) => l.requiredAnchorKg));

describe('reference drawing, Iisalmi (I102, D64)', () => {
  const r = plan();

  it('has as many chains as the drawing', () => {
    expect(r.lines.filter((l) => l.fixing === 'seabed')).toHaveLength(20);
  });

  it('the spec’s loads: wind on the pontoon and the 2 kN/m minimum wave load × 1.5 across', () => {
    const across = r.loads[0]!.cases.find((c) => c.id === 'perp+')!;
    // qz = 0.0006 · 22² = 0.2904 kPa; 2.0 · 99.5 · 0.56 m² of pontoon side.
    expect(across.wind).toBeCloseTo(0.2904 * 2 * 99.5 * 0.56, 6);
    expect(across.wave).toBeCloseTo(2 * 99.5, 6);
    expect(across.F_uls).toBeCloseTo(across.wind + 1.5 * across.wave, 6);
  });

  it('by friction alone on medium clay the anchors come out many times the drawing’s 3 200 kg: pile anchors', () => {
    expect(largest(r)).toBeGreaterThan(5 * 3200);
    expect(r.lines.filter((l) => l.fixing === 'seabed').every((l) => l.status === 'PILE')).toBe(true);
  });

  it('only a documented capacity factor or a wave analysis brings them down', () => {
    // A wave analysis giving less than 2 kN/m (with its warning) and a measured embedment (capacity factor with a source).
    const analysed = plan({ waveMin: 0.3, capacityFactor: 2, capacityFactorSource: 'example: measured embedment' });
    expect(largest(analysed)).toBeLessThan(largest(r) / 3);
    expect(analysed.issues.map((i) => i.code)).toContain('WAVE_MIN_BELOW_AS3962');
    expect(analysed.issues.map((i) => i.code)).not.toContain('CAPACITY_FACTOR_WITHOUT_SOURCE');
  });
});
