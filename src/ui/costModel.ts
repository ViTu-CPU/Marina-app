/**
 * Anchoring plan and cost estimate of the selected alternative (D23, D24), derived from
 * the project and the price list. Like fairways and issues, nothing here is stored.
 */
import { useMemo } from 'react';
import { anchoringPlan, type AnchoringResult } from '../engine/anchoring';
import { costEstimate, resolveChoices, type CostEstimate, type ResolvedChoices } from '../engine/bom';
import { DEFAULT_VAT_PCT, parameter, type PriceList } from '../engine/catalog';
import type { Layout, Project } from '../engine/model';
import { useAppStore } from '../state/store';

export interface CostModel {
  priceList: PriceList;
  /** True when the project carries an imported price list instead of the built-in one. */
  imported: boolean;
  vatPct: number;
  choices: ResolvedChoices;
  anchoring: AnchoringResult;
  estimate: CostEstimate;
}

/** The price list in use: the project's imported one, else the built-in one. */
export const priceListOf = (project: Project, builtIn: PriceList | null): PriceList | null => project.cost.priceList ?? builtIn;

export function computeCostModel(project: Project, layout: Layout, builtIn: PriceList | null): CostModel | null {
  const priceList = priceListOf(project, builtIn);
  if (!priceList) return null;
  const vatPct = parameter(priceList, 'vat_pct', DEFAULT_VAT_PCT);
  const choices = resolveChoices(priceList, project.cost, project.params);
  const anchoring = anchoringPlan({
    layout,
    site: project.site,
    classes: project.boatClasses,
    params: project.anchoring,
    priceList,
    vatPct,
    pierFreeboard: choices.pontoonFreeboard,
  });
  const estimate = costEstimate({ layout, site: project.site, priceList, choices, anchoring });
  return { priceList, imported: project.cost.priceList !== null, vatPct, choices, anchoring, estimate };
}

/** Cost model of the selected alternative, or null (no alternative, or no price list yet). */
export function useCostModel(): CostModel | null {
  const project = useAppStore((s) => s.project);
  const selectedId = useAppStore((s) => s.selectedLayoutId);
  const builtIn = useAppStore((s) => s.builtInPriceList);
  const layout = project.layouts.find((l) => l.id === selectedId) ?? null;
  const { site, boatClasses, params, anchoring, cost } = project;
  return useMemo(
    () => (layout ? computeCostModel({ ...project, site, boatClasses, params, anchoring, cost }, layout, builtIn) : null),
    // The model depends only on these parts of the project (not on its name or view state).
    [layout, site, boatClasses, params, anchoring, cost, builtIn],
  );
}
