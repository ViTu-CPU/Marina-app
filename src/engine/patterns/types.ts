import { add, ensureCounterClockwise, scale } from '../geometry';
import type { BoatClass, Params, Polygon, Vec2 } from '../model';

/**
 * A mooring type (SPEC §4). The generator and the validator only talk to this interface,
 * so new types — side-to berths, Y-boom berths, bow-to with stern buoy — can be added
 * without touching them.
 *
 * A pattern describes one ROW: the berths along one side of a main pier. Geometry is
 * given in row-local coordinates:
 *   s = distance along the pier edge from the start of the row (shore end → head),
 *   d = distance outwards from the pier edge, perpendicular to the pier.
 */
export interface LocalRect {
  s0: number;
  s1: number;
  d0: number;
  d1: number;
}

export interface BayBerth {
  boatClassId: string;
  /** Water reserved for the boat, including clearances. */
  slot: LocalRect;
  /** Simplified boat outline inside the slot. */
  boat: LocalRect;
}

/** One bay: the berths between two dividers, plus those dividers. */
export interface BayGeometry {
  /** Along-pier distance from this bay's start to where the next adjacent bay starts. */
  advance: number;
  /** Along-pier extent of this bay on its own, including its closing divider. */
  footprint: number;
  /**
   * Structures bounding the bay (fingers, booms). Adjacent bays share a divider:
   * the closing divider of one bay coincides with the opening divider of the next.
   */
  dividers: LocalRect[];
  berths: BayBerth[];
}

export interface BerthPattern {
  id: string;
  /** How many boats one bay holds at most. */
  boatsPerBay(params: Params): number;
  /** Row depth needed by a boat of this class, measured perpendicular to the pier. */
  slotLength(boat: BoatClass, params: Params): number;
  /** Geometry of a bay that starts at `s` and holds `boats` (1..boatsPerBay, in order). */
  bay(boats: BoatClass[], s: number, params: Params): BayGeometry;
}

/** Placement of a row in world coordinates. */
export interface RowFrame {
  /** Point on the pier edge where s = 0. */
  origin: Vec2;
  /** Unit vector along the pier, shore end → head. */
  along: Vec2;
  /** Unit vector pointing away from the pier. */
  outward: Vec2;
}

export function localRectToPolygon(rect: LocalRect, frame: RowFrame): Polygon {
  const at = (s: number, d: number): Vec2 =>
    add(frame.origin, add(scale(frame.along, s), scale(frame.outward, d)));
  return ensureCounterClockwise([
    at(rect.s0, rect.d0),
    at(rect.s1, rect.d0),
    at(rect.s1, rect.d1),
    at(rect.s0, rect.d1),
  ]);
}
