/**
 * Constraint checks (SPEC §6). Run on every generated layout and after every manual edit.
 *
 * The result only says whether the layout meets the constraints configured by the user.
 * It is never a statement about safety or regulatory compliance.
 */
import { occupiedRegion } from './fairways';
import {
  add,
  boundingBox,
  boxesOverlap,
  convexInsideRegion,
  convexIntersectsRegion,
  convexOverlapDepth,
  distancePointToPart,
  distancePointToPolyline,
  distanceSegmentToPart,
  EPS,
  regionFromPolygon,
  scale,
  type Box,
} from './geometry';
import { bufferRegion, differenceRegions } from './geometryOps';
import type { Berth, BoatClass, Feasibility, Finger, Issue, MainPier, Params, Polygon } from './model';
import { localRectToPolygon } from './patterns';
import { layoutRows, pierAxis, toLocalRect, type RowInfo } from './rows';
import { pierPolygon, SHORE_TOLERANCE, type PreparedSite } from './site';

export interface LayoutElements {
  piers: MainPier[];
  fingers: Finger[];
  berths: Berth[];
}

export interface ValidationResult {
  /** All issues of the layout, errors first, in a stable order. */
  issues: Issue[];
  feasibility: Feasibility;
  /** The berths with their own `issues` filled in. */
  berths: Berth[];
}

/** Machine-readable issue codes. */
export const IssueCode = {
  PIER_OUTSIDE_WATER: 'PIER_OUTSIDE_WATER',
  FINGER_OUTSIDE_WATER: 'FINGER_OUTSIDE_WATER',
  SLOT_OUTSIDE_WATER: 'SLOT_OUTSIDE_WATER',
  STRUCTURE_IN_OBSTACLE_BUFFER: 'STRUCTURE_IN_OBSTACLE_BUFFER',
  STRUCTURE_IN_RESTRICTED_ZONE: 'STRUCTURE_IN_RESTRICTED_ZONE',
  SLOT_IN_OBSTACLE_BUFFER: 'SLOT_IN_OBSTACLE_BUFFER',
  SLOT_IN_PROTECTED_ZONE: 'SLOT_IN_PROTECTED_ZONE',
  OVERLAP: 'OVERLAP',
  BOAT_OUTSIDE_SLOT: 'BOAT_OUTSIDE_SLOT',
  // Operational (warnings)
  SLOT_IN_NO_NAVIGATION_ZONE: 'SLOT_IN_NO_NAVIGATION_ZONE',
  FAIRWAY_OUTSIDE_WATER: 'FAIRWAY_OUTSIDE_WATER',
  FAIRWAY_IN_OBSTACLE_BUFFER: 'FAIRWAY_IN_OBSTACLE_BUFFER',
  FAIRWAY_IN_RESTRICTED_ZONE: 'FAIRWAY_IN_RESTRICTED_ZONE',
  FAIRWAY_OBSTRUCTED: 'FAIRWAY_OBSTRUCTED',
  NOT_CONNECTED_TO_ENTRANCE: 'NOT_CONNECTED_TO_ENTRANCE',
  PIER_NOT_CONNECTED_TO_SHORE: 'PIER_NOT_CONNECTED_TO_SHORE',
} as const;

/**
 * Passages up to this much narrower than the required fairway width still count as
 * connected, m. Absorbs the polygonal approximation of round buffers.
 */
export const CONNECTIVITY_SLACK = 0.1;

type ElementKind = 'pier' | 'finger' | 'slot';

interface Element {
  id: string;
  kind: ElementKind;
  shape: Polygon;
  box: Box;
}

const KIND_LABEL: Record<ElementKind, string> = { pier: 'Pier', finger: 'Finger', slot: 'Berth' };

export function collectElements(layout: LayoutElements): Element[] {
  const elements: Element[] = [];
  for (const p of layout.piers) {
    const shape = pierPolygon(p.start, p.end, p.width);
    elements.push({ id: p.id, kind: 'pier', shape, box: boundingBox(shape) });
  }
  for (const f of layout.fingers) {
    elements.push({ id: f.id, kind: 'finger', shape: f.shape, box: boundingBox(f.shape) });
  }
  for (const b of layout.berths) {
    if (b.removed) continue;
    elements.push({ id: b.id, kind: 'slot', shape: b.slot, box: boundingBox(b.slot) });
  }
  return elements;
}

/** Geometric checks (SPEC §6). Every issue is an error. */
export function geometricIssues(layout: LayoutElements, prepared: PreparedSite, params: Params): Issue[] {
  const issues: Issue[] = [];
  const error = (code: string, elementId: string, message: string) =>
    issues.push({ severity: 'error', code, message, elementId });
  const elements = collectElements(layout);

  for (const e of elements) {
    const label = `${KIND_LABEL[e.kind]} ${e.id}`;
    if (!convexInsideRegion(e.shape, prepared.water)) {
      const code =
        e.kind === 'pier'
          ? IssueCode.PIER_OUTSIDE_WATER
          : e.kind === 'finger'
            ? IssueCode.FINGER_OUTSIDE_WATER
            : IssueCode.SLOT_OUTSIDE_WATER;
      error(code, e.id, `${label} is not fully inside the water area.`);
      continue;
    }
    if (convexIntersectsRegion(e.shape, prepared.obstacleBuffer)) {
      error(
        e.kind === 'slot' ? IssueCode.SLOT_IN_OBSTACLE_BUFFER : IssueCode.STRUCTURE_IN_OBSTACLE_BUFFER,
        e.id,
        `${label} is closer than ${params.obstacleClearance.toFixed(1)} m to an obstacle.`,
      );
    }
    if (e.kind === 'slot') {
      if (convexIntersectsRegion(e.shape, prepared.zones.protected)) {
        error(IssueCode.SLOT_IN_PROTECTED_ZONE, e.id, `${label} is inside a protected zone.`);
      }
    } else if (
      convexIntersectsRegion(e.shape, prepared.zones.noStructures) ||
      convexIntersectsRegion(e.shape, prepared.zones.protected)
    ) {
      error(IssueCode.STRUCTURE_IN_RESTRICTED_ZONE, e.id, `${label} is inside a zone where structures are not allowed.`);
    }
  }

  // Overlaps between piers, fingers and slots, tolerance 1 cm.
  for (let i = 0; i < elements.length; i++) {
    const a = elements[i]!;
    for (let j = i + 1; j < elements.length; j++) {
      const b = elements[j]!;
      if (!boxesOverlap(a.box, b.box)) continue;
      const depth = convexOverlapDepth(a.shape, b.shape);
      if (depth > EPS) {
        error(
          IssueCode.OVERLAP,
          a.id,
          `${KIND_LABEL[a.kind]} ${a.id} overlaps ${KIND_LABEL[b.kind].toLowerCase()} ${b.id} by ${depth.toFixed(2)} m.`,
        );
      }
    }
  }

  for (const b of layout.berths) {
    if (b.removed) continue;
    if (!convexInsideRegion(b.boat, regionFromPolygon(b.slot))) {
      error(IssueCode.BOAT_OUTSIDE_SLOT, b.id, `Boat in berth ${b.id} does not fit inside its slot.`);
    }
  }
  return issues;
}

export function feasibilityOf(issues: Issue[]): Feasibility {
  if (issues.some((i) => i.severity === 'error')) return 'geometricFail';
  if (issues.some((i) => i.severity === 'warning')) return 'geometricOK';
  return 'operationalOK';
}

/** Attach to each berth the issues that refer to it. */
export function withBerthIssues(berths: Berth[], issues: Issue[]): Berth[] {
  const byElement = new Map<string, Issue[]>();
  for (const issue of issues) {
    if (!issue.elementId) continue;
    const list = byElement.get(issue.elementId);
    if (list) list.push(issue);
    else byElement.set(issue.elementId, [issue]);
  }
  return berths.map((b) => ({ ...b, issues: byElement.get(b.id) ?? [] }));
}

/**
 * Operational checks (SPEC §6). Every issue is a warning.
 *
 * - Each berth must have clear navigable water straight out from its slot to the far
 *   side of its row's fairway ("every slot borders a fairway of the required width").
 * - That water must not be in an obstacle buffer, a noNavigation or protected zone,
 *   nor be taken by another pier, finger or slot.
 * - A circle as wide as the required fairway must be able to travel from the entrance
 *   to the fairway of every berth ("fairway network is connected to the entrance").
 * - Every main pier must start at the shoreline.
 */
export function operationalIssues(
  layout: LayoutElements,
  rows: RowInfo[],
  prepared: PreparedSite,
): Issue[] {
  const issues: Issue[] = [];
  const warn = (code: string, elementId: string, message: string) =>
    issues.push({ severity: 'warning', code, message, elementId });
  const elements = collectElements(layout);

  // Pier ↔ shoreline.
  for (const pier of layout.piers) {
    const { left } = pierAxis(pier);
    const connected = [0, pier.width / 2, -pier.width / 2].some(
      (lateral) =>
        distancePointToPolyline(add(pier.start, scale(left, lateral)), prepared.site.shoreline) <= SHORE_TOLERANCE,
    );
    if (!connected) warn(IssueCode.PIER_NOT_CONNECTED_TO_SHORE, pier.id, `Pier ${pier.id} does not connect to the shoreline.`);
  }

  // Corridor in front of every berth.
  const blocked = new Set<string>();
  for (const row of rows) {
    const width = row.fairwayWidth.toFixed(1);
    for (const berth of row.berths) {
      if (convexIntersectsRegion(berth.slot, prepared.zones.noNavigation)) {
        warn(IssueCode.SLOT_IN_NO_NAVIGATION_ZONE, berth.id, `Berth ${berth.id} is inside a no-navigation zone.`);
      }
      const slot = toLocalRect(berth.slot, row.frame);
      const reach = row.depth + row.fairwayWidth;
      if (reach - slot.d1 < EPS) continue;
      const corridor = localRectToPolygon({ s0: slot.s0, s1: slot.s1, d0: slot.d1, d1: reach }, row.frame);
      const fail = (code: string, why: string) => {
        blocked.add(berth.id);
        warn(code, berth.id, `Berth ${berth.id} does not have a ${width} m fairway in front of it: ${why}.`);
      };
      if (!convexInsideRegion(corridor, prepared.water)) {
        fail(IssueCode.FAIRWAY_OUTSIDE_WATER, 'the water area ends too close');
        continue;
      }
      if (convexIntersectsRegion(corridor, prepared.obstacleBuffer)) {
        fail(IssueCode.FAIRWAY_IN_OBSTACLE_BUFFER, 'an obstacle is too close');
        continue;
      }
      if (
        convexIntersectsRegion(corridor, prepared.zones.noNavigation) ||
        convexIntersectsRegion(corridor, prepared.zones.protected)
      ) {
        fail(IssueCode.FAIRWAY_IN_RESTRICTED_ZONE, 'a restricted zone is in the way');
        continue;
      }
      const box = boundingBox(corridor);
      const obstruction = elements.find(
        (e) => e.id !== berth.id && boxesOverlap(box, e.box) && convexOverlapDepth(corridor, e.shape) > EPS,
      );
      if (obstruction) {
        fail(IssueCode.FAIRWAY_OBSTRUCTED, `${KIND_LABEL[obstruction.kind].toLowerCase()} ${obstruction.id} is in the way`);
      }
    }
  }

  // Connection to the entrance, once per distinct fairway width.
  if (rows.length > 0) {
    const free = differenceRegions(prepared.navigableRegion, occupiedRegion(layout.piers, rows));
    const { a, b } = prepared.site.entrance;
    const widths = [...new Set(rows.map((r) => r.fairwayWidth))];
    for (const width of widths) {
      const radius = width / 2 - CONNECTIVITY_SLACK;
      // Centres of a circle of the fairway width that fits in the free water …
      const passable = bufferRegion(free, -radius);
      // … restricted to the parts such a circle can reach from the entrance.
      const reachable = passable.filter((part) => distanceSegmentToPart(a, b, part) <= width / 2 + CONNECTIVITY_SLACK);
      for (const row of rows) {
        if (row.fairwayWidth !== width) continue;
        let cutOff = 0;
        for (const berth of row.berths) {
          if (blocked.has(berth.id)) continue; // already reported above
          const slot = toLocalRect(berth.slot, row.frame);
          const s = (slot.s0 + slot.s1) / 2;
          const d = row.depth + width / 2;
          const point = add(row.frame.origin, add(scale(row.frame.along, s), scale(row.frame.outward, d)));
          // The point must lie in the water swept by such a circle (dead ends at the shore
          // are swept even though the circle's centre cannot get there).
          if (!reachable.some((part) => distancePointToPart(point, part) <= radius + 2 * CONNECTIVITY_SLACK)) cutOff++;
        }
        if (cutOff > 0) {
          warn(
            IssueCode.NOT_CONNECTED_TO_ENTRANCE,
            row.pierId,
            `${cutOff} berth${cutOff === 1 ? '' : 's'} on the ${row.side} side of pier ${row.pierId} cannot be reached from the entrance through a ${width.toFixed(1)} m wide fairway.`,
          );
        }
      }
    }
  }
  return issues;
}

export function validateLayout(
  layout: LayoutElements,
  prepared: PreparedSite,
  classes: BoatClass[],
  params: Params,
): ValidationResult {
  const rows = layoutRows(layout.piers, layout.fingers, layout.berths, classes, params);
  const issues = [...geometricIssues(layout, prepared, params), ...operationalIssues(layout, rows, prepared)];
  return { issues, feasibility: feasibilityOf(issues), berths: withBerthIssues(layout.berths, issues) };
}
