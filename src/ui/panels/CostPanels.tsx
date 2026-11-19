/**
 * Panels of the anchoring plan and the cost estimate (D23, D24).
 */
import { useRef, useState } from 'react';
import { SEABED_FRICTION, SEABED_KEYS } from '../../engine/mooring';
import { MAX_SPLAY_ANGLE, MOORING_NOTES, resetAnchoringFactors, type AnchoringParams, type BuoySinkerMethod, type BuoyTableId, type Seabed } from '../../engine/anchoring';
import { BOM_GROUPS, seriesNames, type BomGroup } from '../../engine/bom';
import type { Layout } from '../../engine/model';
import { parsePriceListFile, priceListToXlsx } from '../../catalog/priceList';
import { appStore, useAppStore } from '../../state/store';
import { anchoringStatusLabel, excludesLabel, useCostModel, type CostModel } from '../costModel';
import { mooringPackage } from '../export/mooringPackage';
import { bomWorkbook } from '../export/bomXlsx';
import { downloadBytes, readFileAsBytes, safeFileName, XLSX_MIME } from '../export/download';
import { formatCount, formatEuro, formatKn, formatLength } from '../format';
import { gaugeLevels, findGauges, type Gauge } from '../../state/waterLevels';
import { useSitePosition } from '../sitePosition';
import { DESIGN_DEPTH_RANGE, resetSiteDepthTries, runSiteDepthLookup, siteDepthKey, useSiteDepthStatus } from '../siteDepth';
import { DEPTH_SOURCES, MIN_DEPTH_COVERAGE } from '../../state/depth';
import { useT } from '../useT';
import { Button, NumberField, OptionalNumberField, Section } from './fields';
import { IssueList } from './IssueList';

const state = () => appStore.getState();
const SEABEDS: readonly Seabed[] = SEABED_KEYS;
const SINKER_METHODS: BuoySinkerMethod[] = ['table', 'factor'];
const BUOY_TABLES: BuoyTableId[] = ['batunionen', 'topMarine'];

type NumericAnchoring = { [K in keyof AnchoringParams]: AnchoringParams[K] extends number ? K : never }[keyof AnchoringParams];

/** D36: sizing of the stern-buoy sinkers and chains; shown when the project has stern buoys. */
function BuoyFields() {
  const t = useT();
  const method = useAppStore((s) => s.project.anchoring.buoySinkerMethod);
  const table = useAppStore((s) => s.project.anchoring.buoyTable);
  const exposed = useAppStore((s) => s.project.anchoring.buoyExposed);
  const shown = useAppStore((s) => s.project.params.berthType === 'sternBuoy' || s.project.layouts.some((l) => l.berths.some((b) => b.buoy)));
  if (!shown) return null;
  return (
    <>
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.buoyTable')}
        <select
          className="rounded border border-slate-300 px-1 py-0.5 text-sm"
          value={table}
          onChange={(e) => state().setAnchoring({ buoyTable: e.target.value as BuoyTableId })}
        >
          {BUOY_TABLES.map((x) => (
            <option key={x} value={x}>
              {t(`buoyTable.${x}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.buoyExposed')}
        <input type="checkbox" checked={exposed} onChange={(e) => state().setAnchoring({ buoyExposed: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.buoySinkerMethod')}
        <select
          className="rounded border border-slate-300 px-1 py-0.5 text-sm"
          value={method}
          onChange={(e) => state().setAnchoring({ buoySinkerMethod: e.target.value as BuoySinkerMethod })}
        >
          {SINKER_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`buoySinker.${m}`)}
            </option>
          ))}
        </select>
      </label>
      {method === 'factor' && <AnchoringField name="buoySinkerFactor" min={0.1} max={20} step={0.5} />}
      <AnchoringField name="buoyChainFactor" min={1} max={10} step={0.01} />
      <AnchoringField name="buoyLift" min={0} max={5} step={0.1} />
    </>
  );
}

function AnchoringField({ name, min, max, step }: { name: NumericAnchoring; min: number; max: number; step?: number }) {
  const t = useT();
  const value = useAppStore((s) => s.project.anchoring[name]);
  return (
    <NumberField
      label={t(`anchoring.${name}`)}
      value={value}
      min={min}
      max={max}
      {...(step === undefined ? {} : { step })}
      onChange={(v) => state().setAnchoring({ [name]: v }, { coalesce: `anchoring:${name}` })}
    />
  );
}

/** D50: optional normal high or low water (empty = not known). */
function NormalLevelField({ name, min = 0 }: { name: 'normalHighWater' | 'normalLowWater' | 'quayLevel'; min?: number }) {
  const t = useT();
  const value = useAppStore((s) => s.project.anchoring[name]);
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
      <span>{t(`anchoring.${name}`)}</span>
      <div className="w-20 shrink-0">
        <OptionalNumberField label={t(`anchoring.${name}`)} value={value ?? undefined} min={min} max={20} onChange={(v) => state().setAnchoring({ [name]: v ?? null }, { coalesce: `anchoring:${name}` })} />
      </div>
    </div>
  );
}

/** I121: the design depth; typing one in stops it following the lookup around the site position. */
function DepthField() {
  const t = useT();
  const depth = useAppStore((s) => s.project.anchoring.depth);
  return (
    <NumberField
      label={t('anchoring.depth')}
      value={depth}
      min={DESIGN_DEPTH_RANGE[0]}
      max={DESIGN_DEPTH_RANGE[1]}
      onChange={(v) => state().setDesignDepth(v, { coalesce: 'anchoring:depth' })}
    />
  );
}

/** I121: mean depth around the site position (EMODnet at sea, SYKE's lake depth zones), by itself or on request. */
function SiteDepthLookup() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const settings = useAppStore((s) => s.project.siteDepth);
  const depth = useAppStore((s) => s.project.anchoring.depth);
  const { position } = useSitePosition();
  const status = useSiteDepthStatus();
  const len = (m: number) => formatLength(m, language);
  const r = settings.result;
  const busy = status.kind === 'running';
  const applied = r !== null && Math.round(r.depth * 10) / 10 === depth;
  return (
    <div className="space-y-1 rounded border border-slate-200 p-2" data-testid="site-depth">
      <div className="text-xs font-semibold text-slate-600">{t('siteDepth.title')}</div>
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('siteDepth.auto')}
        <input
          type="checkbox"
          data-testid="site-depth-auto"
          checked={settings.auto}
          onChange={(e) => {
            const on = e.target.checked;
            resetSiteDepthTries();
            // A kept lookup of the same position applies at once; otherwise the lookup runs by itself.
            if (on && r && position && siteDepthKey(r.position, r.radius) === siteDepthKey(position, settings.radius) && !applied) state().applySiteDepth(r);
            state().setSiteDepth({ auto: on });
          }}
        />
      </label>
      <NumberField label={t('siteDepth.radius')} value={settings.radius} min={20} max={2000} step={10} onChange={(v) => state().setSiteDepth({ radius: v })} />
      <Button disabled={!position || busy} onClick={() => position && void runSiteDepthLookup(position, settings.radius)}>
        {t('siteDepth.run')}
      </Button>
      {busy && (
        <span role="status" className="ml-2 animate-pulse text-xs text-sky-800">
          {t('siteDepth.running')} {status.done} / {status.total}
        </span>
      )}
      {!position && <p className="text-xs text-slate-600">{t('siteDepth.noPosition')}</p>}
      {status.kind === 'error' && (
        <p role="alert" className="text-xs text-red-700">
          {t('siteDepth.error')} {status.message}
        </p>
      )}
      {status.kind === 'none' && <p className="text-xs text-amber-800">{t('siteDepth.none')}</p>}
      {status.kind === 'outOfRange' && (
        <p className="text-xs text-amber-800">
          {t('siteDepth.outOfRange')} {len(status.depth)} m ({len(DESIGN_DEPTH_RANGE[0])}–{formatCount(DESIGN_DEPTH_RANGE[1], language)} m).
        </p>
      )}
      {r && (
        <p className="text-xs text-slate-600" data-testid="site-depth-result">
          {t('siteDepth.result')} {len(r.depth)} m ({t('siteDepth.range')} {len(r.min)}–{len(r.max)} m; {r.source === 'emodnet' ? 'EMODnet' : 'SYKE'};{' '}
          {formatCount(Math.round(r.coverage * 100), language)} % {t('siteDepth.coverage')}; {t('siteDepth.within')} {formatCount(r.radius, language)} m {t('siteDepth.of')} {r.position.lat.toFixed(4)},{' '}
          {r.position.lon.toFixed(4)}; {r.fetchedOn}) · {applied ? t('siteDepth.applied') : t('siteDepth.notApplied')}
        </p>
      )}
      {r && r.coverage < MIN_DEPTH_COVERAGE && <p className="text-xs text-amber-800">{t('siteDepth.lowCoverage')}</p>}
      <p className="text-xs text-slate-500">
        {t('siteDepth.note')} {DEPTH_SOURCES.emodnet}; {DEPTH_SOURCES.syke}.
      </p>
    </div>
  );
}

/** D50: characteristic water levels of a gauge near the site (FMI mareographs, SYKE stations). */
function WaterLevelLookup() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const info = useAppStore((s) => s.project.waterLevels);
  const { position } = useSitePosition();
  const [gauges, setGauges] = useState<Gauge[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const len = (m: number) => formatLength(m, language);
  const find = async () => {
    if (!position) return;
    setError(null);
    setBusy(t('levels.finding'));
    try {
      setGauges((await findGauges(position.lat, position.lon)).slice(0, 8));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const use = async (g: Gauge) => {
    setError(null);
    setBusy(t('levels.reading'));
    try {
      state().applyWaterLevels(await gaugeLevels(g, { onProgress: (n) => setBusy(`${t('levels.reading')} ${n}`) }));
      setGauges(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-1 rounded border border-slate-200 p-2" data-testid="water-levels">
      <div className="text-xs font-semibold text-slate-600">{t('levels.title')}</div>
      <Button disabled={!position || busy !== null} onClick={() => void find()}>
        {t('levels.find')}
      </Button>
      {busy && (
        <span role="status" className="ml-2 animate-pulse text-xs text-sky-800">
          {busy}
        </span>
      )}
      {!position && <p className="text-xs text-amber-800">{t('levels.noPosition')}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {t('levels.error')} {error}
        </p>
      )}
      {gauges && (
        <ul className="space-y-0.5 text-xs" aria-label={t('levels.title')}>
          {gauges.map((g) => (
            <li key={`${g.source}-${g.id}`} className="flex items-center justify-between gap-1">
              <span>
                {g.name}
                {g.waterBody && g.waterBody !== g.name ? ` (${g.waterBody})` : ''} · {len(g.distance / 1000)} km · {t(g.source === 'fmi' ? 'levels.sea' : 'levels.lake')}
                {g.active ? '' : `, ${t('levels.ended')}`}
              </span>
              <Button disabled={busy !== null} onClick={() => void use(g)}>
                {t('levels.use')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {info && (
        <p className="text-xs text-slate-600">
          {t('levels.applied')} {info.station} ({t(info.source === 'fmi' ? 'levels.sea' : 'levels.lake')}, {len(info.distance / 1000)} km, {info.startYear}–{info.endYear}): {t('levels.values')}{' '}
          {[info.levels.hw, info.levels.mhw, info.levels.mw, info.levels.mnw, info.levels.nw].map(len).join(' / ')} m · {info.fetchedOn}
        </p>
      )}
      <p className="text-xs text-slate-500">{t('levels.note')}</p>
    </div>
  );
}

/** D64: the cohesive model of the spec (5.3), off by default. */
function CohesiveFields() {
  const t = useT();
  const cohesive = useAppStore((s) => s.project.anchoring.cohesive);
  const seabed = useAppStore((s) => s.project.anchoring.seabed);
  const keys = ['Su_z', 'Su_a', 'A', 'B', 'z', 'gammaB', 'massDryKg'] as const;
  return (
    <>
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        <span>
          {t('anchoring.cohesiveOn')}
          {seabed === 'softClayMud' && !cohesive ? ' (!)' : ''}
        </span>
        <input
          type="checkbox"
          data-testid="cohesive-on"
          checked={cohesive !== null}
          onChange={(e) =>
            // The fields start empty-ish: every value has to be entered from soil data (no defaults in the spec).
            state().setAnchoring({ cohesive: e.target.checked ? { Su_z: 0, Su_a: 0, A: 0, B: 0, z: 0, gammaB: 0, massDryKg: 0 } : null })
          }
        />
      </label>
      {cohesive &&
        keys.map((k) => (
          <NumberField
            key={k}
            label={t(`cohesive.${k}`)}
            value={cohesive[k]}
            min={0}
            max={k === 'massDryKg' ? 50000 : 1000}
            step={k === 'massDryKg' ? 100 : 0.1}
            onChange={(v) => state().setAnchoring({ cohesive: { ...cohesive, [k]: v } }, { coalesce: `anchoring:cohesive:${k}` })}
          />
        ))}
    </>
  );
}

/** Left sidebar: parameters of the anchoring plan (D64: docs/ANKKUROINTI_MITOITUS_SPEC.md §2). */
export function AnchoringSection() {
  const t = useT();
  const seabed = useAppStore((s) => s.project.anchoring.seabed);
  const friction = useAppStore((s) => s.project.anchoring.friction);
  const anchorsPerLine = useAppStore((s) => s.project.anchoring.maxAnchorsPerLine);
  const winter = useAppStore((s) => s.project.anchoring.winterInWater);
  const capacityFactor = useAppStore((s) => s.project.anchoring.capacityFactor);
  const capacitySource = useAppStore((s) => s.project.anchoring.capacityFactorSource);
  const range = SEABED_FRICTION[seabed].range;
  return (
    <Section title={t('section.anchoring')} defaultOpen={false}>
      <DepthField />
      <SiteDepthLookup />
      <AnchoringField name="highWater" min={0} max={10} />
      <AnchoringField name="lowWater" min={0} max={10} />
      <NormalLevelField name="normalHighWater" />
      <NormalLevelField name="normalLowWater" />
      <NormalLevelField name="quayLevel" min={-5} />
      <WaterLevelLookup />
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.seabed')}
        <select
          className="max-w-[11rem] rounded border border-slate-300 px-1 py-0.5 text-sm"
          data-testid="seabed"
          value={seabed}
          onChange={(e) => state().setAnchoring({ seabed: e.target.value as Seabed })}
        >
          {SEABEDS.map((s) => (
            <option key={s} value={s}>
              {t(`seabed.${s}`)}
            </option>
          ))}
        </select>
      </label>
      {seabed !== 'softClayMud' && range && (
        <NumberField
          label={`${t('anchoring.friction')} (${range[0]}–${range[1]})`}
          value={friction[seabed]}
          min={0.05}
          max={1.5}
          step={0.05}
          onChange={(v) => state().setAnchoring({ friction: { ...friction, [seabed]: v } }, { coalesce: `anchoring:friction:${seabed}` })}
        />
      )}
      <AnchoringField name="slopeDeg" min={0} max={30} step={1} />
      <CohesiveFields />
      <AnchoringField name="capacityFactor" min={0.1} max={5} step={0.1} />
      {capacityFactor !== 1 && (
        <label className="flex flex-col gap-0.5 text-sm text-slate-700">
          {t('anchoring.capacityFactorSource')}
          <input
            className="rounded border border-slate-300 px-1 py-0.5 text-sm"
            data-testid="capacity-source"
            value={capacitySource}
            onChange={(e) => state().setAnchoring({ capacityFactorSource: e.target.value }, { coalesce: 'anchoring:capacityFactorSource' })}
          />
        </label>
      )}
      <AnchoringField name="windSpeed" min={0} max={80} step={1} />
      <p className="text-xs text-amber-800">{t('anchoring.windNote')}</p>
      <AnchoringField name="leewardFactor" min={0} max={1} step={0.05} />
      <AnchoringField name="waveLineLoad" min={0} max={100} step={0.5} />
      <AnchoringField name="waveMin" min={0} max={20} step={0.5} />
      <AnchoringField name="currentSpeed" min={0} max={5} step={0.1} />
      <AnchoringField name="pontoonDraft" min={0} max={5} step={0.05} />
      <AnchoringField name="extraStatic" min={0} max={2000} step={1} />
      <AnchoringField name="iceLineLoad" min={0} max={200} step={1} />
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.winterInWater')}
        <input type="checkbox" checked={winter} onChange={(e) => state().setAnchoring({ winterInWater: e.target.checked })} />
      </label>
      <AnchoringField name="unevenFactor" min={1} max={3} step={0.05} />
      <AnchoringField name="lineSpacing" min={1} max={100} step={1} />
      <AnchoringField name="splayAngle" min={0} max={MAX_SPLAY_ANGLE} step={5} />
      <AnchoringField name="tipAnchorMinLength" min={0} max={1000} step={0.5} />
      <AnchoringField name="fingerPileMinLength" min={0} max={100} step={0.5} />
      <AnchoringField name="chainLengthFactor" min={1} max={10} step={0.5} />
      <AnchoringField name="chainSafetyFactor" min={1} max={10} step={0.1} />
      <AnchoringField name="corrosionAllowance" min={0} max={10} step={0.5} />
      <AnchoringField name="slidingSafetyFactor" min={1} max={5} step={0.1} />
      <AnchoringField name="maxAnchorMass" min={100} max={50000} step={100} />
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.maxAnchorsPerLine')}
        <select
          className="rounded border border-slate-300 px-1 py-0.5 text-sm"
          data-testid="anchors-per-line"
          value={anchorsPerLine}
          onChange={(e) => state().setAnchoring({ maxAnchorsPerLine: Number(e.target.value) })}
        >
          {[1, 2].map((n) => (
            <option key={n} value={n}>
              {t(n === 1 ? 'anchorsPerLine.1' : 'anchorsPerLine.2')}
            </option>
          ))}
        </select>
      </label>
      <AnchoringField name="pontoonFreeboard" min={0.1} max={3} step={0.05} />
      <AnchoringField name="waterDensity" min={990} max={1040} step={1} />
      <BuoyFields />
      <Button onClick={() => state().setAnchoring(resetAnchoringFactors(state().project.anchoring))}>{t('anchoring.resetFactors')}</Button>
      <p className="text-xs text-slate-500">{t('anchoring.note')}</p>
    </Section>
  );
}

const sumBy = <T,>(items: T[], key: (x: T) => string, value: (x: T) => number) => {
  const map = new Map<string, number>();
  for (const x of items) map.set(key(x), (map.get(key(x)) ?? 0) + value(x));
  return [...map.entries()];
};

function PriceListMissing() {
  const t = useT();
  const error = useAppStore((s) => s.priceListError);
  return <p className="text-sm text-slate-500">{error ? `${t('cost.priceListError')} ${error}` : t('cost.loading')}</p>;
}

/** D64: a factor of safety with the colour of the spec (§8): green ≥ target, yellow ≥ 1, red < 1. */
function Fos({ value, target }: { value: number | null | undefined; target: number }) {
  const language = useAppStore((s) => s.language);
  if (value === null || value === undefined || !Number.isFinite(value)) return <span>–</span>;
  const cls = value >= target - 1e-9 ? 'bg-green-100 text-green-900' : value >= 1 ? 'bg-yellow-100 text-yellow-900' : 'bg-red-100 text-red-900';
  return <span className={`rounded px-1 ${cls}`}>{value.toFixed(2).replace('.', language === 'fi' ? ',' : '.')}</span>;
}

/** Right sidebar: summary of the anchoring plan of the selected alternative (D64: spec §8). */
export function AnchoringSummary({ model }: { model: CostModel | null }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const project = useAppStore((s) => s.project);
  if (!model) {
    return (
      <Section title={t('section.anchoringPlan')}>
        <PriceListMissing />
      </Section>
    );
  }
  const { anchoring, priceList } = model;
  const a = project.anchoring;
  const name = (id: string | null) => (id ? (priceList.products.find((p) => p.id === id)?.name ?? id) : t('anchoring.none'));
  const chains = sumBy(anchoring.lines, (l) => name(l.chainId), (l) => l.chainLength);
  // D64: pile anchors without a product of the price list as one row.
  const anchors = sumBy(
    anchoring.lines.filter((l) => l.fixing === 'seabed'),
    (l) => (l.status === 'PILE' && !l.anchorId ? t('anchoring.pileAnchor') : name(l.anchorId)),
    (l) => l.anchorCount,
  );
  const wallFixings = anchoring.lines.filter((l) => l.fixing === 'wall').length;
  const piles = anchoring.piles.length;
  const maxLine = anchoring.lines.reduce((m, l) => Math.max(m, l.horizontalKn), 0);
  const buoys = anchoring.lines.filter((l) => l.role === 'buoy');
  const masses = anchoring.lines.filter((l) => l.role !== 'buoy' && l.fixing === 'seabed' && Number.isFinite(l.requiredAnchorKg)).map((l) => l.requiredAnchorKg);
  const maxSinker = buoys.reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0);
  const seabedLines = anchoring.lines.filter((l) => l.fixing === 'seabed' && l.role !== 'buoy');
  const worstAnchor = seabedLines.reduce((m, l) => Math.min(m, l.governing?.anchorFoS ?? Infinity), Infinity);
  const worstChain = anchoring.lines.reduce((m, l) => Math.min(m, l.chainFoS ?? Infinity), Infinity);
  const exportPackage = () => {
    const layout = project.layouts.find((l) => l.id === state().selectedLayoutId);
    if (!layout) return;
    const json = mooringPackage(project, layout, anchoring, new Date().toISOString().slice(0, 10), model.choices.pontoonFreeboard);
    downloadBytes(`${safeFileName(`${project.name}-${layout.id}-mooring-data`).normalize('NFKD').replace(/[^\w.-]+/g, '-')}.json`, new TextEncoder().encode(json), 'application/json');
  };
  return (
    <Section title={t('section.anchoringPlan')}>
      <div className="space-y-1 text-sm">
        {/* D64: the text the spec requires in the result view. */}
        <p className="rounded border border-amber-300 bg-amber-50 p-1 text-xs font-medium text-amber-900" data-testid="mooring-disclaimer">
          {t('mooring.disclaimer')}
        </p>
        <div className="flex justify-between">
          <span className="text-slate-600">{t('anchoring.lines')}</span>
          <span>{formatCount(anchoring.lines.length, language)}</span>
        </div>
        <div className="flex justify-between gap-2" data-testid="anchoring-status">
          <span className="text-slate-600">{t('anchoring.status')}</span>
          <span className={`text-right ${anchoring.lines.some((l) => l.status === 'PILE') ? 'font-medium text-amber-800' : ''}`}>{anchoringStatusLabel(t, anchoring.lines, language)}</span>
        </div>
        <div className="flex justify-between" data-testid="worst-anchor-fos">
          <span className="text-slate-600">{t('mooring.worstAnchor')}</span>
          <Fos value={Number.isFinite(worstAnchor) ? worstAnchor : null} target={a.slidingSafetyFactor} />
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">{t('mooring.worstChain')}</span>
          <Fos value={Number.isFinite(worstChain) ? worstChain : null} target={a.chainSafetyFactor} />
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">{t('anchoring.maxLine')}</span>
          <span>{formatKn(maxLine, language)} kN</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">{t('anchoring.maxMass')}</span>
          <span>{masses.length > 0 ? `${formatCount(Math.max(...masses), language)} kg` : '–'}</span>
        </div>
        {buoys.length > 0 && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('anchoring.buoys')}</span>
              <span>{formatCount(buoys.length, language)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('anchoring.maxSinker')}</span>
              <span>{formatCount(maxSinker, language)} kg</span>
            </div>
          </>
        )}
        <div className="text-xs font-medium text-slate-500">{t('anchoring.chains')}</div>
        {chains.map(([n, m]) => (
          <div key={n} className="flex justify-between gap-2 text-xs">
            <span className="truncate">{n}</span>
            <span className="shrink-0">{formatLength(m, language)} m</span>
          </div>
        ))}
        <div className="text-xs font-medium text-slate-500">{t('anchoring.anchors')}</div>
        {anchors.map(([n, c]) => (
          <div key={n} className="flex justify-between gap-2 text-xs">
            <span className="truncate">{n}</span>
            <span className="shrink-0">{formatCount(c, language)}</span>
          </div>
        ))}
        {piles > 0 && (
          <div className="flex justify-between gap-2 text-xs">
            <span className="truncate">{t('anchoring.endPiles')}</span>
            <span className="shrink-0">{formatCount(piles, language)}</span>
          </div>
        )}
        {wallFixings > 0 && (
          <div className="flex justify-between gap-2 text-xs">
            <span className="truncate">{t('anchoring.wallFixings')}</span>
            <span className="shrink-0">{formatCount(wallFixings, language)}</span>
          </div>
        )}
        {/* D64: the load table (spec §8). */}
        <details>
          <summary className="cursor-pointer text-xs text-slate-700">{t('mooring.loadTable')}</summary>
          <table className="mt-1 w-full text-xs" data-testid="mooring-loads">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="font-medium">{t('mooring.pontoon')}</th>
                <th className="font-medium">{t('mooring.case')}</th>
                <th className="text-right font-medium">{t('mooring.wind')}</th>
                <th className="text-right font-medium">{t('mooring.current')}</th>
                <th className="text-right font-medium">{t('mooring.wave')}</th>
                <th className="text-right font-medium">{t('mooring.uls')}</th>
              </tr>
            </thead>
            <tbody>
              {anchoring.loads.flatMap((pl) =>
                pl.cases.map((c) => (
                  <tr key={`${pl.id}-${c.id}`}>
                    <td>{pl.id}</td>
                    <td>{c.id}</td>
                    <td className="text-right">{formatKn(c.wind, language)}</td>
                    <td className="text-right">{formatKn(c.current, language)}</td>
                    <td className="text-right">{formatKn(c.wave, language)}</td>
                    <td className="text-right font-medium">{formatKn(c.F_uls, language)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          {anchoring.loads.some((pl) => pl.transfers.length > 0) && (
            <p className="mt-1 text-xs text-slate-600" data-testid="mooring-transfers">
              {t('mooring.transfers')}{' '}
              {anchoring.loads
                .flatMap((pl) => pl.transfers.map((x) => `${pl.id} ${x.case} → ${x.to} ${x.toCase}: ${formatKn(x.kN, language)} kN`))
                .join('; ')}
            </p>
          )}
        </details>
        {/* D64: per line the governing case (spec §8). */}
        <details>
          <summary className="cursor-pointer text-xs text-slate-700">
            {t('mooring.lineTable')} ({formatCount(seabedLines.length, language)})
          </summary>
          <table className="mt-1 w-full text-xs" data-testid="mooring-lines">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="font-medium">{t('mooring.line')}</th>
                <th className="font-medium">{t('mooring.case')}</th>
                <th className="text-right font-medium">Th</th>
                <th className="text-right font-medium">Fv</th>
                <th className="text-right font-medium">{t('mooring.chainFoS')}</th>
                <th className="text-right font-medium">{t('mooring.anchorFoS')}</th>
                <th className="text-right font-medium">kg</th>
              </tr>
            </thead>
            <tbody>
              {seabedLines.map((l) => (
                <tr key={l.id} title={l.pileReason ?? ''}>
                  <td>{l.id}</td>
                  <td>{l.governing ? `${l.governing.case} ${l.governing.waterLevel}` : '–'}</td>
                  <td className="text-right">{l.governing ? formatKn(l.governing.Th, language) : '–'}</td>
                  <td className="text-right">{l.governing ? formatKn(l.governing.Fv, language) : '–'}</td>
                  <td className="text-right">
                    <Fos value={l.governing?.chainFoS} target={a.chainSafetyFactor} />
                  </td>
                  <td className="text-right">
                    <Fos value={l.governing?.anchorFoS} target={a.slidingSafetyFactor} />
                  </td>
                  <td className="text-right">{Number.isFinite(l.requiredAnchorKg) ? formatCount(l.requiredAnchorKg, language) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500">{t('mooring.legend')}</p>
        </details>
        <IssueList issues={anchoring.issues} testId="anchoring-issues" />
        <details>
          <summary className="cursor-pointer text-xs text-slate-700">{t('mooring.notes')}</summary>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-600" data-testid="mooring-notes">
            {MOORING_NOTES.map((n) => (
              <li key={n.code}>{n.text}</li>
            ))}
          </ul>
        </details>
        <Button onClick={exportPackage}>{t('mooring.export')}</Button>
        <p className="text-xs text-slate-500">{t('anchoring.compare')}</p>
      </div>
    </Section>
  );
}

function SeriesSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const t = useT();
  return (
    <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
      <span className="shrink-0">{label}</span>
      <select className="min-w-0 max-w-[13rem] rounded border border-slate-300 px-1 py-0.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('cost.auto')}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

const GROUP_KEY: Record<BomGroup, `bom.${BomGroup}`> = {
  pontoons: 'bom.pontoons',
  fingers: 'bom.fingers',
  gangways: 'bom.gangways',
  anchoring: 'bom.anchoring',
  fittings: 'bom.fittings',
  labour: 'bom.labour',
  plant: 'bom.plant',
};

/** Right sidebar: price list, product choices, bill of materials and cost estimate. */
export function CostSection({ layout, model }: { layout: Layout; model: CostModel | null }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const cost = useAppStore((s) => s.project.cost);
  const projectName = useAppStore((s) => s.project.name);
  const fileInput = useRef<HTMLInputElement>(null);
  const euro = (x: number | null) => (x === null ? '–' : `${formatEuro(x, language)} €`);

  const importFile = async (file: File) => {
    try {
      const result = parsePriceListFile(await readFileAsBytes(file), file.name);
      if (result.ok) {
        state().setCost({ priceList: result.priceList });
        state().setNotice(null);
      } else {
        state().setNotice(`${t('cost.importFailed')} ${result.errors.slice(0, 5).join(' ')}${result.errors.length > 5 ? ' …' : ''}`);
      }
    } catch {
      state().setNotice(t('cost.importFailed'));
    }
  };

  const header = (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">{t('cost.priceList')}</span>
        <span className="truncate text-right">{model ? `${model.priceList.title}${model.imported ? ` (${t('cost.imported')})` : ` (${t('cost.builtIn')})`}` : '–'}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button onClick={() => fileInput.current?.click()}>{t('cost.import')}</Button>
        <input
          ref={fileInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          data-testid="import-price-list"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
        {model && (
          <Button onClick={() => downloadBytes('hinnasto.xlsx', priceListToXlsx(model.priceList, model.vatPct), XLSX_MIME)}>{t('cost.download')}</Button>
        )}
        {cost.priceList && <Button onClick={() => state().setCost({ priceList: null })}>{t('cost.useBuiltIn')}</Button>}
      </div>
    </div>
  );

  if (!model) {
    return (
      <Section title={t('section.cost')}>
        {header}
        <PriceListMissing />
      </Section>
    );
  }
  const { estimate, priceList, choices } = model;
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-2 text-sm ${strong ? 'font-semibold text-slate-900' : ''}`}>
      <span className={strong ? '' : 'text-slate-600'}>{label}</span>
      <span className="shrink-0 whitespace-nowrap text-right">{value}</span>
    </div>
  );
  const pct = (key: string) => priceList.parameters.find((p) => p.key === key)?.value ?? 0;
  const excludes = excludesLabel(t, estimate.unpriced.length);
  return (
    <Section title={t('section.cost')}>
      {header}
      <SeriesSelect
        label={t('cost.pontoonSeries')}
        value={cost.pontoonSeries}
        options={seriesNames(priceList, 'pontoon')}
        onChange={(pontoonSeries) => state().setCost({ pontoonSeries })}
      />
      <SeriesSelect
        label={t('cost.fingerSeries')}
        value={cost.fingerSeries}
        options={seriesNames(priceList, 'finger')}
        onChange={(fingerSeries) => state().setCost({ fingerSeries })}
      />
      {layout.fingers.some((f) => f.kind === 'boom') && (
        <SeriesSelect
          label={t('cost.boomSeries')}
          value={cost.boomSeries ?? ''}
          options={seriesNames(priceList, 'finger')}
          onChange={(boomSeries) => state().setCost({ boomSeries })}
        />
      )}
      <SeriesSelect
        label={t('cost.gangwaySeries')}
        value={cost.gangwaySeries}
        options={seriesNames(priceList, 'gangway')}
        onChange={(gangwaySeries) => state().setCost({ gangwaySeries })}
      />
      <p className="text-xs text-slate-500">
        {t('cost.inUse')}: {choices.pontoonSeries ?? '–'} · {choices.fingerSeries ?? '–'}
        {layout.fingers.some((f) => f.kind === 'boom') ? ` · ${choices.boomSeries ?? '–'}` : ''} · {choices.gangwaySeries ?? '–'}
      </p>

      <div className="space-y-0.5 border-t border-slate-100 pt-1">
        {BOM_GROUPS.map((g) => row(t(GROUP_KEY[g]), euro(estimate.byGroup[g])))}
        {row(t('cost.subtotal'), euro(estimate.subtotal))}
        {row(`${t('cost.overhead')} ${pct('site_overhead_pct')} %`, euro(estimate.overhead))}
        {row(`${t('cost.contingency')} ${pct('contingency_pct')} %`, euro(estimate.contingency))}
        {row(`${t('cost.totalVat0')}${excludes}`, euro(estimate.totalVat0), true)}
        {row(`${t('cost.vat')} ${estimate.vatPct} %`, euro(estimate.vat))}
        {row(`${t('cost.totalWithVat')}${excludes}`, euro(estimate.totalWithVat), true)}
        {row(t('cost.range'), `${euro(estimate.range[0])} … ${euro(estimate.range[1])}`)}
        {row(t('cost.perBerth'), euro(estimate.perBerth))}
        {row(t('cost.perPierMetre'), euro(estimate.perPierMetre))}
      </div>
      {/* D62: everything the totals leave out, by name. */}
      {estimate.unpriced.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-1" data-testid="unpriced-items">
          <div className="text-xs font-medium text-amber-900">
            {t('cost.unpriced')}: {formatCount(estimate.unpriced.length, language)}
          </div>
          <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-900">
            {estimate.unpriced.map((u, i) => (
              <li key={i} title={u.reason}>
                {u.name}: {u.unit === 'pcs' ? formatCount(u.quantity, language) : formatLength(u.quantity, language)} {t(`unit.${u.unit}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* D65: what the plan places on the piers. */}
      {estimate.equipment.items.length > 0 && (
        <p className="text-xs text-slate-600" data-testid="equipment-summary" title={t('equipment.note')}>
          {t('legend.ladder')} {formatCount(estimate.equipment.items.filter((x) => x.kind === 'ladder').length, language)} · {t('legend.safetyPost')}{' '}
          {formatCount(estimate.equipment.items.filter((x) => x.kind === 'safetyPost').length, language)} · {t('legend.pedestal')}{' '}
          {formatCount(estimate.equipment.items.filter((x) => x.kind === 'pedestal').length, language)}
        </p>
      )}
      <p className="text-xs text-slate-500">{t('cost.benchmark')}</p>
      {estimate.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
          {estimate.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <details>
        <summary className="cursor-pointer text-sm text-slate-700">{t('cost.bom')} ({formatCount(estimate.lines.length, language)})</summary>
        <table className="mt-1 w-full text-xs" data-testid="bom-lines">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="font-medium">{t('cost.product')}</th>
              <th className="text-right font-medium">{t('cost.quantity')}</th>
              <th className="text-right font-medium">€</th>
            </tr>
          </thead>
          <tbody>
            {estimate.lines.map((l) => (
              <tr key={`${l.group}-${l.productId}`} title={`${l.basis}\n${l.supplier} · ${l.sourceUrl} (${l.sourceDate})${l.note ? `\n${l.note}` : ''}`}>
                <td className="truncate pr-1">{l.name}</td>
                <td className="whitespace-nowrap text-right">
                  {l.unit === 'pcs' ? formatCount(l.orderQuantity, language) : formatLength(l.orderQuantity, language)} {t(`unit.${l.unit}`)}
                </td>
                <td className="whitespace-nowrap pl-1 text-right">{l.total === null ? '–' : formatEuro(l.total, language)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <Button
        onClick={() =>
          downloadBytes(
            // ASCII only: Chromium falls back to "download" for some characters (e.g. the en dash).
            `${safeFileName(`${projectName}-${layout.id}-bom`).normalize('NFKD').replace(/[^\w.-]+/g, '-')}.xlsx`,
            bomWorkbook(state().project, layout, model, new Date().toISOString().slice(0, 10)),
            XLSX_MIME,
          )
        }
      >
        {t('cost.exportBom')}
      </Button>
      <p className="text-xs text-slate-500">{t('cost.note')}</p>
    </Section>
  );
}

/** Both right-sidebar panels, sharing one computation. */
export function AnchoringAndCost({ layout }: { layout: Layout }) {
  const model = useCostModel();
  return (
    <>
      <AnchoringSummary model={model} />
      <CostSection layout={layout} model={model} />
    </>
  );
}
