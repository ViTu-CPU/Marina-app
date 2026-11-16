/**
 * Water-level gauges near the site (DECISIONS D50):
 *  - Sea: FMI open data, stored query fmi::observations::mareograph::yearly::30year::simple —
 *    "Yearly water level observations of 30-year normal period 1991 - 2020" for the mareographs:
 *    WLEVP1YAVG_P30Y_AVG (mean of the annual means), WLEVP1YMAX_P30Y_AVG / _MAX (mean and highest of
 *    the annual maxima), WLEVP1YMIN_P30Y_AVG / _MIN (mean and lowest of the annual minima), mm
 *    relative to the theoretical mean water. Station names from the same query in timevaluepair
 *    format. Licence CC BY 4.0 (FMI open data).
 *  - Lakes and rivers: SYKE's Hydrologiarajapinta 1.1 (OData): water-level stations (`Paikka`,
 *    Suure_Id 1 "Vedenkorkeus", cm) and their daily values (`Vedenkorkeus`), 500 rows per page; the
 *    characteristic levels are computed from the last 30 complete years of data
 *    (src/engine/waterLevels.ts). Licence CC BY 4.0 (SYKE open data).
 * Both send `access-control-allow-origin: *` (checked 2026-11-15).
 */
import { characteristicLevels, type CharacteristicLevels, type WaterLevelInfo } from '../engine/waterLevels';
import { tangentPlane } from './overpass';

export const FMI_WFS = 'https://opendata.fmi.fi/wfs';
export const SYKE_ODATA = 'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.1/odata';
const FMI_QUERY = 'fmi::observations::mareograph::yearly::30year';
const FMI_PARAMS = ['WLEVP1YAVG_P30Y_AVG', 'WLEVP1YMAX_P30Y_AVG', 'WLEVP1YMAX_P30Y_MAX', 'WLEVP1YMIN_P30Y_AVG', 'WLEVP1YMIN_P30Y_MIN'] as const;
/** SYKE stations searched within this distance, m. */
export const SYKE_SEARCH_RADIUS = 60000;
/** Years of daily data used for a lake or river gauge. */
export const SYKE_YEARS = 30;

const rad = (d: number): number => (d * Math.PI) / 180;

/**
 * ETRS-TM35FIN (EPSG:3067) from latitude and longitude (ETRS89 / GRS80): transverse Mercator,
 * central meridian 27° E, scale 0.9996, false easting 500 000 m, by Krüger's series (as in the
 * Finnish public administration recommendation JHS 154). Used only to search SYKE's stations by
 * their TM35FIN coordinates.
 */
export function toTm35fin(lat: number, lon: number): { n: number; e: number } {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const e = Math.sqrt(e2);
  const n = f / (2 - f);
  const a1 = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const h = [n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3 + (41 / 180) * n ** 4, (13 / 48) * n ** 2 - (3 / 5) * n ** 3 + (557 / 1440) * n ** 4, (61 / 240) * n ** 3 - (103 / 140) * n ** 4, (49561 / 161280) * n ** 4];
  const phi = rad(lat);
  const q = Math.asinh(Math.tan(phi)) - e * Math.atanh(e * Math.sin(phi));
  const beta = Math.atan(Math.sinh(q));
  const l = rad(lon - 27);
  const eta0 = Math.atanh(Math.cos(beta) * Math.sin(l));
  const xi0 = Math.asin(Math.sin(beta) * Math.cosh(eta0));
  let xi = xi0;
  let eta = eta0;
  h.forEach((hi, i) => {
    const k = 2 * (i + 1);
    xi += hi * Math.sin(k * xi0) * Math.cosh(k * eta0);
    eta += hi * Math.cos(k * xi0) * Math.sinh(k * eta0);
  });
  return { n: a1 * xi * 0.9996, e: a1 * eta * 0.9996 + 500000 };
}

/** Latitude and longitude (ETRS89) from ETRS-TM35FIN, by the inverse Krüger series (JHS 154). */
export function fromTm35fin(northing: number, easting: number): { lat: number; lon: number } {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e = Math.sqrt(f * (2 - f));
  const n = f / (2 - f);
  const a1 = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
  const h = [n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3 - (1 / 360) * n ** 4, (1 / 48) * n ** 2 + (1 / 15) * n ** 3 - (437 / 1440) * n ** 4, (17 / 480) * n ** 3 - (37 / 840) * n ** 4, (4397 / 161280) * n ** 4];
  const xi = northing / (a1 * 0.9996);
  const eta = (easting - 500000) / (a1 * 0.9996);
  let xi1 = xi;
  let eta1 = eta;
  h.forEach((hi, i) => {
    const k = 2 * (i + 1);
    xi1 -= hi * Math.sin(k * xi) * Math.cosh(k * eta);
    eta1 -= hi * Math.cos(k * xi) * Math.sinh(k * eta);
  });
  const beta = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
  const l = Math.asin(Math.tanh(eta1) / Math.cos(beta));
  const q = Math.asinh(Math.tan(beta));
  let q1 = q;
  for (let i = 0; i < 10; i++) q1 = q + e * Math.atanh(e * Math.tanh(q1));
  return { lat: (Math.atan(Math.sinh(q1)) * 180) / Math.PI, lon: 27 + (l * 180) / Math.PI };
}

/** A gauge found near the site. For FMI gauges the levels come with the search. */
export interface Gauge {
  source: 'fmi' | 'syke';
  id: string;
  name: string;
  waterBody: string | null;
  position: { lat: number; lon: number };
  distance: number;
  /** SYKE: whether the station is still measuring ("Jatkuva"). */
  active: boolean;
  /** FMI: the levels of 1991–2020, m. */
  levels?: CharacteristicLevels;
}

const distanceFrom = (lat: number, lon: number, p: { lat: number; lon: number }) => {
  const v = tangentPlane(lat, lon).toLocal(p.lat, p.lon);
  return Math.hypot(v.x, v.y);
};

/** FMI mareographs: positions and the five 30-year values from the "simple" answer, names from the "timevaluepair" answer. */
export function parseFmi(simple: string, named: string): { name: string; position: { lat: number; lon: number }; levels: CharacteristicLevels }[] {
  const names = new Map<string, string>();
  for (const m of named.matchAll(/<gml:Point[^>]*>\s*<gml:name>([^<]*)<\/gml:name>\s*<gml:pos>([^<]*)<\/gml:pos>/g)) names.set(m[2]!.trim(), m[1]!.trim());
  const byPos = new Map<string, Record<string, number>>();
  for (const m of simple.matchAll(/<BsWfs:BsWfsElement[\s\S]*?<\/BsWfs:BsWfsElement>/g)) {
    const block = m[0];
    const pos = /<gml:pos>([^<]*)<\/gml:pos>/.exec(block)?.[1]?.trim();
    const param = /<BsWfs:ParameterName>([^<]*)<\/BsWfs:ParameterName>/.exec(block)?.[1];
    const value = Number(/<BsWfs:ParameterValue>([^<]*)<\/BsWfs:ParameterValue>/.exec(block)?.[1]);
    if (!pos || !param || !Number.isFinite(value)) continue;
    byPos.set(pos, { ...(byPos.get(pos) ?? {}), [param]: value });
  }
  const out: { name: string; position: { lat: number; lon: number }; levels: CharacteristicLevels }[] = [];
  for (const [pos, v] of byPos) {
    if (!FMI_PARAMS.every((p) => v[p] !== undefined)) continue;
    const [lat, lon] = pos.split(/\s+/).map(Number);
    out.push({
      name: names.get(pos) ?? `FMI ${lat!.toFixed(3)}, ${lon!.toFixed(3)}`,
      position: { lat: lat!, lon: lon! },
      // mm → m.
      levels: { mw: v.WLEVP1YAVG_P30Y_AVG! / 1000, mhw: v.WLEVP1YMAX_P30Y_AVG! / 1000, hw: v.WLEVP1YMAX_P30Y_MAX! / 1000, mnw: v.WLEVP1YMIN_P30Y_AVG! / 1000, nw: v.WLEVP1YMIN_P30Y_MIN! / 1000 },
    });
  }
  return out;
}

interface SykePlace {
  Paikka_Id: number;
  Nimi: string;
  KoordLat?: string;
  KoordLong?: string;
  KoordErTmPohj?: number;
  KoordErTmIta?: number;
  JarviNimi?: string | null;
  Tila_Id?: number;
}

/** "633316" (DDMMSS) → degrees. */
const dms = (s: string | undefined): number | null => {
  if (!s || !/^\d{6,7}$/.test(s)) return null;
  const v = s.padStart(7, '0');
  return Number(v.slice(0, 3)) + Number(v.slice(3, 5)) / 60 + Number(v.slice(5, 7)) / 3600;
};

export interface FetchOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function getText(url: string, o: FetchOptions): Promise<string> {
  const r = await (o.fetchImpl ?? fetch)(url, o.signal ? { signal: o.signal } : {});
  if (!r.ok) throw new Error(`${new URL(url).host} answered ${r.status}`);
  return r.text();
}

async function getJson<T>(url: string, o: FetchOptions): Promise<T> {
  return JSON.parse(await getText(url, o)) as T;
}

const fmiUrl = (format: 'simple' | 'timevaluepair', params: readonly string[]) =>
  `${FMI_WFS}?${new URLSearchParams({ service: 'WFS', version: '2.0.0', request: 'getFeature', storedquery_id: `${FMI_QUERY}::${format}`, parameters: params.join(',') }).toString()}`;

/** The gauges near (lat, lon): every FMI mareograph and the SYKE water-level stations within the search radius, nearest first. */
export async function findGauges(lat: number, lon: number, o: FetchOptions = {}): Promise<Gauge[]> {
  const tm = toTm35fin(lat, lon);
  const r = SYKE_SEARCH_RADIUS;
  const sykeUrl = `${SYKE_ODATA}/Paikka?${new URLSearchParams({
    $filter: `Suure_Id eq 1 and KoordErTmPohj ge ${Math.round(tm.n - r)} and KoordErTmPohj le ${Math.round(tm.n + r)} and KoordErTmIta ge ${Math.round(tm.e - r)} and KoordErTmIta le ${Math.round(tm.e + r)}`,
    $select: 'Paikka_Id,Nimi,KoordLat,KoordLong,KoordErTmPohj,KoordErTmIta,JarviNimi,Tila_Id',
  }).toString()}`;
  const [simple, named, syke] = await Promise.all([
    getText(fmiUrl('simple', FMI_PARAMS), o),
    getText(fmiUrl('timevaluepair', [FMI_PARAMS[0]]), o),
    getJson<{ value?: SykePlace[] }>(sykeUrl, o),
  ]);
  const gauges: Gauge[] = parseFmi(simple, named).map((g) => ({
    source: 'fmi',
    id: g.name,
    name: g.name,
    waterBody: null,
    position: g.position,
    distance: distanceFrom(lat, lon, g.position),
    active: true,
    levels: g.levels,
  }));
  for (const p of syke.value ?? []) {
    // The TM35FIN coordinates; the degrees-minutes-seconds fields differ from them by up to about
    // 200 m (an older datum, I95) and are used only when the others are missing.
    const hasTm = typeof p.KoordErTmPohj === 'number' && typeof p.KoordErTmIta === 'number';
    const plat = dms(p.KoordLat);
    const plon = dms(p.KoordLong);
    if (!hasTm && (plat === null || plon === null)) continue;
    const position = hasTm ? fromTm35fin(p.KoordErTmPohj!, p.KoordErTmIta!) : { lat: plat!, lon: plon! };
    const d = hasTm ? Math.hypot(p.KoordErTmPohj! - tm.n, p.KoordErTmIta! - tm.e) : distanceFrom(lat, lon, position);
    if (d > r) continue;
    gauges.push({ source: 'syke', id: String(p.Paikka_Id), name: p.Nimi.trim(), waterBody: p.JarviNimi?.trim() || null, position, distance: d, active: p.Tila_Id === 1 });
  }
  return gauges.sort((a, b) => a.distance - b.distance);
}

/** Daily values of a SYKE station from `startYear` on, following the pages. */
async function sykeDaily(id: string, startYear: number, endYear: number, o: FetchOptions, onPage?: (n: number) => void): Promise<{ time: string; value: number }[]> {
  let url: string | undefined = `${SYKE_ODATA}/Vedenkorkeus?${new URLSearchParams({
    $filter: `Paikka_Id eq ${Number(id)} and Aika ge datetime'${startYear}-01-01T00:00:00' and Aika le datetime'${endYear}-12-31T00:00:00'`,
    $select: 'Aika,Arvo',
    $orderby: 'Aika',
  }).toString()}`;
  const out: { time: string; value: number }[] = [];
  for (let page = 0; url && page < 200; page++) {
    const body: { value?: { Aika: string; Arvo: number | null }[]; 'odata.nextLink'?: string } = await getJson(url, o);
    for (const v of body.value ?? []) if (v.Arvo !== null && v.Arvo !== undefined) out.push({ time: v.Aika, value: v.Arvo });
    onPage?.(page + 1);
    url = body['odata.nextLink'];
  }
  return out;
}

/** The latest year with data of a SYKE station. */
async function sykeLastYear(id: string, o: FetchOptions): Promise<number | null> {
  const url = `${SYKE_ODATA}/Vedenkorkeus?${new URLSearchParams({ $filter: `Paikka_Id eq ${Number(id)}`, $select: 'Aika', $orderby: 'Aika desc', $top: '1' }).toString()}`;
  const body = await getJson<{ value?: { Aika: string }[] }>(url, o);
  const t = body.value?.[0]?.Aika;
  return t ? Number(t.slice(0, 4)) : null;
}

/**
 * The characteristic levels of a gauge as kept in the project: FMI's 1991–2020 values directly;
 * for SYKE the last `SYKE_YEARS` complete years up to last year (or to the station's last year).
 */
export async function gaugeLevels(g: Gauge, o: FetchOptions & { onProgress?: (pages: number) => void; today?: Date } = {}): Promise<WaterLevelInfo> {
  const fetchedOn = (o.today ?? new Date()).toISOString().slice(0, 10);
  const base = { source: g.source, station: g.name, waterBody: g.waterBody, position: g.position, distance: g.distance, fetchedOn };
  if (g.source === 'fmi') {
    if (!g.levels) throw new Error('no levels for this mareograph');
    return { ...base, startYear: 1991, endYear: 2020, levels: g.levels };
  }
  const last = await sykeLastYear(g.id, o);
  if (last === null) throw new Error(`no water-level data for ${g.name}`);
  const endYear = Math.min(last, (o.today ?? new Date()).getUTCFullYear() - 1);
  const startYear = endYear - SYKE_YEARS + 1;
  const daily = await sykeDaily(g.id, startYear, endYear, o, o.onProgress);
  const stats = characteristicLevels(daily, startYear, endYear);
  if (!stats) throw new Error(`too few complete years of data for ${g.name}`);
  const cm = (x: number) => x / 100;
  const years = [...new Set(daily.map((d) => Number(d.time.slice(0, 4))))].filter((y) => y >= startYear && y <= endYear);
  return {
    ...base,
    startYear: Math.min(...years),
    endYear: Math.max(...years),
    levels: { hw: cm(stats.hw), mhw: cm(stats.mhw), mw: cm(stats.mw), mnw: cm(stats.mnw), nw: cm(stats.nw) },
  };
}
