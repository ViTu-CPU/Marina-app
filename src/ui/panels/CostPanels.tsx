/**
 * Panels of the anchoring plan and the cost estimate (D23, D24).
 */
import { useRef } from 'react';
import { resetAnchoringFactors, type AnchoringParams, type Seabed } from '../../engine/anchoring';
import { BOM_GROUPS, seriesNames, type BomGroup } from '../../engine/bom';
import type { Layout } from '../../engine/model';
import { parsePriceListFile, priceListToXlsx } from '../../catalog/priceList';
import { appStore, useAppStore } from '../../state/store';
import { useCostModel, type CostModel } from '../costModel';
import { bomWorkbook } from '../export/bomXlsx';
import { downloadBytes, readFileAsBytes, safeFileName, XLSX_MIME } from '../export/download';
import { formatCount, formatEuro, formatKn, formatLength } from '../format';
import { useT } from '../useT';
import { Button, NumberField, Section } from './fields';

const state = () => appStore.getState();
const SEABEDS: Seabed[] = ['clay', 'sand', 'rock'];

type NumericAnchoring = Exclude<keyof AnchoringParams, 'seabed' | 'friction'>;

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

/** Left sidebar: parameters of the anchoring plan. */
export function AnchoringSection() {
  const t = useT();
  const seabed = useAppStore((s) => s.project.anchoring.seabed);
  const friction = useAppStore((s) => s.project.anchoring.friction);
  return (
    <Section title={t('section.anchoring')} defaultOpen={false}>
      <AnchoringField name="depth" min={0.5} max={100} />
      <AnchoringField name="highWater" min={0} max={10} />
      <AnchoringField name="lowWater" min={0} max={10} />
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
      <AnchoringField name="windSpeed" min={0} max={60} step={1} />
      <AnchoringField name="dragCoefficient" min={0.1} max={3} step={0.05} />
      <AnchoringField name="profileHeightRatio" min={0.01} max={1} step={0.01} />
      <AnchoringField name="leewardFactor" min={0} max={1} step={0.05} />
      <AnchoringField name="lineSpacing" min={1} max={100} step={1} />
      <AnchoringField name="chainLengthFactor" min={1} max={10} step={0.5} />
      <AnchoringField name="chainSafetyFactor" min={1} max={10} step={0.1} />
      <AnchoringField name="corrosionAllowance" min={0} max={10} step={0.5} />
      <AnchoringField name="slidingSafetyFactor" min={1} max={5} step={0.1} />
      <AnchoringField name="maxAnchorMass" min={100} max={50000} step={100} />
      <AnchoringField name="pontoonFreeboard" min={0.1} max={3} step={0.05} />
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
  const anchors = sumBy(anchoring.lines, (l) => name(l.anchorId), (l) => l.anchorCount);
  const maxLine = anchoring.lines.reduce((m, l) => Math.max(m, l.horizontalKn), 0);
  const maxMass = anchoring.lines.reduce((m, l) => Math.max(m, l.requiredAnchorKg), 0);
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
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
          {anchoring.issues.map((i) => (
            <li key={`${i.code}-${i.message}`}>{i.message}</li>
          ))}
        </ul>
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
      <SeriesSelect
        label={t('cost.gangwaySeries')}
        value={cost.gangwaySeries}
        options={seriesNames(priceList, 'gangway')}
        onChange={(gangwaySeries) => state().setCost({ gangwaySeries })}
      />
      <p className="text-xs text-slate-500">
        {t('cost.inUse')}: {choices.pontoonSeries ?? '–'} · {choices.fingerSeries ?? '–'} · {choices.gangwaySeries ?? '–'}
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
