/** D65: rescue ladders, safety equipment posts and power and water pedestals on the piers. */
import { describe, expect, it } from 'vitest';
import { costEstimate, resolveChoices, equipmentSpacing } from '../bom';
import type { PriceList, Product } from '../catalog';
import { DEFAULT_COST, DEFAULT_PARAMS } from '../defaults';
import { EQUIPMENT_DEFAULTS, equipmentPlan, evenlySpaced } from '../equipment';
import type { Berth, MainPier, Site } from '../model';

const pier: MainPier = { id: 'P1', start: { x: 0, y: 0 }, end: { x: 0, y: 100 }, width: 3, locked: false, origin: 'manual' };
const site: Site = {
  water: [{ x: -100, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 200 }, { x: -100, y: 200 }],
  shoreline: [{ x: -100, y: -10 }, { x: 100, y: -10 }],
  entrance: { a: { x: -100, y: 200 }, b: { x: 100, y: 200 } },
  obstacles: [],
  zones: [],
};
/** Ten 4 m wide berths on the left of P1 from 20 m to 60 m. */
const berths: Berth[] = Array.from({ length: 10 }, (_, i) => ({
  id: `P1-L${i + 1}`,
  pierId: 'P1',
  side: 'left',
  boatClassId: 'b',
  slot: [{ x: -1.5, y: 20 + 4 * i }, { x: -1.5, y: 24 + 4 * i }, { x: -12, y: 24 + 4 * i }, { x: -12, y: 20 + 4 * i }],
  boat: [],
  removed: false,
  issues: [],
}));

describe('equipment on the piers (D65)', () => {
  it('Top Marine’s spacings: ladders every 40 m, posts every 80 m; pedestals 4 berths each (assumption)', () => {
    expect(EQUIPMENT_DEFAULTS).toEqual({ ladderSpacing: 40, safetyPostSpacing: 80, berthsPerPedestal: 4 });
  });

  it('evenly spaced: ⌈L / s⌉ items at the middles of equal parts, no point farther than s / 2', () => {
    expect(evenlySpaced(0, 100, 40)).toEqual([100 / 6, 50, 500 / 6]);
    expect(evenlySpaced(0, 80, 80)).toEqual([40]);
    expect(evenlySpaced(0, 30, 40)).toEqual([15]);
    expect(evenlySpaced(0, 100, 0)).toEqual([]);
    for (const [L, s] of [[100, 40], [161, 40], [79, 80], [250, 80]] as const) {
      const t = evenlySpaced(0, L, s);
      const worst = Math.max(t[0]!, L - t.at(-1)!, ...t.slice(1).map((x, i) => (x - t[i]!) / 2));
      expect(worst).toBeLessThanOrEqual(s / 2 + 1e-9);
    }
  });

  it('a 100 m pier: 3 ladders at its edges, 2 safety posts and 3 pedestals over its berthed part', () => {
    const plan = equipmentPlan({ piers: [pier], berths }, site, EQUIPMENT_DEFAULTS);
    const of = (k: string) => plan.items.filter((x) => x.kind === k);
    expect(of('ladder').map((x) => [x.t, x.at.x])).toEqual([
      [100 / 6, 1.5],
      [50, -1.5],
      [500 / 6, 1.5],
    ]);
    expect(of('safetyPost').map((x) => [x.t, x.at.x])).toEqual([
      [25, 0],
      [75, 0],
    ]);
    // ⌈10 / 4⌉ = 3 pedestals over 20–60 m.
    expect(of('pedestal').map((x) => x.t)).toEqual([20 + 40 / 6, 40, 20 + 200 / 6]);
    expect(plan.berths).toBe(10);
    const none = equipmentPlan({ piers: [pier], berths }, site, { ladderSpacing: 0, safetyPostSpacing: 0, berthsPerPedestal: 0 });
    expect(none.items).toEqual([]);
  });

  it('an access pontoon: ladders on the edge away from the shore, no pedestals', () => {
    const withAccess: Site = { ...site, accessPontoons: [{ id: 'AP1', start: { x: -50, y: -7 }, end: { x: 50, y: -7 }, width: 3 }] };
    const plan = equipmentPlan({ piers: [], berths: [] }, withAccess, EQUIPMENT_DEFAULTS);
    expect(plan.items.filter((x) => x.kind === 'ladder').every((x) => x.at.y === -5.5)).toBe(true);
    expect(plan.items.filter((x) => x.kind === 'safetyPost')).toHaveLength(2);
    expect(plan.items.some((x) => x.kind === 'pedestal')).toBe(false);
  });

  it('the estimate: spacings from the price list, the pedestal with a socket for each berth it serves', () => {
    const product = (id: string, category: Product['category'], name: string, price: number): Product =>
      ({ id, category, name, price, supplier: '', series: '', code: '', unit: 'pcs', priceIncludesVat: false, marginPct: 0, sourceUrl: '', sourceDate: '', note: '' }) as unknown as Product;
    const list: PriceList = {
      title: 't',
      parameters: [
        { key: 'ladder_spacing_m', value: 50, unit: 'm', description: '', source: '' },
        { key: 'berths_per_power_pedestal', value: 4, unit: 'berths', description: '', source: '' },
      ],
      products: [product('p2', 'power', 'Pedestal 2×16A + water', 1000), product('p4', 'power', 'Pedestal 4×16A + water', 1200), product('lad', 'ladder', 'Ladder', 300), product('sp', 'safety_post', 'Post', 1000)],
    };
    expect(equipmentSpacing(list)).toEqual({ ladderSpacing: 50, safetyPostSpacing: 80, berthsPerPedestal: 4 });
    const choices = resolveChoices(list, DEFAULT_COST, DEFAULT_PARAMS);
    const e = costEstimate({ layout: { piers: [pier], fingers: [], berths }, site, priceList: list, choices, anchoring: { lines: [], piles: [], loads: [], issues: [] } });
    const qty = (id: string) => e.lines.find((l) => l.productId === id)?.orderQuantity ?? 0;
    expect([qty('lad'), qty('sp'), qty('p4'), qty('p2')]).toEqual([2, 2, 3, 0]);
    expect(e.notes).toContain('Power and water pedestals: cabling, water pipes and the connections ashore are not priced.');
  });
});
