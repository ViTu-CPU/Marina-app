/**
 * Constraint checks (SPEC §6). Run on every generated layout and after every manual edit.
 *
 * The result only says whether the layout meets the constraints configured by the user.
 * It is never a statement about safety or regulatory compliance.
 */
import {
  boundingBox,
  boxesOverlap,
  convexInsideRegion,
  convexIntersectsRegion,
  convexOverlapDepth,
  EPS,
  regionFromPolygon,
  type Box,
} from './geometry';
import type { Berth, BoatClass, Feasibility, Finger, Issue, MainPier, Params, Polygon } from './model';
import { pierPolygon, type PreparedSite } from './site';

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
} as const;

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

export function validateLayout(
  layout: LayoutElements,
  prepared: PreparedSite,
  _classes: BoatClass[],
  params: Params,
): ValidationResult {
  const issues = geometricIssues(layout, prepared, params);
  return { issues, feasibility: feasibilityOf(issues), berths: withBerthIssues(layout.berths, issues) };
}
