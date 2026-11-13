/**
 * Turning a set of piers, fingers and berths into a complete, evaluated Layout:
 * fairways → validation → statistics. Used by the generator and after every manual edit.
 */
import { buildFairways } from './fairways';
import type { Berth, BoatClass, Finger, Layout, MainPier, Params } from './model';
import { layoutRows } from './rows';
import { computeStats } from './score';
import type { PreparedSite } from './site';
import { feasibilityOf, geometricIssues, leftOutIssue, operationalIssues, withBerthIssues } from './validate';

export interface LayoutDraft {
  id: string;
  name: string;
  strategy: string;
  piers: MainPier[];
  fingers: Finger[];
  berths: Berth[];
  modified: boolean;
  /** Berths left out by the generator as unreachable (default 0). */
  unreachableRemoved?: number;
}

export interface EvaluateOptions {
  /**
   * Skip the connection-to-entrance check. Only for the generator, which has just run
   * that same check on exactly these elements and found every berth reachable.
   */
  assumeConnected?: boolean;
}

/** The score is left at 0; it is set when layouts are ranked against each other. */
export function evaluateLayout(
  draft: LayoutDraft,
  prepared: PreparedSite,
  classes: BoatClass[],
  params: Params,
  options: EvaluateOptions = {},
): Layout {
  const rows = layoutRows(draft.piers, draft.fingers, draft.berths, classes, params);
  const fairways = buildFairways(draft.piers, rows, prepared);
  const issues = [
    ...geometricIssues(draft, prepared, params),
    ...operationalIssues(draft, rows, prepared, { skipConnectivity: options.assumeConnected === true }),
    ...((draft.unreachableRemoved ?? 0) > 0 ? [leftOutIssue(draft.unreachableRemoved ?? 0)] : []),
  ];
  const berths = withBerthIssues(draft.berths, issues);
  return {
    id: draft.id,
    name: draft.name,
    strategy: draft.strategy,
    piers: draft.piers,
    fingers: draft.fingers,
    berths,
    fairways,
    feasibility: feasibilityOf(issues),
    issues,
    stats: computeStats(
      { piers: draft.piers, fingers: draft.fingers, berths, fairways, issues, unreachableRemoved: draft.unreachableRemoved ?? 0 },
      prepared,
      classes,
    ),
    score: 0,
    modified: draft.modified,
    unreachableRemoved: draft.unreachableRemoved ?? 0,
  };
}
