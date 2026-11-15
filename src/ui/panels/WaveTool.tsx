/**
 * Wave screening window (D40, D47): estimates wind waves at the site for eight direction sectors
 * from the fetch of each (0 = no open water), the depth and extreme winds, compares them with the
 * wave climate criteria (AS 3962-2001 Table 4.2 or UFC 4-152-07) and tells which directions
 * exceed them and whether the berths look to need a wave attenuator or a breakwater.
 * Preliminary only.
 */
import { useState } from 'react';
import { breakwaterProposal, weightPerMetre, type BreakwaterProposal } from '../../engine/breakwater';
import { pierAxis } from '../../engine/rows';
import {
  bearingOf,
  sectorWind,
  WAVE_SECTORS,
  waveAssessment,
  waveSectorBearing,
  type SectorAssessment,
  type WaveCriteria,
  type WaveQuality,
  type WaveSectorInput,
} from '../../engine/waves';
import { sectorBearing, windClimate } from '../../engine/wind';
import type { StringKey } from '../../i18n';
import { sectorFetches, RAY_STEP_DEG } from '../../engine/fetchRays';
import { parseLatLon } from '../../state/geo';
import { lookupFetch, OSM_SOURCE } from '../../state/overpass';
import { fetchWindHistory } from '../../state/openMeteo';
import { appStore, useAppStore } from '../../state/store';
import { formatCount, formatLength, formatPercent } from '../format';
import { useSitePosition } from '../sitePosition';
import { useT } from '../useT';
import { Button, NumberField, OptionalNumberField } from './fields';
import { speedClassLabel, SPEED_COLORS, WindRose } from './WindRose';

const state = () => appStore.getState();
const QUALITIES: WaveQuality[] = ['excellent', 'good', 'moderate'];
const CRITERIA: WaveCriteria[] = ['as3962', 'ufc'];
const AVERAGING = [600, 3600] as const;

/** Wave heights with two decimals: the criteria are 0.15–0.61 m (U25). */
const formatHeight = (m: number, language: 'en' | 'fi') => new Intl.NumberFormat(language === 'fi' ? 'fi-FI' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m);

function OptionalRow({ label, value, min, max, placeholder, onChange }: { label: string; value: number | null; min: number; max: number; placeholder?: string; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-slate-700">
      <span>{label}</span>
      <div className="w-24 shrink-0">
        <OptionalNumberField label={label} value={value ?? undefined} min={min} max={max} {...(placeholder === undefined ? {} : { placeholder })} onChange={(v) => onChange(v ?? null)} />
      </div>
    </div>
  );
}

const RADII_KM = [5, 10, 20, 30, 50] as const;

/** D47, I94: the fetch of every sector from the OpenStreetMap shoreline. */
function AutoFetchSection() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const { position } = useSitePosition();
  const [radiusKm, setRadiusKm] = useState<number>(waves.autoFetch ? waves.autoFetch.radius / 1000 : 20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const af = waves.autoFetch;
  const run = async () => {
    if (!position) return;
    setBusy(true);
    setError(null);
    try {
      const radius = radiusKm * 1000;
      const r = await lookupFetch(position.lat, position.lon, radius);
      const round = (m: number) => Math.round(m * 10) / 10;
      state().setWaves({
        sectors: waves.sectors.map((x, k) => ({ ...x, fetch: round(r.sectors[k]!.fetch) })),
        autoFetch: { source: OSM_SOURCE, position, radius, stepDeg: RAY_STEP_DEG, distances: r.distances.map(round), fetchedOn: new Date().toISOString().slice(0, 10) },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const open = af ? sectorFetches(af.distances, af.radius, af.stepDeg).map((x) => x.open) : [];
  return (
    <div className="space-y-1" data-testid="auto-fetch">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('autoFetch.title')}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <label className="flex items-center gap-1">
          {t('autoFetch.radius')}
          <select aria-label={t('autoFetch.radius')} className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
            {RADII_KM.map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
        <Button variant="primary" disabled={!position || busy} onClick={() => void run()}>
          {t('autoFetch.run')}
        </Button>
        {busy && (
          <span role="status" className="animate-pulse text-xs text-sky-800">
            {t('autoFetch.running')}
          </span>
        )}
      </div>
      {!position && <p className="text-xs text-amber-800">{t('autoFetch.noPosition')}</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {t('autoFetch.error')} {error}
        </p>
      )}
      {af && (
        <p className="text-xs text-slate-600">
          {t('autoFetch.done')} {af.position.lat.toFixed(4)}, {af.position.lon.toFixed(4)} ({formatCount(af.radius / 1000, language)} km, {af.fetchedOn})
          {open.some((x) => x) ? ` · ${WAVE_SECTORS.filter((_, k) => open[k]).join(', ')}: ${t('autoFetch.open')}` : ''}
        </p>
      )}
      <p className="text-xs text-slate-500">{t('autoFetch.note')}</p>
    </div>
  );
}

/** ERA5 hourly winds are taken as 1-hour means (I88). */
const ERA5_AVERAGING_S = 3600;

/** D41: wind climate from Open-Meteo (ERA5) for the site: wind rose and extreme winds by direction. */
function WindSection() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const lastYear = new Date().getUTCFullYear() - 1;
  const [years, setYears] = useState<[number, number]>([lastYear - 29, lastYear]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { position, siteCentre } = useSitePosition();
  const [text, setText] = useState('');
  const climate = waves.climate;
  // D47: the 22.5° sectors behind the wave directions that exceed the criteria.
  const designDepth = useAppStore((s) => s.project.anchoring.depth);
  const bad = waveAssessment(waves, designDepth, [])?.bad ?? [];
  const highlight = bad.flatMap((k) => [2 * k]);
  const pct = (x: number) => formatPercent(x, language);
  const ms = (x: number | null) => (x === null ? '–' : formatLength(x, language));

  const run = async () => {
    if (!position) return;
    setError(null);
    try {
      const record = await fetchWindHistory(position.lat, position.lon, years[0], years[1], {
        onProgress: (done, total, wait) =>
          setBusy(wait ? `${t('wind.waiting')} ${wait} s` : `${t('wind.fetching')} ${formatCount(done, language)} / ${formatCount(total, language)}`),
      });
      const result = windClimate(record, {
        source: 'Open-Meteo Historical Weather API, ERA5 (models=era5, cell_selection=sea)',
        requested: { lat: position.lat, lon: position.lon },
        cell: record.cell,
        startYear: years[0],
        endYear: years[1],
        fetchedOn: new Date().toISOString().slice(0, 10),
        averagingS: ERA5_AVERAGING_S,
      });
      appStore.getState().setWaves({ climate: result });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('wind.title')}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <label className="flex items-center gap-1">
          {t('wind.position')}
          <input
            aria-label={t('wind.position')}
            className="w-44 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
            placeholder={position ? `${position.lat.toFixed(4)}, ${position.lon.toFixed(4)}` : t('wind.positionHint')}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const p = parseLatLon(e.target.value);
              if (p) appStore.getState().setWaves({ location: p });
              else if (e.target.value.trim() === '') appStore.getState().setWaves({ location: null });
            }}
          />
        </label>
        <span className="text-xs text-slate-500">{waves.location ? t('wind.positionEntered') : siteCentre ? t('wind.positionSite') : t('wind.positionNone')}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>{t('wind.years')}</span>
        <div className="w-20">
          <NumberField bare label={t('wind.startYear')} value={years[0]} min={1940} max={lastYear} step={1} onChange={(v) => setYears([Math.round(v), years[1]])} />
        </div>
        <span>–</span>
        <div className="w-20">
          <NumberField bare label={t('wind.endYear')} value={years[1]} min={1940} max={lastYear} step={1} onChange={(v) => setYears([years[0], Math.round(v)])} />
        </div>
        <Button variant="primary" disabled={!position || busy !== null || years[1] < years[0] + 1} onClick={() => void run()}>
          {t('wind.fetch')}
        </Button>
        {busy && (
          <span role="status" className="animate-pulse text-xs text-sky-800">
            {busy}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {t('wind.error')} {error}
        </p>
      )}
      {climate && (
        <div className="flex flex-wrap gap-4">
          <div>
            <WindRose climate={climate} highlight={highlight} percent={pct} />
            <div className="mt-1 space-y-0.5 text-xs text-slate-600" data-testid="wind-legend">
              {SPEED_COLORS.map((color, i) => (
                <div key={color} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                  {speedClassLabel(i)}
                </div>
              ))}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <table className="w-full text-right text-xs tabular-nums" data-testid="wind-sectors">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-medium">{t('wind.direction')}</th>
                  <th className="font-medium">{t('wind.share')}</th>
                  <th className="font-medium">{t('wind.oneYear')}</th>
                  <th className="font-medium">{t('wind.fiftyYear')}</th>
                </tr>
              </thead>
              <tbody>
                {climate.sectors.map((s, k) => (
                  <tr key={k} className={highlight.includes(k) ? 'bg-orange-50 font-medium' : ''}>
                    <td className="text-left">{sectorBearing(k)}°</td>
                    <td>{pct(s.rose.reduce((a, b) => a + b, 0))}</td>
                    <td>{ms(s.oneYear)}</td>
                    <td>{ms(s.fiftyYear)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              {t('wind.cell')} {climate.cell.lat.toFixed(2)}, {climate.cell.lon.toFixed(2)} · {climate.startYear}–{climate.endYear} ·{' '}
              {formatCount(climate.hours, language)} h · {climate.fetchedOn}
            </p>
          </div>
        </div>
      )}
      <p className="text-xs text-slate-500">{t('wind.note')}</p>
    </div>
  );
}

/** D48: Marinetek's floating breakwaters against the waves that exceed the criteria. */
function BreakwaterSection({ proposal }: { proposal: BreakwaterProposal }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const len = (m: number) => formatLength(m, language);
  const h = (m: number) => formatHeight(m, language);
  const p = proposal.proposed;
  const th = 'px-1 font-medium';
  return (
    <div className="space-y-1" data-testid="breakwater">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('breakwater.title')}</div>
      <p className={p ? 'text-slate-800' : 'text-amber-800'}>
        {p ? (
          <>
            {t('breakwater.proposed')} <span className="font-medium">{p.name}</span> ({p.modules.map((m) => `${m.code} ${len(m.length)} × ${len(p.width)} m`).join(', ')})
          </>
        ) : (
          t('breakwater.none')
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs tabular-nums">
          <thead>
            <tr className="text-slate-500">
              <th className={`${th} text-left`}>{t('breakwater.product')}</th>
              <th className={th}>{t('breakwater.modules')}</th>
              <th className={th}>{t('breakwater.width')}</th>
              <th className={th}>{t('breakwater.perMetre')}</th>
              <th className={th}>{t('breakwater.worst')}</th>
              <th className={`${th} text-left`}>{t('breakwater.result')}</th>
            </tr>
          </thead>
          <tbody>
            {proposal.evaluations.map((e) => {
              const beyond = e.checks.some((c) => c.transmitted === null);
              const worst = e.checks.reduce<{ tr: number; limit: number } | null>(
                (a, c) => (c.transmitted === null ? a : !a || c.transmitted - c.check.limit! > a.tr - a.limit ? { tr: c.transmitted, limit: c.check.limit! } : a),
                null,
              );
              return (
                <tr key={e.product.id} className={e.product === p ? 'bg-emerald-50 font-medium' : ''}>
                  <td className="px-1 text-left">{e.product.id}</td>
                  <td className="px-1">{e.product.modules.map((m) => `${len(m.length)} (${len(m.weightT)})`).join(', ')}</td>
                  <td className="px-1">{`${len(e.product.width)} / ${h(e.product.freeboard)}`}</td>
                  <td className="px-1">{len(weightPerMetre(e.product))}</td>
                  <td className="px-1">{worst ? `${h(worst.tr)} / ${h(worst.limit)}` : '–'}</td>
                  <td className={`px-1 text-left ${e.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {e.ok ? t('breakwater.ok') : beyond ? t('breakwater.beyondCurve') : t('breakwater.notEnough')}
                    {e.beyondBestWavelength ? ` (${t('breakwater.beyondBest')} ${len(e.product.bestBelowWavelength)} m)` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{t('breakwater.note')}</p>
    </div>
  );
}

/** One row of the sector table: inputs and the waves of that direction. */
function SectorRow({ k, sector, result, designDepth }: { k: number; sector: WaveSectorInput; result: SectorAssessment | undefined; designDepth: number }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const name = WAVE_SECTORS[k]!;
  const len = (m: number) => formatLength(m, language);
  const h = (m: number) => formatHeight(m, language);
  const set = (patch: Partial<WaveSectorInput>, key: string) =>
    state().setWaves({ sectors: waves.sectors.map((x, i) => (i === k ? { ...x, ...patch } : x)) }, { coalesce: `waves:${k}:${key}` });
  // What the sector falls back to when its own wind is empty.
  const fallback = (event: 'oneYear' | 'fiftyYear') => {
    const w = sectorWind({ ...waves, sectors: waves.sectors.map((x, i) => (i === k ? { ...x, wind1: null, wind50: null } : x)) }, k, event);
    return w ? len(w.wind) : '';
  };
  const event = (e: 'oneYear' | 'fiftyYear') => result?.events.find((x) => x.event === e);
  const one = event('oneYear');
  const fifty = event('fiftyYear');
  const failing = result?.checks.filter((c) => c.ok === false) ?? [];
  const cell = 'px-1 py-0.5';
  return (
    <tr className={result?.status === 'exceeds' ? 'bg-red-50' : ''} data-sector={name}>
      <td className={`${cell} text-left font-medium`}>
        {name} <span className="text-xs font-normal text-slate-500">{waveSectorBearing(k)}°</span>
      </td>
      <td className={`${cell} w-24`}>
        <NumberField bare label={`${t('waves.fetchCol')} ${name}`} value={sector.fetch} min={0} max={1e6} step={100} onChange={(fetch) => set({ fetch }, 'fetch')} />
      </td>
      <td className={`${cell} w-16`}>
        <OptionalNumberField label={`${t('waves.depthCol')} ${name}`} value={sector.depth ?? undefined} min={0.1} max={1000} placeholder={len(waves.fetchDepth ?? designDepth)} onChange={(v) => set({ depth: v ?? null }, 'depth')} />
      </td>
      <td className={`${cell} w-16`}>
        <OptionalNumberField label={`${t('waves.wind1Col')} ${name}`} value={sector.wind1 ?? undefined} min={0.1} max={80} placeholder={fallback('oneYear')} onChange={(v) => set({ wind1: v ?? null }, 'wind1')} />
      </td>
      <td className={`${cell} w-16`}>
        <OptionalNumberField label={`${t('waves.wind50Col')} ${name}`} value={sector.wind50 ?? undefined} min={0.1} max={80} placeholder={fallback('fiftyYear')} onChange={(v) => set({ wind50: v ?? null }, 'wind50')} />
      </td>
      <td className={cell} title={one ? `${t('waves.windUsed')} ${len(one.waves.u10)} · ${t(`waves.windFrom.${one.source}`)} · ${t(`waveLimit.${one.waves.limit}`)}` : undefined}>
        {one ? h(one.waves.hm0) : '–'}
      </td>
      <td className={cell} title={fifty ? `${t('waves.windUsed')} ${len(fifty.waves.u10)} · ${t(`waves.windFrom.${fifty.source}`)} · ${t(`waveLimit.${fifty.waves.limit}`)}` : undefined}>
        {fifty ? h(fifty.waves.hm0) : '–'}
      </td>
      <td className={cell}>{fifty ? `${len(fifty.waves.tp)} / ${len(fifty.waves.wavelength)}` : '–'}</td>
      <td className={`${cell} text-left text-xs`}>{result ? result.headings.map((x) => t(`waveHeading.${x}`)).join(', ') : ''}</td>
      <td
        className={`${cell} text-left ${result?.status === 'exceeds' ? 'font-medium text-red-700' : result?.status === 'ok' ? 'text-emerald-700' : 'text-slate-500'}`}
        title={failing.map((c) => `${t(`waveHeading.${c.heading}`)}, ${t(`waveEvent.${c.event}`)}: ${h(c.waves.hm0)} > ${h(c.limit!)} m`).join('\n') || undefined}
      >
        {!result ? '' : result.status === 'exceeds' ? t('waves.exceeds') : result.status === 'ok' ? t('waves.ok') : t('waves.noCriterion')}
      </td>
    </tr>
  );
}

export function WaveTool() {
  const t = useT();
  const open = useAppStore((s) => s.waveToolOpen);
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const designDepth = useAppStore((s) => s.project.anchoring.depth);
  const boatsPerBay = useAppStore((s) => s.project.params.boatsPerBay);
  const piers = useAppStore((s) => s.project.layouts.find((l) => l.id === s.selectedLayoutId)?.piers ?? null);
  if (!open) return null;

  const bearings = (piers ?? []).map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) }));
  const result = waveAssessment(waves, designDepth, bearings);
  const proposal = breakwaterProposal(result);
  const set = (patch: Partial<typeof waves>, key: string) => state().setWaves(patch, { coalesce: `waves:${key}` });
  const len = (m: number) => formatLength(m, language);
  const h = (m: number) => formatHeight(m, language);
  const th = 'px-1 font-medium';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={() => state().setWaveToolOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('waves.title')}
        data-testid="wave-tool"
        className="w-full max-w-6xl rounded bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-800">{t('waves.title')}</h2>
          <Button onClick={() => state().setWaveToolOpen(false)}>{t('waves.close')}</Button>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[17rem_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('waves.inputs')}</div>
            <OptionalRow
              label={t('waves.fetchDepth')}
              value={waves.fetchDepth}
              min={0.1}
              max={1000}
              placeholder={len(designDepth)}
              onChange={(fetchDepth) => set({ fetchDepth }, 'fetchDepth')}
            />
            <OptionalRow label={t('waves.wind1')} value={waves.wind1} min={0.1} max={80} onChange={(wind1) => set({ wind1 }, 'wind1')} />
            <OptionalRow label={t('waves.wind50')} value={waves.wind50} min={0.1} max={80} onChange={(wind50) => set({ wind50 }, 'wind50')} />
            <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
              {t('waves.windAveraging')}
              <select
                className="rounded border border-slate-300 px-1 py-0.5 text-sm"
                value={waves.windAveragingS}
                onChange={(e) => state().setWaves({ windAveragingS: Number(e.target.value) })}
              >
                {AVERAGING.map((a) => (
                  <option key={a} value={a}>
                    {t(`waves.avg${a}` as StringKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
              {t('waves.criteriaSet')}
              <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={waves.criteria} onChange={(e) => state().setWaves({ criteria: e.target.value as WaveCriteria })}>
                {CRITERIA.map((c) => (
                  <option key={c} value={c}>
                    {t(`waveCriteria.${c}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
              {t('waves.quality')}
              <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={waves.quality} onChange={(e) => state().setWaves({ quality: e.target.value as WaveQuality })}>
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {t(`waveQuality.${q}`)}
                  </option>
                ))}
              </select>
            </label>
            {waves.criteria === 'as3962' && <p className="text-xs text-slate-500">{t('waves.as3962Note')}</p>}
            <p className="text-xs text-slate-500">{t('waves.inputNote')}</p>
          </div>

          <div className="min-w-0 space-y-3 text-sm">
            <AutoFetchSection />
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('waves.sectors')}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-right tabular-nums" data-testid="wave-results">
                <thead>
                  <tr className="text-xs text-slate-500">
                    <th className={`${th} text-left`}>{t('waves.sector')}</th>
                    <th className={th}>{t('waves.fetchCol')}</th>
                    <th className={th}>{t('waves.depthCol')}</th>
                    <th className={th}>{t('waves.wind1Col')}</th>
                    <th className={th}>{t('waves.wind50Col')}</th>
                    <th className={th}>{t('waves.hm01')}</th>
                    <th className={th}>{t('waves.hm050')}</th>
                    <th className={th}>{t('waves.tpL')}</th>
                    <th className={`${th} text-left`}>{t('waves.headingCol')}</th>
                    <th className={`${th} text-left`}>{t('waves.statusCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {waves.sectors.map((sector, k) => (
                    <SectorRow key={k} k={k} sector={sector} result={result?.sectors.find((x) => x.sector === k)} designDepth={designDepth} />
                  ))}
                </tbody>
              </table>
            </div>
            {!result ? (
              <p className="text-slate-500">{t('waves.enter')}</p>
            ) : (
              <>
                <div data-testid="wave-checks">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t('waves.criteria')} ({t(`waveCriteria.${result.criteria}`)}, {t(`waveQuality.${waves.quality}`).toLowerCase()})
                  </div>
                  {result.bad.length === 0 ? (
                    <p className="text-emerald-700">{t('waves.noneBad')}</p>
                  ) : (
                    <ul className="list-disc pl-5" aria-label={t('waves.bad')}>
                      {result.sectors
                        .filter((x) => x.status === 'exceeds')
                        .map((x) => (
                          <li key={x.sector}>
                            <span className="font-medium">{WAVE_SECTORS[x.sector]}</span>:{' '}
                            {x.checks
                              .filter((c) => c.ok === false)
                              .map((c) => `${t(`waveHeading.${c.heading}`).toLowerCase()}, ${t(`waveEvent.${c.event}`).toLowerCase()} ${h(c.waves.hm0)} > ${h(c.limit!)} m`)
                              .join('; ')}
                          </li>
                        ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    {result.piers.length === 0 ? t('waves.noPiers') : `${t('waves.piers')}: ${result.piers.map((p) => p.id).join(', ')}`}
                  </p>
                </div>

                <div
                  data-testid="wave-advice"
                  className={`rounded border px-3 py-2 ${result.advice === 'none' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : result.advice === 'unknown' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                >
                  {t(`waveAdvice.${result.advice}`)}
                </div>
                {result.doubleBerthPiles && boatsPerBay === 2 && <p className="text-xs text-amber-800">{t('waves.piles')}</p>}
                {proposal && <BreakwaterSection proposal={proposal} />}
              </>
            )}
            <p className="text-xs text-slate-500">{t('waves.note')}</p>
          </div>
        </div>
        <div className="px-4 pb-4">
          <WindSection />
        </div>
      </div>
    </div>
  );
}
