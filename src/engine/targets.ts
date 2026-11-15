/**
 * Berth targets (DECISIONS D20). The boat mix is given either as target shares of the
 * berth count or as target numbers of berths per class.
 *
 * With target counts the rest of the engine still works with shares: each class gets the
 * share implied by the counts, and the counts become upper limits (caps) for the
 * generator. A layout never gets more berths of a class than asked for.
 */
import type { BoatClass, ObjectiveSettings, Params } from './model';

export const usesCounts = (params: Pick<Params, 'berthTarget'>): boolean => params.berthTarget === 'count';

/** Target count of a class as a whole, non-negative number. */
export const targetCount = (c: Pick<BoatClass, 'count'>): number => Math.max(0, Math.round(c.count));

/**
 * The classes as the generator and the statistics see them: with target counts, `share`
 * is replaced by the share implied by the counts. With target shares, unchanged.
 */
export function mixClasses(classes: BoatClass[], params: Pick<Params, 'berthTarget'>): BoatClass[] {
  if (!usesCounts(params)) return classes;
  const total = classes.reduce((sum, c) => sum + targetCount(c), 0);
  return classes.map((c) => ({ ...c, share: total > 0 ? targetCount(c) / total : 0 }));
}

/** Upper limit of berths per class id, or undefined when the mix is given as shares. */
export function berthCaps(classes: BoatClass[], params: Pick<Params, 'berthTarget'>): Record<string, number> | undefined {
  if (!usesCounts(params)) return undefined;
  return Object.fromEntries(classes.map((c) => [c.id, targetCount(c)]));
}

/** Total of the target counts, or null when the mix is given as shares. */
export function targetTotal(classes: BoatClass[], params: Pick<Params, 'berthTarget'>): number | null {
  return usesCounts(params) ? classes.reduce((sum, c) => sum + targetCount(c), 0) : null;
}

/** Berths short of the target counts, summed over the classes; 0 with target shares. */
export function targetShortfall(
  classes: BoatClass[],
  params: Pick<Params, 'berthTarget'>,
  berthsByClass: Record<string, number>,
): number {
  if (!usesCounts(params)) return 0;
  return classes.reduce((sum, c) => sum + Math.max(0, targetCount(c) - (berthsByClass[c.id] ?? 0)), 0);
}

/**
 * The objective as used for ranking. With target counts, 'minInfrastructure' measures
 * its shortfall against the total of the counts instead of the separate berth target.
 */
export function effectiveObjective(
  objective: ObjectiveSettings,
  classes: BoatClass[],
  params: Pick<Params, 'berthTarget'>,
): ObjectiveSettings {
  const total = targetTotal(classes, params);
  return total === null ? objective : { ...objective, targetBerths: total };
}
