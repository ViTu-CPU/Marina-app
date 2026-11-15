/**
 * Wave screening window (D40): a side tool that estimates wind waves at the site from the
 * longest fetch, its direction, the depth and extreme winds, compares them with the wave
 * climate criteria of UFC 4-152-07 and tells whether the berths look to need a wave
 * attenuator or a breakwater. Preliminary only.
 */
import { useState } from 'react';
import { centroid } from '../../engine/geometry';
import { pierAxis } from '../../engine/rows';
import { bearingOf, waveAssessment, type WaveQuality } from '../../engine/waves';
import { sectorBearing, sectorOf, windClimate } from '../../engine/wind';
import type { StringKey } from '../../i18n';
import { localToLatLon, parseLatLon } from '../../state/geo';
import { fetchWindHistory } from '../../state/openMeteo';
import { appStore, useAppStore } from '../../state/store';
import { formatCount, formatLength, formatPercent } from '../format';
import { useT } from '../useT';
import { Button, NumberField, OptionalNumberField } from './fields';
import { speedClassLabel, SPEED_COLORS, WindRose } from './WindRose';

const state = () => appStore.getState();
const QUALITIES: WaveQuality[] = ['excellent', 'good', 'moderate'];
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

/** ERA5 hourly winds are taken as 1-hour means (I88). */
const ERA5_AVERAGING_S = 3600;

/** D41: wind climate from Open-Meteo (ERA5) for the site: wind rose and extreme winds by direction. */
function WindSection() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const map = useAppStore((s) => s.project.map);
  const water = useAppStore((s) => s.project.site.water);
  const lastYear = new Date().getUTCFullYear() - 1;
  const [years, setYears] = useState<[number, number]>([lastYear - 29, lastYear]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteCentre = map ? localToLatLon(map, water.length >= 3 ? centroid(water) : { x: 0, y: 0 }) : null;
  const position = waves.location ?? siteCentre;
  const [text, setText] = useState('');
  const climate = waves.climate;
  const fetchSector = sectorOf(waves.fetchFrom);
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
            <WindRose climate={climate} highlight={fetchSector} percent={pct} />
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
                  <tr key={k} className={k === fetchSector ? 'bg-orange-50 font-medium' : ''}>
                    <td className="text-left">{sectorBearing(k)}°</td>
                    <td>{pct(s.rose.reduce((a, b) => a + b, 0))}</td>
                    <td>{ms(s.oneYear)}</td>
                    <td>{ms(s.fiftyYear)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2">
              <Button
                disabled={climate.sectors[fetchSector]!.oneYear === null && climate.sectors[fetchSector]!.fiftyYear === null}
                onClick={() => {
                  const s = climate.sectors[fetchSector]!;
                  const round = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);
                  appStore.getState().setWaves({ wind1: round(s.oneYear), wind50: round(s.fiftyYear), windAveragingS: climate.averagingS });
                }}
              >
                {t('wind.use')} ({sectorBearing(fetchSector)}°)
              </Button>
            </div>
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

export function WaveTool() {
  const t = useT();
  const open = useAppStore((s) => s.waveToolOpen);
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const designDepth = useAppStore((s) => s.project.anchoring.depth);
  const piers = useAppStore((s) => s.project.layouts.find((l) => l.id === s.selectedLayoutId)?.piers ?? null);
  if (!open) return null;

  const depth = waves.fetchDepth ?? designDepth;
  const bearings = (piers ?? []).map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) }));
  const result = waveAssessment(waves, depth, bearings);
  const set = (patch: Partial<typeof waves>, key: string) => state().setWaves(patch, { coalesce: `waves:${key}` });
  const len = (m: number) => formatLength(m, language);
  const h = (m: number) => formatHeight(m, language);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={() => state().setWaveToolOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('waves.title')}
        data-testid="wave-tool"
        className="w-full max-w-4xl rounded bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-800">{t('waves.title')}</h2>
          <Button onClick={() => state().setWaveToolOpen(false)}>{t('waves.close')}</Button>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-[18rem_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('waves.inputs')}</div>
            <OptionalRow label={t('waves.fetch')} value={waves.fetch} min={1} max={1e6} onChange={(fetch) => set({ fetch }, 'fetch')} />
            <NumberField label={t('waves.fetchFrom')} value={waves.fetchFrom} min={0} max={360} step={5} onChange={(v) => set({ fetchFrom: v % 360 }, 'fetchFrom')} />
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
              {t('waves.quality')}
              <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={waves.quality} onChange={(e) => state().setWaves({ quality: e.target.value as WaveQuality })}>
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {t(`waveQuality.${q}`)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-500">{t('waves.inputNote')}</p>
          </div>

          <div className="min-w-0 space-y-3 text-sm">
            {!result ? (
              <p className="text-slate-500">{t('waves.enter')}</p>
            ) : (
              <>
                <table className="w-full text-right tabular-nums" data-testid="wave-results">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="text-left font-medium">{t('waves.event')}</th>
                      <th className="font-medium">{t('waves.windUsed')}</th>
                      <th className="font-medium">{t('waves.duration')}</th>
                      <th className="font-medium">{t('waves.hm0')}</th>
                      <th className="font-medium">{t('waves.tp')}</th>
                      <th className="font-medium">{t('waves.length')}</th>
                      <th className="font-medium">{t('waves.limitedBy')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.events.map((e) => (
                      <tr key={e.event}>
                        <td className="text-left">{t(`waveEvent.${e.event}`)}</td>
                        <td>{len(e.waves.u10)}</td>
                        <td>{formatCount(e.waves.averagingS / 60, language)}</td>
                        <td>{h(e.waves.hm0)}</td>
                        <td>{len(e.waves.tp)}</td>
                        <td>{len(e.waves.wavelength)}</td>
                        <td>{t(`waveLimit.${e.waves.limit}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('waves.criteria')}</div>
                  <table className="w-full text-right tabular-nums" data-testid="wave-checks">
                    <tbody>
                      {result.checks.map((c) => (
                        <tr key={`${c.heading}-${c.event}`}>
                          <td className="text-left">{t(`waveHeading.${c.heading}`)}</td>
                          <td className="text-left">{t(`waveEvent.${c.event}`)}</td>
                          <td>
                            {h(c.waves.hm0)} m {c.limit === null ? '' : `≤ ${h(c.limit)} m`}
                          </td>
                          <td className={c.ok === false ? 'font-medium text-red-700' : c.ok ? 'text-emerald-700' : 'text-slate-500'}>
                            {c.ok === null ? t('waves.noCriterion') : c.ok ? t('waves.ok') : t('waves.exceeds')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-xs text-slate-500">
                    {result.piers.length === 0
                      ? t('waves.noPiers')
                      : `${t('waves.piers')}: ${result.piers.map((p) => `${p.id} ${t(`waveHeading.${p.heading}`).toLowerCase()}`).join(', ')}`}
                  </p>
                </div>

                <div
                  data-testid="wave-advice"
                  className={`rounded border px-3 py-2 ${result.advice === 'none' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : result.advice === 'unknown' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                >
                  {t(`waveAdvice.${result.advice}`)}
                </div>
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
