import { DEFAULT_ANCHORING } from '../anchoring';
import type { BoatClass, Params } from '../model';
import { MAX_BOAT_PIER_GAP } from './fingerPier';
import type { BayGeometry, BerthPattern, LocalRect } from './types';

/**
 * Distance of the stern buoy from the pier edge, m (D35): *"Asennusetäisyys laiturista (A) =
 * veneen pituus (B) + veden syvyys (C)"* (Suomen Laiturikauppa, docs/RESEARCH.md §2.5). The
 * depth is the anchoring design depth (D16), given to the engine as `params.waterDepth`.
 */
export const sternBuoyDistance = (boat: BoatClass, params: Params): number => boat.length + (params.waterDepth ?? DEFAULT_ANCHORING.depth);

/**
 * Stern-buoy berths (peräpoiju, D35): the boat lies bow to the pier and stern to a buoy; no
 * fingers. One boat per bay, side by side. The slot reaches from the pier edge to beyond
 * the buoy (buoy distance + length clearance), so the fairway starts behind the buoys
 * (owner's choice).
 */
export const sternBuoyPattern: BerthPattern = {
  id: 'sternBuoy',
  berthType: 'sternBuoy',

  boatsPerBay: () => 1,

  slotLength: (boat, params) => sternBuoyDistance(boat, params) + params.lengthClearance,

  bay(boats: BoatClass[], s: number, params: Params): BayGeometry {
    if (boats.length !== 1) throw new Error(`A stern-buoy bay holds one boat, got ${boats.length}`);
    const boat = boats[0]!;
    const gap = Math.min(MAX_BOAT_PIER_GAP, params.lengthClearance / 2);
    const width = boat.beam + params.beamClearance;
    const slot: LocalRect = { s0: s, s1: s + width, d0: 0, d1: sternBuoyPattern.slotLength(boat, params) };
    const side = params.beamClearance / 2;
    return {
      advance: width,
      footprint: width,
      dividers: [],
      berths: [
        {
          boatClassId: boat.id,
          slot,
          boat: { s0: s + side, s1: s + width - side, d0: gap, d1: gap + boat.length },
          buoy: { s: s + width / 2, d: sternBuoyDistance(boat, params) },
        },
      ],
    };
  },
};
