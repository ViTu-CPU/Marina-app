import type { BoatClass, Params } from '../model';
import { MAX_BOAT_PIER_GAP, standardFingerLength } from './fingerPier';
import type { BayGeometry, BerthPattern, LocalRect } from './types';

/**
 * Divider beside a boat in a Y-boom row (D34): a boom of the shortest standard boom length
 * at least ratio × boat length that fits the slot, else (the boat is too long for any boom)
 * a mooring finger as in a finger pier row (standard finger length, finger width).
 */
export function yBoomDivider(boat: BoatClass, params: Params): { kind: 'boom' | 'finger'; length: number; width: number } {
  const target = params.fingerLengthRatio * boat.length;
  const slotLength = boat.length + params.lengthClearance;
  const boom = standardFingerLength(target, slotLength, params.boomLengths);
  if (params.boomLengths.includes(boom)) return { kind: 'boom', length: boom, width: params.boomWidth };
  return { kind: 'finger', length: standardFingerLength(target, slotLength, params.fingerLengths), width: params.fingerWidth };
}

/**
 * Y-boom berths (aisapaikka, D34): one boat per bay between two dividers,
 *   divider | slot | divider | slot | …
 * Slot as in finger piers (beam + clearance, length + clearance). The dividers beside a boat
 * are booms or, for long boats, fingers (`yBoomDivider`). A shared divider takes the longer
 * length and the wider extent (fill.ts).
 */
export const yBoomPattern: BerthPattern = {
  id: 'yBoom',
  berthType: 'yBoom',

  boatsPerBay: () => 1,

  slotLength: (boat, params) => boat.length + params.lengthClearance,

  bay(boats: BoatClass[], s: number, params: Params): BayGeometry {
    if (boats.length !== 1) throw new Error(`A Y-boom bay holds one boat, got ${boats.length}`);
    const boat = boats[0]!;
    const divider = yBoomDivider(boat, params);
    const kind = divider.kind === 'boom' ? { kind: 'boom' as const } : {};
    const gap = Math.min(MAX_BOAT_PIER_GAP, params.lengthClearance / 2);
    const slotWidth = boat.beam + params.beamClearance;
    const s0 = s + divider.width;
    const slot: LocalRect = { s0, s1: s0 + slotWidth, d0: 0, d1: boat.length + params.lengthClearance };
    const side = params.beamClearance / 2;
    const opening: LocalRect = { s0: s, s1: s0, d0: 0, d1: divider.length, ...kind };
    const closing: LocalRect = { s0: slot.s1, s1: slot.s1 + divider.width, d0: 0, d1: divider.length, ...kind };
    return {
      advance: slot.s1 - s,
      footprint: closing.s1 - s,
      dividers: [opening, closing],
      berths: [{ boatClassId: boat.id, slot, boat: { s0: slot.s0 + side, s1: slot.s1 - side, d0: gap, d1: gap + boat.length } }],
    };
  },
};
