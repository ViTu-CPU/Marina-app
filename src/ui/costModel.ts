/**
 * Anchoring plan and cost estimate of the selected alternative (D23, D24), derived from
 * the project and the price list. Like fairways and issues, nothing here is stored.
 */
import { useMemo } from 'react';
import { anchoringPlan, type AnchoringResult, type AnchorTotals } from '../engine/anchoring';
import { costEstimate, resolveChoices, type CostEstimate, type ResolvedChoices } from '../engine/bom';
import { DEFAULT_VAT_PCT, parameter, type PriceList } from '../engine/catalog';
import type { Layout, Project } from '../engine/model';
import { pierAxis } from '../engine/rows';
import { bearingOf, WAVE_SECTORS, waveAssessment, waveSectorBearing } from '../engine/waves';
import type { Language } from '../i18n';
import type { StringKey } from '../i18n';
import { useAppStore } from '../state/store';
import { formatCount, formatLength } from './format';

export interface CostModel {
  priceList: PriceList;
  /** True when the project carries an imported price list instead of the built-in one. */
  imported: boolean;
  vatPct: number;
  choices: ResolvedChoices;
  anchoring: AnchoringResult;
  estimate: CostEstimate;
}

/**
 * D45: wave directions for the anchoring plan from the wave screening (sectors with a fetch), and
 * (I104) the 50-year Hm0 of each, null where the screening has no wind for it.
 */
export function waveInput(project: Project, layout: Layout): { from: number[]; exceeding: string[]; hs50: (number | null)[] } {
  const assessment = waveAssessment(project.waves, project.anchoring.depth, layout.piers.map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) })));
  const sectors = project.waves.sectors.flatMap((x, k) => (x.fetch > 0 ? [k] : []));
  const hs = (k: number) => assessment?.sectors.find((x) => x.sector === k)?.events.find((e) => e.event === 'fiftyYear')?.waves.hm0 ?? null;
  return { from: sectors.map(waveSectorBearing), exceeding: (assessment?.bad ?? []).map((k) => WAVE_SECTORS[k]!), hs50: sectors.map(hs) };
}

/** I102: "12 345 kg (largest 3 260 kg, chains up to 47.0 m)" for the other anchor type. */
export function otherTypeText(o: AnchorTotals, t: (key: StringKey) => string, language: Language): string {
  return `${formatCount(o.totalKg, language)} kg (${t('anchoring.largest')} ${formatCount(o.maxKg, language)} kg, ${t('anchoring.chainsUpTo')} ${formatLength(o.longestChainM, language)} m)`;
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
    buoyDepthFactor: project.params.buoyDepthFactor,
    moduleLengths: project.params.pierModuleLengths,
    gangwayReach: project.params.gangwayLength,
    // D45: the directions with open water, and those whose waves exceed the criteria.
    waves: waveInput(project, layout),
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
