/**
 * Panels of the anchoring plan and the cost estimate (D23, D24).
 */
import { useRef, useState } from 'react';
import { MAX_SPLAY_ANGLE, resetAnchoringFactors, type AnchoringParams, type AnchorType, type BuoySinkerMethod, type BuoyTableId, type Seabed } from '../../engine/anchoring';
import { BOM_GROUPS, seriesNames, type BomGroup } from '../../engine/bom';
import type { Layout } from '../../engine/model';
import { parsePriceListFile, priceListToXlsx } from '../../catalog/priceList';
import { appStore, useAppStore } from '../../state/store';
import { otherTypeText, useCostModel, type CostModel } from '../costModel';
import { bomWorkbook } from '../export/bomXlsx';
import { downloadBytes, readFileAsBytes, safeFileName, XLSX_MIME } from '../export/download';
import { formatCount, formatEuro, formatKn, formatLength } from '../format';
import { gaugeLevels, findGauges, type Gauge } from '../../state/waterLevels';
import { useSitePosition } from '../sitePosition';
import { useT } from '../useT';
import { Button, NumberField, OptionalNumberField, Section } from './fields';
import { IssueList } from './IssueList';

const state = () => appStore.getState();
const SEABEDS: Seabed[] = ['clay', 'sand', 'rock'];
const ANCHOR_TYPES: AnchorType[] = ['block', 'wedge'];
const SINKER_METHODS: BuoySinkerMethod[] = ['table', 'factor'];
const BUOY_TABLES: BuoyTableId[] = ['batunionen', 'topMarine'];

type NumericAnchoring = Exclude<keyof AnchoringParams, 'seabed' | 'friction' | 'anchorType' | 'buoySinkerMethod' | 'buoyTable' | 'buoyExposed' | 'normalHighWater' | 'normalLowWater' | 'quayLevel'>;

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

/** Left sidebar: parameters of the anchoring plan. */
export function AnchoringSection() {
  const t = useT();
  const seabed = useAppStore((s) => s.project.anchoring.seabed);
  const friction = useAppStore((s) => s.project.anchoring.friction);
  const anchorType = useAppStore((s) => s.project.anchoring.anchorType);
  return (
    <Section title={t('section.anchoring')} defaultOpen={false}>
      <AnchoringField name="depth" min={0.5} max={100} />
      <AnchoringField name="highWater" min={0} max={10} />
      <AnchoringField name="lowWater" min={0} max={10} />
      <NormalLevelField name="normalHighWater" />
      <NormalLevelField name="normalLowWater" />
      <NormalLevelField name="quayLevel" min={-5} />
      <WaterLevelLookup />
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.seabed')}
        <select
          className="rounded border border-slate-300 px-1 py-0.5 text-sm"
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
      <NumberField
        label={t('anchoring.friction')}
        value={friction[seabed]}
        min={0.05}
        max={1.5}
        step={0.05}
        onChange={(v) => state().setAnchoring({ friction: { ...friction, [seabed]: v } }, { coalesce: `anchoring:friction:${seabed}` })}
      />
      <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
        {t('anchoring.anchorType')}
        <select
          className="rounded border border-slate-300 px-1 py-0.5 text-sm"
          value={anchorType}
          onChange={(e) => state().setAnchoring({ anchorType: e.target.value as AnchorType })}
        >
          {ANCHOR_TYPES.map((a) => (
            <option key={a} value={a}>
              {t(`anchorType.${a}`)}
            </option>
          ))}
        </select>
      </label>
      <AnchoringField name="windSpeed" min={0} max={60} step={1} />
      <AnchoringField name="dragCoefficient" min={0.1} max={3} step={0.05} />
      <AnchoringField name="profileHeightRatio" min={0.01} max={1} step={0.01} />
      <AnchoringField name="leewardFactor" min={0} max={1} step={0.05} />
      <AnchoringField name="lineSpacing" min={1} max={100} step={1} />
      <AnchoringField name="waveLoad" min={0} max={50} step={0.5} />
      <AnchoringField name="splayAngle" min={0} max={MAX_SPLAY_ANGLE} step={5} />
      <AnchoringField name="tipAnchorMinLength" min={0} max={1000} step={0.5} />
      <AnchoringField name="fingerPileMinLength" min={0} max={100} step={0.5} />
      <AnchoringField name="chainLengthFactor" min={1} max={10} step={0.5} />
      <AnchoringField name="chainSafetyFactor" min={1} max={10} step={0.1} />
      <AnchoringField name="corrosionAllowance" min={0} max={10} step={0.5} />
      <AnchoringField name="slidingSafetyFactor" min={1} max={5} step={0.1} />
      <AnchoringField name="maxAnchorMass" min={100} max={50000} step={100} />
      <AnchoringField name="pontoonFreeboard" min={0.1} max={3} step={0.05} />
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

/** Right sidebar: summary of the anchoring plan of the selected alternative. */
export function AnchoringSummary({ model }: { model: CostModel | null }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  if (!model) {
    return (
      <Section title={t('section.anchoringPlan')}>
        <PriceListMissing />
      </Section>
    );
  }
  const { anchoring, priceList } = model;
  const name = (id: string | null) => (id ? (priceList.products.find((p) => p.id === id)?.name ?? id) : t('anchoring.none'));
  const chains = sumBy(anchoring.lines, (l) => name(l.chainId), (l) => l.chainLength);
  const anchors = sumBy(
    anchoring.lines.filter((l) => l.fixing === 'seabed'),
    (l) => name(l.anchorId),
    (l) => l.anchorCount,
  );
  const wallFixings = anchoring.lines.filter((l) => l.fixing === 'wall').length;
  const piles = anchoring.piles.length;
  const maxLine = anchoring.lines.reduce((m, l) => Math.max(m, l.horizontalKn), 0);
  // Stern-buoy sinkers (D36) are listed on their own.
  const buoys = anchoring.lines.filter((l) => l.role === 'buoy');
  const maxMass = anchoring.lines.filter((l) => l.role !== 'buoy').reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0);
  const maxSinker = buoys.reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0);
  return (
    <Section title={t('section.anchoringPlan')}>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">{t('anchoring.lines')}</span>
          <span>{formatCount(anchoring.lines.length, language)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">{t('anchoring.maxLine')}</span>
          <span>{formatKn(maxLine, language)} kN</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">{t('anchoring.maxMass')}</span>
          <span>{formatCount(maxMass, language)} kg</span>
        </div>
        {anchoring.comparison && (
          <>
            <div className="flex justify-between">
              <span className="text-slate-600">{t('anchoring.totalMass')}</span>
              <span>{formatCount(anchoring.comparison.current.totalKg, language)} kg</span>
            </div>
            {/* I102: the same plan with the other anchor type. */}
            <div className="flex justify-between gap-2" data-testid="anchoring-other-type">
              <span className="text-slate-600">{t(`anchoring.ifOther.${anchoring.comparison.other.anchorType}`)}</span>
              <span className="text-right">{otherTypeText(anchoring.comparison.other, t, language)}</span>
            </div>
          </>
        )}
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
        <IssueList issues={anchoring.issues} testId="anchoring-issues" />
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
      <span>{value}</span>
    </div>
  );
  const pct = (key: string) => priceList.parameters.find((p) => p.key === key)?.value ?? 0;
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
        {row(t('cost.totalVat0'), euro(estimate.totalVat0), true)}
        {row(`${t('cost.vat')} ${estimate.vatPct} %`, euro(estimate.vat))}
        {row(t('cost.totalWithVat'), euro(estimate.totalWithVat), true)}
        {row(t('cost.range'), `${euro(estimate.range[0])} … ${euro(estimate.range[1])}`)}
        {row(t('cost.perBerth'), euro(estimate.perBerth))}
        {row(t('cost.perPierMetre'), euro(estimate.perPierMetre))}
      </div>
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
        <table className="mt-1 w-full text-xs">
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
