import type { BoatClass, Params } from '../model';
import { fingerPierPattern } from './fingerPier';
import type { BayBerth, BayGeometry, BerthPattern, LocalRect } from './types';
import { yBoomDivider, yBoomPattern } from './yBoom';

/**
 * Mixed berths (D51): *"prefer small Y booms between all smaller boats, and increase to bigger
 * fingers based on the boats its supposed to house."* A bay whose boats all fit a standard boom
 * (`yBoomDivider`) is laid out as Y-boom berths, each boat between two booms; a bay with a boat too
 * long for a boom becomes a finger pier bay (one or two boats between standard-length fingers,
 * `boatsPerBay`). Booms and fingers meet in one row; a shared divider takes the longer length and
 * the wider extent and is a finger if either side needs one (fill.ts, I74).
 */
export const mixedPattern: BerthPattern = {
  id: 'mixed',
  berthType: 'mixed',

  boatsPerBay: (params) => params.boatsPerBay,

  slotLength: (boat, params) => boat.length + params.lengthClearance,

  bay(boats: BoatClass[], s: number, params: Params): BayGeometry {
    if (boats.length < 1 || boats.length > params.boatsPerBay) throw new Error(`A mixed bay holds 1..${params.boatsPerBay} boats, got ${boats.length}`);
    if (!boats.every((b) => yBoomDivider(b, params).kind === 'boom')) return fingerPierPattern.bay(boats, s, params);
    // Y-boom berths side by side: boom | slot | boom | slot | boom.
    const dividers: LocalRect[] = [];
    const berths: BayBerth[] = [];
    let cursor = s;
    boats.forEach((boat, i) => {
      const g = yBoomPattern.bay([boat], cursor, params);
      if (i === 0) dividers.push(g.dividers[0]!);
      else {
        // The boom between two boats: the longer of the two.
        const last = dividers[dividers.length - 1]!;
        last.d1 = Math.max(last.d1, g.dividers[0]!.d1);
      }
      dividers.push(g.dividers[1]!);
      berths.push(...g.berths);
      cursor += g.advance;
    });
    const closing = dividers[dividers.length - 1]!;
    return { advance: cursor - s, footprint: closing.s1 - s, dividers, berths };
  },
};
