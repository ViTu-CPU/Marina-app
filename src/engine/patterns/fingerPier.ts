import type { BoatClass, Params } from '../model';
import type { BayBerth, BayGeometry, BerthPattern, LocalRect } from './types';

/**
 * Largest gap left between the pier edge and the boat (SPEC §4: "touching the pier side
 * minus a small gap"). Assumption for drawing only; it does not affect berth counts.
 */
export const MAX_BOAT_PIER_GAP = 0.2;

/**
 * Finger length for a wanted length `target` (m) and the longest that fits, `maxLength` (the
 * slot length): the shortest of the standard `lengths` that is at least `target` and at most
 * `maxLength`; `target` itself when there is none (a custom length) or no list (D29, I67).
 */
export function standardFingerLength(target: number, maxLength: number, lengths: readonly number[]): number {
  let best = Infinity;
  for (const l of lengths) if (l >= target - 1e-9 && l <= maxLength + 1e-9 && l < best) best = l;
  return Number.isFinite(best) ? best : target;
}

/**
 * Finger pier berths (SPEC §4): along the pier, bays repeat as
 *   finger | slot | (slot) | finger | …
 * - slot width  = boat beam + beamClearance
 * - slot length = boat length + lengthClearance (perpendicular to the main pier)
 * - finger length = fingerLengthRatio × length of the longer boat next to it, rounded up to a
 *   standard length (D29, `standardFingerLength`)
 */
export const fingerPierPattern: BerthPattern = {
  id: 'fingerPier',
  berthType: 'finger',

  boatsPerBay: (params) => params.boatsPerBay,

  slotLength: (boat, params) => boat.length + params.lengthClearance,

  bay(boats: BoatClass[], s: number, params: Params): BayGeometry {
    if (boats.length < 1 || boats.length > params.boatsPerBay) {
      throw new Error(`A finger pier bay holds 1..${params.boatsPerBay} boats, got ${boats.length}`);
    }
    const longest = Math.max(...boats.map((b) => b.length));
    const fingerLength = standardFingerLength(params.fingerLengthRatio * longest, longest + params.lengthClearance, params.fingerLengths ?? []);
    const gap = Math.min(MAX_BOAT_PIER_GAP, params.lengthClearance / 2);

    const berths: BayBerth[] = [];
    let cursor = s + params.fingerWidth;
    for (const boat of boats) {
      const slotWidth = boat.beam + params.beamClearance;
      const slot: LocalRect = {
        s0: cursor,
        s1: cursor + slotWidth,
        d0: 0,
        d1: boat.length + params.lengthClearance,
      };
      const side = params.beamClearance / 2;
      berths.push({
        boatClassId: boat.id,
        slot,
        boat: { s0: slot.s0 + side, s1: slot.s1 - side, d0: gap, d1: gap + boat.length },
      });
      cursor += slotWidth;
    }

    const opening: LocalRect = { s0: s, s1: s + params.fingerWidth, d0: 0, d1: fingerLength };
    const closing: LocalRect = { s0: cursor, s1: cursor + params.fingerWidth, d0: 0, d1: fingerLength };
    return {
      advance: cursor - s,
      footprint: cursor + params.fingerWidth - s,
      dividers: [opening, closing],
      berths,
    };
  },
};
