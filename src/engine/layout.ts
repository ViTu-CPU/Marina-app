/**
 * Turning a set of piers, fingers and berths into a complete, evaluated Layout:
 * fairways → validation → statistics. Used by the generator and after every manual edit.
 */
import { buildFairways } from './fairways';
import type { Berth, BoatClass, Finger, Layout, MainPier, Params } from './model';
import { layoutRows } from './rows';
import { computeStats } from './score';
import type { PreparedSite } from './site';
import { feasibilityOf, geometricIssues, operationalIssues, withBerthIssues } from './validate';

export interface LayoutDraft {
  id: string;
  name: string;
  strategy: string;
  piers: MainPier[];
  fingers: Finger[];
  berths: Berth[];
  modified: boolean;
}

/** The score is left at 0; it is set when layouts are ranked against each other. */
export function evaluateLayout(
  draft: LayoutDraft,
  prepared: PreparedSite,
  classes: BoatClass[],
  params: Params,
): Layout {
  const rows = layoutRows(draft.piers, draft.fingers, draft.berths, classes, params);
  const fairways = buildFairways(draft.piers, rows, prepared);
  const issues = [...geometricIssues(draft, prepared, params), ...operationalIssues(draft, rows, prepared)];
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
    stats: computeStats({ piers: draft.piers, fingers: draft.fingers, berths, fairways, issues }, prepared, classes),
    score: 0,
    modified: draft.modified,
  };
}
