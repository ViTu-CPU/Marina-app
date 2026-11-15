/**
 * Advisory checks against AS 3962-2001 *Guidelines for design of marinas* (DECISIONS D42, D52;
 * docs/RESEARCH.md §11). They do not change a layout's status and are not a compliance check:
 * the standard is a guideline (1.1 Note 1) and has been superseded by AS 3962:2020.
 */
import type { AnchoringParams } from './anchoring';
import { distance } from './geometry';
import type { BoatClass, Layout, Params, Site } from './model';
import { pierShoreLink } from './site';

export interface As3962Note {
  /** 'warning': the layout does not meet the guideline's value; 'info': something to check. */
  severity: 'warning' | 'info';
  code: string;
  clause: string;
  message: string;
  elementId?: string;
}

/** AS 3962-2001 Table 3.3: clear gangway width by the number of berths served. */
export function gangwayClearWidth(berths: number): number {
  if (berths <= 2) return 0.7;
  if (berths <= 10) return 0.9;
  if (berths <= 60) return 1.2;
  if (berths <= 120) return 1.5;
  return 1.8;
}

/** AS 3962-2001 3.5: minimum walkway width by its length. */
export const walkwayMinWidth = (length: number): number => (length > 200 ? 2.4 : length > 100 ? 1.8 : 1.5);

/**
 * AS 3962-2001 Table 3.1, yachts (the deepest column for boats up to 20 m; *"it is recommended that
 * the minimum water depth is based on requirements for yachts"*, 3.2.3): boat length → draught, m.
 * Shorter than 8 m takes the 8 m value (assumption, I100); longer than 50 m the 50 m value.
 */
const YACHT_DRAUGHT: readonly (readonly [number, number])[] = [
  [8, 1.5],
  [10, 1.8],
  [12, 2.0],
  [15, 2.5],
  [20, 2.9],
  [25, 3.0],
  [30, 3.4],
  [35, 3.8],
  [40, 4.2],
  [50, 4.2],
];

export function yachtDraught(length: number): number {
  const first = YACHT_DRAUGHT[0]!;
  if (length <= first[0]) return first[1];
  for (let i = 1; i < YACHT_DRAUGHT.length; i++) {
    const [l1, d1] = YACHT_DRAUGHT[i]!;
    const [l0, d0] = YACHT_DRAUGHT[i - 1]!;
    if (length <= l1) return d0 + ((d1 - d0) * (length - l0)) / (l1 - l0);
  }
  return YACHT_DRAUGHT[YACHT_DRAUGHT.length - 1]![1];
}

/** Gangway slope limits, rise over run (3.6.2): 1:3.5 for marinas, 1:3 for private pontoons. */
export const GANGWAY_MAX_SLOPE = 1 / 3.5;

export interface As3962Input {
  layout: Pick<Layout, 'piers' | 'berths' | 'fingers'>;
  site: Site;
  params: Params;
  classes: BoatClass[];
  anchoring: Pick<AnchoringParams, 'depth' | 'lowWater' | 'highWater' | 'seabed' | 'quayLevel'>;
  /** Freeboard of the pontoons, m (product, else the anchoring parameter). */
  freeboard: number;
  /** Largest once-a-year significant wave height of the wave screening, m (0 = none). */
  waveHeight: number;
}

const m = (x: number) => x.toFixed(1);

export function as3962Checks(input: As3962Input): As3962Note[] {
  const { layout, site, params, classes, anchoring: a } = input;
  const notes: As3962Note[] = [];
  const active = classes.filter((c) => layout.berths.some((b) => !b.removed && b.boatClassId === c.id));

  // 3.5 Walkways.
  for (const pier of layout.piers) {
    const length = distance(pier.start, pier.end);
    const min = walkwayMinWidth(length);
    if (pier.width < min - 1e-9) {
      notes.push({ severity: 'warning', code: 'AS_WALKWAY_WIDTH', clause: '3.5', elementId: pier.id, message: `${pier.id}: walkway ${m(pier.width)} m wide on ${m(length)} m; AS 3962 asks for at least ${m(min)} m (1.5 m; 1.8 m over 100 m; 2.4 m over 200 m), as clear width between cleats and other fittings.` });
    }
  }

  // 3.5 Fingers: length at least 0.8 L unless piled; width 900 mm uniform or tapered to 600 mm.
  if (params.fingerLengthRatio < 0.8 - 1e-9) {
    notes.push({ severity: 'warning', code: 'AS_FINGER_LENGTH', clause: '3.5', message: `Finger length ${params.fingerLengthRatio.toFixed(2)} × boat length; AS 3962 asks for at least 0.8 × the longest boat unless a mooring pile stands at the end of the finger.` });
  }
  if (params.fingerWidth < 0.6 - 1e-9) {
    notes.push({ severity: 'warning', code: 'AS_FINGER_WIDTH', clause: '3.5', message: `Finger width ${m(params.fingerWidth)} m; AS 3962: fingers 900 mm wide, or tapered to at least 600 mm.` });
  } else if (params.fingerWidth < 0.9 - 1e-9 && layout.fingers.some((f) => f.kind !== 'boom')) {
    notes.push({ severity: 'info', code: 'AS_FINGER_WIDTH', clause: '3.5', message: `Finger width ${params.fingerWidth.toFixed(2)} m: AS 3962 gives 900 mm for uniform fingers (tapered ones at least 600 mm). Booms are not walkable fingers; boats at booms are boarded from the walkway.` });
  }

  // 3.3.2 Berth width: single berth beam + 1.0 m, double berth 2 × beam + 1.0 m (boats up to 20 m).
  const single = layout.berths.some((b) => !b.removed && (b.type === 'yBoom' || b.type === 'sternBuoy' || b.type === 'mixed' || params.boatsPerBay === 1));
  const allowance = (length: number) => (length > 20 ? 1.5 : 1.0);
  const longest = active.reduce((x, c) => Math.max(x, c.length), 0);
  const singleNeed = allowance(longest);
  if (single && params.beamClearance < singleNeed - 1e-9) {
    notes.push({ severity: 'info', code: 'AS_BERTH_WIDTH', clause: '3.3.2', message: `Single berths (booms, stern buoys or one boat per bay) are beam + ${m(params.beamClearance)} m wide; AS 3962 gives beam + ${m(singleNeed)} m for a single berth (2 × beam + ${m(singleNeed)} m for a double one, which two boats per bay at + 0.5 m each meet). The project keeps 0.5 m (owner's choice D43).` });
  }
  if (!single && params.boatsPerBay === 2 && 2 * params.beamClearance < singleNeed - 1e-9) {
    notes.push({ severity: 'warning', code: 'AS_BERTH_WIDTH', clause: '3.3.2', message: `Double berths are 2 × beam + ${m(2 * params.beamClearance)} m wide; AS 3962 gives 2 × beam + ${m(singleNeed)} m.` });
  }

  // 3.1.2 Fairways: minimum 1.5 L, preferred 1.75 L.
  if (params.fairwayFactor < 1.5 - 1e-9) {
    notes.push({ severity: 'warning', code: 'AS_FAIRWAY', clause: '3.1.2', message: `Fairway ${params.fairwayFactor.toFixed(2)} × boat length; AS 3962: at least 1.5 × the longest boat using it (1.75 preferred).` });
  }

  // 3.1.1 Entrance channel: the greatest of 20 m, L + 2 m and 5 B.
  const entrance = distance(site.entrance.a, site.entrance.b);
  const widestBeam = active.reduce((x, c) => Math.max(x, c.beam), 0);
  const entranceMin = Math.max(20, longest + 2, 5 * widestBeam);
  if (entrance > 0 && active.length > 0 && entrance < entranceMin - 1e-9) {
    notes.push({ severity: 'warning', code: 'AS_ENTRANCE', clause: '3.1.1', message: `Entrance ${m(entrance)} m wide; AS 3962: at least ${m(entranceMin)} m (the greatest of 20 m, L + 2 m and 5 × the widest beam), preferably 30 m or 6 B, whichever is the minimum.` });
  }

  // 3.6 Gangways: clear width by berths served (Table 3.3); slope at most 1:3.5 at the lowest water.
  for (const pier of layout.piers) {
    const link = pierShoreLink(pier, site, params.gangwayLength);
    if (!link || link.kind !== 'gangway') continue;
    const served = layout.berths.filter((b) => b.pierId === pier.id && !b.removed).length;
    notes.push({ severity: 'info', code: 'AS_GANGWAY_WIDTH', clause: '3.6.1', elementId: pier.id, message: `${pier.id}: its gangway serves ${served} berths → clear width at least ${m(gangwayClearWidth(served))} m (AS 3962 Table 3.3); handrails on both sides for unrestricted access.` });
    if (link.gap > params.gangwayLength - 0.5 + 1e-9) {
      notes.push({ severity: 'warning', code: 'AS_GANGWAY_REACH', clause: '3.6', elementId: pier.id, message: `${pier.id}: ${m(link.gap)} m from the shore with a ${m(params.gangwayLength)} m gangway: too little left to land on the pontoon.` });
    }
    if (a.quayLevel !== null) {
      // Rise from the deck to the quay at the lowest and the highest water.
      const rises = [a.quayLevel + a.lowWater - input.freeboard, a.quayLevel - a.highWater - input.freeboard];
      const worst = Math.max(...rises.map(Math.abs));
      const slope = worst < params.gangwayLength ? worst / Math.sqrt(params.gangwayLength ** 2 - worst ** 2) : Infinity;
      if (slope > GANGWAY_MAX_SLOPE + 1e-9) {
        notes.push({ severity: 'warning', code: 'AS_GANGWAY_SLOPE', clause: '3.6.2', elementId: pier.id, message: `${pier.id}: the ${m(params.gangwayLength)} m gangway rises ${m(worst)} m at the extreme water level, slope 1:${slope === Infinity ? '0' : (1 / slope).toFixed(1)}; AS 3962: at most 1:3.5 (1:3 for private pontoons; 1:8 with assisted wheelchair access), taken at the lowest water. A longer gangway is needed (at least ${m(worst * Math.sqrt(1 + 3.5 ** 2))} m).` });
      }
    }
  }
  if (a.quayLevel === null && layout.piers.some((p) => pierShoreLink(p, site, params.gangwayLength)?.kind === 'gangway')) {
    notes.push({ severity: 'info', code: 'AS_GANGWAY_SLOPE', clause: '3.6.2', message: 'Enter the quay level above the design water level (anchoring parameters) to check the gangway slope: AS 3962 allows at most 1:3.5 at the lowest water.' });
  }

  // 3.2.3 Depth at the berths: draught + ½ Hs + under-keel clearance at the lowest water.
  const available = a.depth - a.lowWater;
  const ukc = (draught: number) => (a.seabed === 'rock' ? 0.5 : Math.max(0.3, 0.1 * draught));
  const shallow = active
    .map((c) => ({ c, need: yachtDraught(c.length) + ukc(yachtDraught(c.length)) + input.waveHeight / 2 }))
    .filter((x) => x.need > available + 1e-9);
  if (shallow.length > 0) {
    notes.push({ severity: 'warning', code: 'AS_BERTH_DEPTH', clause: '3.2', message: `At the lowest water the berths have ${m(available)} m (design depth ${m(a.depth)} − low water ${m(a.lowWater)} m); AS 3962 needs the yacht draught of Table 3.1 + under-keel clearance (${a.seabed === 'rock' ? '0.5 m on hard bed' : 'max(0.3 m, 10 % of the draught) on soft bed'}) + ½ Hs: ${shallow.map((x) => `${x.c.name} ${m(x.need)} m`).join(', ')}. Shallower berths can be signed for shallow-draught boats (3.2.3).` });
  }

  // 5.1.2 Access from the water when the freeboard is over 500 mm.
  if (input.freeboard > 0.5 + 1e-9) {
    notes.push({ severity: 'info', code: 'AS_LADDERS', clause: '5.1.2', message: `Freeboard ${input.freeboard.toFixed(2)} m > 0.5 m: AS 3962 asks for access from the water without assistance (ladders); the bill of materials counts ladders per pier.` });
  }
  return notes;
}
