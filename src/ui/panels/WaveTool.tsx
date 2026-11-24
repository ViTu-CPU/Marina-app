/**
 * Wave screening window (D40, D47): estimates wind waves at the site for eight direction sectors
 * from the fetch of each (0 = no open water), the depth and extreme winds, compares them with the
 * wave climate criteria (AS 3962-2001 Table 4.2 or UFC 4-152-07) and tells which directions
 * exceed them and whether the berths look to need a wave attenuator or a breakwater.
 * Preliminary only.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { breakwaterProposal, breakwaterShelter, weightPerMetre, type BreakwaterProposal, type ShelterRow } from '../../engine/breakwater';
import { pierAxis } from '../../engine/rows';
import {
  bearingOf,
  sectorWind,
  WAVE_SECTORS,
  waveAssessment,
  waveSectorBearing,
  type ClimateChoice,
  type SectorAssessment,
  type WaveCriteria,
  type WaveQuality,
  type WaveSectorInput,
} from '../../engine/waves';
import { sectorBearing, windClimate } from '../../engine/wind';
import type { StringKey } from '../../i18n';
import { sectorFetches, RAY_STEP_DEG } from '../../engine/fetchRays';
import { originPlacing, parseLatLon } from '../../state/geo';
import { lookupWaterFetch, VT_SOURCE, type WaterFetchLookup } from '../../state/vectorTiles';
import { DEPTH_SOURCES, lookupFetchDepths } from '../../state/depth';
import { fetchWindHistory } from '../../state/openMeteo';
import { completeYears, fetchStationWind, findWindStations, FMI_WIND_SOURCE, MIN_YEAR_COVERAGE, type WindStation } from '../../state/fmiWind';
import { appStore, useAppStore } from '../../state/store';
import { printHtml } from '../export/download';
import { buildWaveReportHtml } from '../export/waveReport';
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

/** UI_REVIEW 3: method and source texts folded away behind one line; the printed report keeps them in full. */
function Note({ children, testId }: { children: ReactNode; testId?: string }) {
  const t = useT();
  return (
    <details className="text-xs text-slate-500" {...(testId ? { 'data-testid': testId } : {})}>
      <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-700">{t('waves.method')}</summary>
      <div className="mt-1 space-y-1">{children}</div>
    </details>
  );
}

/** UI_REVIEW 1: the window's sections as numbered steps in working order. */
function Step({ n, title, children, testId }: { n: number; title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-2 border-t border-slate-200 pt-3 first:border-t-0 first:pt-0" {...(testId ? { 'data-testid': testId } : {})}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-700 text-xs font-semibold text-white">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** UI_REVIEW 1: the position of the lookups comes first, since every lookup needs it. */
function PositionSection() {
  const t = useT();
  const waves = useAppStore((s) => s.project.waves);
  const map = useAppStore((s) => s.project.map);
  const picking = useAppStore((s) => s.tool === 'wavePoint');
  const { position, siteCentre } = useSitePosition();
  const [text, setText] = useState('');
  // U35: a point picked on the map shows in the field like a typed one.
  const location = waves.location;
  useEffect(() => {
    if (!location) return;
    setText((current) => {
      const typed = parseLatLon(current);
      return typed && Math.abs(typed.lat - location.lat) < 1e-9 && Math.abs(typed.lon - location.lon) < 1e-9 ? current : `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;
    });
  }, [location]);
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <label className="flex items-center gap-1">
          {t('wind.position')}
          <input
            aria-label={t('wind.position')}
            className="w-52 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
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
        {/* U35: or click the point on the map. */}
        <Button active={picking} disabled={!map} title={map ? t('waves.pickHint') : t('waves.pickNeedsMap')} onClick={() => state().setTool(picking ? 'select' : 'wavePoint')}>
          {t('waves.pickOnMap')}
        </Button>
        <span className="text-xs text-slate-500">{waves.location ? t('wind.positionEntered') : siteCentre ? t('wind.positionSite') : t('wind.positionNone')}</span>
        {/* A wave study alone has no map yet: put one under the position so that the fetch rays can be drawn. */}
        {!map && waves.location && (
          <Button
            onClick={() => {
              const s = state();
              const loc = s.project.waves.location;
              if (!loc) return;
              const empty = s.project.site.water.length === 0 && s.project.background === null;
              if (empty) s.setView({ cx: 0, cy: 0, zoom: 2 });
              const view = empty ? { cx: 0, cy: 0 } : s.view;
              const origin = originPlacing(loc.lat, loc.lon, { x: view.cx, y: view.cy });
              s.setMap({ provider: 'osm', lat: origin.lat, lon: origin.lon, opacity: 0.8 });
            }}
          >
            {t('waves.showOnMap')}
          </Button>
        )}
      </div>
      {picking && (
        <p role="status" className="text-xs font-medium text-sky-800">
          {t('waves.pickHint')}
        </p>
      )}
      {!map && <p className="text-xs text-slate-500">{t('waves.pickNeedsMap')}</p>}
      <p className="text-xs text-slate-500">{t('waves.positionHint')}</p>
    </div>
  );
}

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
  const [found, setFound] = useState<WaterFetchLookup | null>(null);
  const [cancelled, setCancelled] = useState(false);
  /** Map tiles read so far and when the lookup started (I113). */
  const [progress, setProgress] = useState<{ tiles: number; since: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => () => abort.current?.abort(), []);
  const af = waves.autoFetch;
  const run = async () => {
    if (!position) return;
    const controller = new AbortController();
    abort.current = controller;
    const since = Date.now();
    setBusy(true);
    setError(null);
    setFound(null);
    setCancelled(false);
    setNow(since);
    setProgress({ tiles: 0, since });
    try {
      const radius = radiusKm * 1000;
      const r = await lookupWaterFetch(position.lat, position.lon, radius, {
        signal: controller.signal,
        onProgress: (tiles) => setProgress({ tiles, since }),
      });
      const round = (m: number) => Math.round(m * 10) / 10;
      state().setWaves({
        sectors: waves.sectors.map((x, k) => ({ ...x, fetch: round(r.sectors[k]!.fetch) })),
        autoFetch: { source: VT_SOURCE, position, radius, stepDeg: RAY_STEP_DEG, distances: r.distances.map(round), fetchedOn: new Date().toISOString().slice(0, 10) },
      });
      setFound(r);
    } catch (e) {
      if (controller.signal.aborted) setCancelled(true);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abort.current === controller) abort.current = null;
      setBusy(false);
      setProgress(null);
    }
  };
  const open = af ? sectorFetches(af.distances, af.radius, af.stepDeg).map((x) => x.open) : [];
  return (
    <div className="space-y-1" data-testid="auto-fetch">
      <div className="text-xs text-slate-600">{t('autoFetch.title')}</div>
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
          <>
            <span role="status" className="animate-pulse text-xs text-sky-800" data-testid="auto-fetch-status">
              {t('autoFetch.running')}
              {progress && ` ${formatCount(progress.tiles, language)} ${t('autoFetch.tiles')}, ${formatCount(Math.max(0, Math.round((now - progress.since) / 1000)), language)} s`}
            </span>
            <Button onClick={() => abort.current?.abort()}>{t('autoFetch.cancel')}</Button>
          </>
        )}
      </div>
      {!position && <p className="text-xs text-amber-800">{t('waves.needPosition')}</p>}
      {cancelled && <p className="text-xs text-slate-600">{t('autoFetch.cancelled')}</p>}
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
      {found && (
        <p className="text-xs text-slate-600" data-testid="auto-fetch-found">
          {t('autoFetch.found')} {formatCount(found.hits, language)} / {found.distances.length} {t('autoFetch.rays')} · {formatCount(found.tiles, language)} {t('autoFetch.tilesRead')}
        </p>
      )}
      <Note>
        <p>{t('autoFetch.note')}</p>
      </Note>
    </div>
  );
}

/** I110: mean depth along each sector's ray from EMODnet (sea) or SYKE's lake depth zones. */
function DepthLookup() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const { position } = useSitePosition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const af = waves.autoFetch;
  const from = af?.position ?? position;
  const hasFetch = waves.sectors.some((x) => x.fetch > 0);
  const run = async () => {
    if (!from) return;
    setError(null);
    setBusy(t('autoDepth.running'));
    try {
      // The ray of each sector: the longest of the map lookup (I94), else the sector's centre.
      const longest = af ? sectorFetches(af.distances, af.radius, af.stepDeg) : null;
      const rays = waves.sectors.map((x, k) => ({ bearing: longest?.[k]?.fetch ? longest[k]!.bearing : waveSectorBearing(k), fetch: x.fetch }));
      const found = await lookupFetchDepths(from.lat, from.lon, rays, { onProgress: (d, n) => setBusy(`${t('autoDepth.running')} ${d} / ${n}`) });
      const latest = appStore.getState().project.waves;
      state().setWaves({
        sectors: latest.sectors.map((x, k) => (found[k] ? { ...x, depth: Math.round(found[k]!.depth * 10) / 10 } : x)),
        autoDepth: { position: { lat: from.lat, lon: from.lon }, fetchedOn: new Date().toISOString().slice(0, 10), sectors: found.map((f) => (f ? { depth: f.depth, source: f.source, coverage: f.coverage } : null)) },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const ad = waves.autoDepth;
  return (
    <div className="space-y-1 pt-1" data-testid="auto-depth">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <Button disabled={!from || !hasFetch || busy !== null} onClick={() => void run()}>
          {t('autoDepth.run')}
        </Button>
        {busy && (
          <span role="status" className="animate-pulse text-xs text-sky-800">
            {busy}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {t('autoDepth.error')} {error}
        </p>
      )}
      {ad && (
        <p className="text-xs text-slate-600" data-testid="auto-depth-result">
          {t('autoDepth.done')} ({ad.fetchedOn}):{' '}
          {WAVE_SECTORS.map((name, k) => {
            const x = ad.sectors[k];
            return `${name} ${x ? `${formatLength(x.depth, language)} m (${x.source === 'emodnet' ? 'EMODnet' : 'SYKE'})` : '–'}`;
          }).join(', ')}
        </p>
      )}
      <Note>
        <p>
          {t('autoDepth.note')} {DEPTH_SOURCES.emodnet}; {DEPTH_SOURCES.syke}.
        </p>
      </Note>
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
  const { position } = useSitePosition();
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
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('wind.title')}</div>
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
      <Note>
        <p>{t('wind.note')}</p>
      </Note>
    </div>
  );
}

/** I108: wind climate of an FMI observation station near the site, compared with ERA5. */
function StationWindSection() {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const waves = useAppStore((s) => s.project.waves);
  const lastYear = new Date().getUTCFullYear() - 1;
  const [years, setYears] = useState<[number, number]>([lastYear - 29, lastYear]);
  const [stations, setStations] = useState<WindStation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { position } = useSitePosition();
  const station = waves.stationClimate;
  const era5 = waves.climate;
  const ms = (x: number | null | undefined) => (x === null || x === undefined ? '–' : formatLength(x, language));

  const find = async () => {
    if (!position) return;
    setError(null);
    setBusy(t('station.searching'));
    try {
      setStations(await findWindStations(position.lat, position.lon));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const fetchOne = async (s: WindStation) => {
    if (!position) return;
    setError(null);
    try {
      const record = await fetchStationWind(s.fmisid, years[0], years[1], {
        onProgress: (done, total) => setBusy(`${t('station.fetching')} ${formatCount(done, language)} / ${formatCount(total, language)}`),
      });
      const run = completeYears(record.hoursByYear, years[0], years[1]);
      if (!run) throw new Error(`${s.name}: ${t('station.noYears')} ${Math.round(MIN_YEAR_COVERAGE * 100)} %`);
      const result = windClimate(record, {
        source: `${FMI_WIND_SOURCE}; ${s.name} (fmisid ${s.fmisid})`,
        requested: { lat: position.lat, lon: position.lon },
        cell: s.position,
        startYear: run.startYear,
        endYear: run.endYear,
        fetchedOn: new Date().toISOString().slice(0, 10),
        averagingS: 600,
      });
      appStore.getState().setWaves({ stationClimate: result });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2 border-t border-dashed border-slate-200 pt-2" data-testid="station-wind">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('station.title')}</div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span>{t('wind.years')}</span>
        <div className="w-20">
          <NumberField bare label={t('station.startYear')} value={years[0]} min={1950} max={lastYear} step={1} onChange={(v) => setYears([Math.round(v), years[1]])} />
        </div>
        <span>–</span>
        <div className="w-20">
          <NumberField bare label={t('station.endYear')} value={years[1]} min={1950} max={lastYear} step={1} onChange={(v) => setYears([years[0], Math.round(v)])} />
        </div>
        <Button disabled={!position || busy !== null} onClick={() => void find()}>
          {t('station.find')}
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
      {stations && stations.length === 0 && <p className="text-xs text-amber-800">{t('station.none')}</p>}
      {stations && stations.length > 0 && (
        <ul className="text-sm" data-testid="station-list">
          {stations.slice(0, 8).map((s) => (
            <li key={s.fmisid} className="flex items-center justify-between gap-2 py-0.5">
              <span className="truncate">
                {s.name} <span className="text-xs text-slate-500">({formatLength(s.distance / 1000, language)} km)</span>
              </span>
              <Button disabled={busy !== null || years[1] < years[0] + 1} onClick={() => void fetchOne(s)}>
                {t('station.fetch')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {station && (
        <div className="space-y-1">
          <p className="text-xs text-slate-600">
            {station.source.split('; ').pop()} · {station.startYear}–{station.endYear} · {formatCount(station.hours, language)} h · {station.fetchedOn}
          </p>
          <table className="w-full text-right text-xs tabular-nums" data-testid="station-compare">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-medium">{t('wind.direction')}</th>
                <th className="font-medium">{t('station.era5')}</th>
                <th className="font-medium">{t('station.fmi')}</th>
              </tr>
            </thead>
            <tbody>
              {station.sectors.map((x, k) => (
                <tr key={k}>
                  <td className="text-left">{sectorBearing(k)}°</td>
                  <td>{era5 ? `${ms(era5.sectors[k]?.oneYear)} / ${ms(era5.sectors[k]?.fiftyYear)}` : '–'}</td>
                  <td>{`${ms(x.oneYear)} / ${ms(x.fiftyYear)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
            {t('station.choice')}
            <select
              className="rounded border border-slate-300 px-1 py-0.5 text-sm"
              value={waves.climateChoice}
              onChange={(e) => appStore.getState().setWaves({ climateChoice: e.target.value as ClimateChoice })}
            >
              {(['larger', 'station', 'era5'] as const).map((c) => (
                <option key={c} value={c} disabled={c === 'era5' && !era5}>
                  {t(`station.choice.${c}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <Note>
        <p>{t('station.note')}</p>
      </Note>
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
      <Note>
        <p>{t('breakwater.note')}</p>
      </Note>
    </div>
  );
}

/** D58, I107: the piers' shelter behind the drawn breakwaters, for the directions that exceed the criteria. */
function ShelterSection({ rows }: { rows: ShelterRow[] }) {
  const t = useT();
  const language = useAppStore((s) => s.language);
  const h = (m: number) => formatHeight(m, language);
  const th = 'px-1 font-medium';
  return (
    <div className="space-y-1" data-testid="shelter">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('shelter.title')}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-right text-xs tabular-nums">
          <thead>
            <tr className="text-slate-500">
              <th className={`${th} text-left`}>{t('shelter.direction')}</th>
              <th className={`${th} text-left`}>{t('shelter.pier')}</th>
              <th className={th}>{t('shelter.share')}</th>
              <th className={`${th} text-left`}>{t('shelter.breakwater')}</th>
              <th className={th}>{t('shelter.waves')}</th>
              <th className={`${th} text-left`}>{t('shelter.result')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const worst = shelterWorst(r);
              const result = r.breakwaterId === null ? 'shelter.unsheltered' : worst.transmitted === null ? 'shelter.beyondCurve' : worst.ok && r.share >= 1 - 1e-9 ? 'shelter.ok' : worst.ok ? 'shelter.partly' : 'shelter.notEnough';
              return (
                <tr key={`${r.sector}-${r.pierId}`}>
                  <td className="px-1 text-left">{WAVE_SECTORS[r.sector]}</td>
                  <td className="px-1 text-left">{r.pierId}</td>
                  <td className="px-1">{formatPercent(r.share, language)}</td>
                  <td className="px-1 text-left">{r.breakwaterId ?? '–'}</td>
                  <td className="px-1">{`${h(worst.check.waves.hm0)} → ${worst.transmitted === null ? '–' : h(worst.transmitted)} / ${h(worst.check.limit!)}`}</td>
                  <td className={`px-1 text-left ${result === 'shelter.ok' ? 'text-emerald-700' : result === 'shelter.partly' ? 'text-amber-700' : 'text-red-700'}`}>{t(result)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Note>
        <p>{t('shelter.note')}</p>
      </Note>
    </div>
  );
}

/** The check of a shelter row that is furthest above its limit behind the breakwater (or without one). */
export function shelterWorst(r: ShelterRow): ShelterRow['checks'][number] {
  const over = (c: ShelterRow['checks'][number]) => (c.transmitted ?? c.check.waves.hm0) - c.check.limit!;
  return r.checks.reduce((a, c) => (over(c) > over(a) ? c : a));
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
  const site = useAppStore((s) => s.project.site);
  const { position } = useSitePosition();
  const dialog = useRef<HTMLElement>(null);
  if (!open) return null;

  /** U29: the wave screening as a printable report of its own, with or without a layout. */
  const print = () => {
    const s = state();
    const layout = s.project.layouts.find((l) => l.id === s.selectedLayoutId) ?? null;
    printHtml(
      buildWaveReportHtml({
        project: s.project,
        piers: layout?.piers ?? [],
        layoutName: layout?.name ?? null,
        position,
        positionEntered: s.project.waves.location !== null,
        windRoseSvg: dialog.current?.querySelector('[data-testid="wind-rose"]')?.outerHTML ?? null,
        language: s.language,
        date: new Date().toISOString().slice(0, 10),
      }),
    );
  };

  const bearings = (piers ?? []).map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) }));
  const result = waveAssessment(waves, designDepth, bearings);
  const proposal = breakwaterProposal(result);
  const shelter = breakwaterShelter(site, piers ?? [], result);
  const set = (patch: Partial<typeof waves>, key: string) => state().setWaves(patch, { coalesce: `waves:${key}` });
  const len = (m: number) => formatLength(m, language);
  const h = (m: number) => formatHeight(m, language);
  const th = 'px-1 font-medium';

  const selectRow = (label: string, value: string | number, options: { value: string | number; label: string }[], onChange: (v: string) => void) => (
    <label className="flex items-center justify-between gap-2 text-sm text-slate-700">
      {label}
      <select className="rounded border border-slate-300 px-1 py-0.5 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    // UI_REVIEW 4: a panel beside the map, so that the fetch rays on the map stay in view.
    <aside role="complementary" aria-label={t('waves.title')} data-testid="wave-tool" ref={dialog} className="flex w-[52rem] min-w-0 max-w-[64%] shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-800">{t('waves.title')}</h2>
          <div className="flex items-center gap-1.5">
            <Button title={t('waves.printHint')} onClick={print}>
              {t('waves.print')}
            </Button>
            <Button onClick={() => state().setWaveToolOpen(false)}>{t('waves.close')}</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {/* UI_REVIEW 2: the result first. */}
          <div
            data-testid="wave-advice"
            className={`rounded border px-3 py-2 ${!result || result.advice === 'unknown' ? 'border-slate-200 bg-slate-50 text-slate-700' : result.advice === 'none' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
          >
            {!result ? (
              t('waves.enter')
            ) : (
              <>
                <div className="font-medium" data-testid="wave-summary">
                  {result.bad.length === 0 ? t('waves.noneBad') : `${t('waves.bad')}: ${result.bad.map((k) => WAVE_SECTORS[k]).join(', ')}`}
                </div>
                <div>{t(`waveAdvice.${result.advice}`)}</div>
              </>
            )}
          </div>

          <Step n={1} title={t('waves.step.position')} testId="wave-step-position">
            <PositionSection />
          </Step>

          <Step n={2} title={t('waves.step.fetch')} testId="wave-step-fetch">
            <AutoFetchSection />
            <p className="text-xs text-slate-500">{t('waves.fetchHint')}</p>
          </Step>

          <Step n={3} title={t('waves.step.depth')} testId="wave-step-depth">
            <div className="max-w-md">
              <OptionalRow label={t('waves.fetchDepth')} value={waves.fetchDepth} min={0.1} max={1000} placeholder={len(designDepth)} onChange={(fetchDepth) => set({ fetchDepth }, 'fetchDepth')} />
            </div>
            <DepthLookup />
          </Step>

          <Step n={4} title={t('waves.step.wind')} testId="wave-step-wind">
            <div className="grid max-w-md gap-1">
              <OptionalRow label={t('waves.wind1')} value={waves.wind1} min={0.1} max={80} onChange={(wind1) => set({ wind1 }, 'wind1')} />
              <OptionalRow label={t('waves.wind50')} value={waves.wind50} min={0.1} max={80} onChange={(wind50) => set({ wind50 }, 'wind50')} />
              {selectRow(
                t('waves.windAveraging'),
                waves.windAveragingS,
                AVERAGING.map((a) => ({ value: a, label: t(`waves.avg${a}` as StringKey) })),
                (v) => state().setWaves({ windAveragingS: Number(v) }),
              )}
            </div>
            <p className="text-xs text-slate-500">{t('waves.windHint')}</p>
            <WindSection />
            <StationWindSection />
          </Step>

          <Step n={5} title={t('waves.step.result')} testId="wave-step-result">
            <div className="grid max-w-md gap-1">
              {selectRow(t('waves.criteriaSet'), waves.criteria, CRITERIA.map((c) => ({ value: c, label: t(`waveCriteria.${c}`) })), (v) => state().setWaves({ criteria: v as WaveCriteria }))}
              {selectRow(t('waves.quality'), waves.quality, QUALITIES.map((q) => ({ value: q, label: t(`waveQuality.${q}`) })), (v) => state().setWaves({ quality: v as WaveQuality }))}
            </div>
            {waves.criteria === 'as3962' && <p className="text-xs text-slate-500">{t('waves.as3962Note')}</p>}
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
            {result && (
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
                {result.doubleBerthPiles && boatsPerBay === 2 && <p className="text-xs text-amber-800">{t('waves.piles')}</p>}
              </div>
            )}
          </Step>

          {result && (proposal || shelter.length > 0) && (
            <Step n={6} title={t('waves.step.protection')} testId="wave-step-protection">
              {proposal && <BreakwaterSection proposal={proposal} />}
              {shelter.length > 0 && <ShelterSection rows={shelter} />}
            </Step>
          )}

          <Note testId="wave-method">
            <p>{t('waves.inputNote')}</p>
            <p>{t('waves.note')}</p>
          </Note>
        </div>
      </div>
    </aside>
  );
}
