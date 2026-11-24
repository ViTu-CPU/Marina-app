/**
 * Wave screening as printable HTML (D40, D47, U29): the section shared with the layout report,
 * and a report of its own that the wave window prints, with or without a layout, so the tool
 * also serves a wave-climate study alone. Every page carries the disclaimer (SPEC §1).
 */
import { breakwaterProposal, breakwaterShelter, weightPerMetre } from '../../engine/breakwater';
import { sectorFetches } from '../../engine/fetchRays';
import type { MainPier, Project } from '../../engine/model';
import { pierAxis } from '../../engine/rows';
import { bearingOf, WAVE_SECTORS, waveAssessment, waveSectorBearing, type WaveAssessment, type WaveSettings } from '../../engine/waves';
import { sectorBearing } from '../../engine/wind';
import { translate, type Language, type StringKey } from '../../i18n';
import { DEPTH_SOURCES } from '../../state/depth';
import { formatCount, formatLength, formatPercent } from '../format';
import { esc, printDocument, tableHelpers } from './htmlDoc';

/** Wave heights with two decimals: the criteria are 0.15–0.61 m (U25). */
const heightIn = (language: Language) => (m: number) =>
  new Intl.NumberFormat(language === 'fi' ? 'fi-FI' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(m);

const assess = (project: Project, piers: readonly MainPier[]): WaveAssessment | null =>
  waveAssessment(
    project.waves,
    project.anchoring.depth,
    piers.map((p) => ({ id: p.id, bearing: bearingOf(pierAxis(p).along) })),
  );

/**
 * The wave screening section (inputs, sectors, criteria, advice, breakwater, shelter, sources);
 * empty when no sector has both a fetch and a wind.
 */
export function waveScreeningParts(project: Project, piers: readonly MainPier[], language: Language): string[] {
  const t = (key: StringKey) => translate(language, key);
  const { table, kv } = tableHelpers(t);
  const parts: string[] = [];
  const waveResult = assess(project, piers);
  if (waveResult) {
    const w = project.waves;
    const len = (m: number) => formatLength(m, language);
    const height = heightIn(language);
    parts.push(`<h2>${esc(t('waves.title'))}</h2>`);
    parts.push(
      kv([
        [t('waves.fetchDepth'), len(w.fetchDepth ?? project.anchoring.depth)],
        ...(w.wind1 === null ? [] : [[t('waves.wind1'), len(w.wind1)] as [string, string]]),
        ...(w.wind50 === null ? [] : [[t('waves.wind50'), len(w.wind50)] as [string, string]]),
        [t('waves.windAveraging'), t(w.windAveragingS === 3600 ? 'waves.avg3600' : 'waves.avg600')],
        [t('waves.criteriaSet'), t(`waveCriteria.${w.criteria}`)],
        [t('waves.quality'), t(`waveQuality.${w.quality}`)],
      ]),
    );
    const ev = (x: (typeof waveResult.sectors)[number], e: 'oneYear' | 'fiftyYear') => x.events.find((y) => y.event === e);
    parts.push(
      table(
        [t('waves.sector'), t('waves.fetchCol'), t('waves.depthCol'), t('waves.wind1Col'), t('waves.wind50Col'), t('waves.hm01'), t('waves.hm050'), t('waves.tpL'), t('waves.headingCol'), t('waves.statusCol')],
        waveResult.sectors.map((x) => {
          const one = ev(x, 'oneYear');
          const fifty = ev(x, 'fiftyYear');
          return [
            esc(`${WAVE_SECTORS[x.sector]} ${waveSectorBearing(x.sector)}°`),
            esc(len(x.fetch)),
            esc(len(x.depth)),
            esc(one ? len(one.wind) : '–'),
            esc(fifty ? len(fifty.wind) : '–'),
            esc(one ? height(one.waves.hm0) : '–'),
            esc(fifty ? height(fifty.waves.hm0) : '–'),
            esc(fifty ? `${len(fifty.waves.tp)} / ${len(fifty.waves.wavelength)}` : '–'),
            esc(x.headings.map((hd) => t(`waveHeading.${hd}`)).join(', ')),
            esc(x.status === 'exceeds' ? t('waves.exceeds') : x.status === 'ok' ? t('waves.ok') : t('waves.noCriterion')),
          ];
        }),
        [1, 2, 3, 4, 5, 6],
      ),
    );
    parts.push(`<h3>${esc(t('waves.criteria'))}</h3>`);
    const failing = waveResult.sectors.filter((x) => x.status === 'exceeds');
    parts.push(
      failing.length === 0
        ? `<p>${esc(t('waves.noneBad'))}</p>`
        : `<p>${esc(t('waves.bad'))}: ${failing
            .map(
              (x) =>
                `<strong>${esc(WAVE_SECTORS[x.sector]!)}</strong> (${esc(
                  x.checks
                    .filter((c) => c.ok === false)
                    .map((c) => `${t(`waveHeading.${c.heading}`).toLowerCase()}, ${t(`waveEvent.${c.event}`).toLowerCase()} ${height(c.waves.hm0)} > ${height(c.limit!)} m`)
                    .join('; '),
                )})`,
            )
            .join(', ')}</p>`,
    );
    if (waveResult.piers.length > 0) parts.push(`<p class="small">${esc(t('waves.piers'))}: ${esc(waveResult.piers.map((p) => p.id).join(', '))}</p>`);
    parts.push(`<div class="disclaimer">${esc(t(`waveAdvice.${waveResult.advice}`))}</div>`);
    if (waveResult.doubleBerthPiles && project.params.boatsPerBay === 2) parts.push(`<p class="small">${esc(t('waves.piles'))}</p>`);
    // D48: floating breakwater type.
    const proposal = breakwaterProposal(waveResult);
    if (proposal) {
      const p = proposal.proposed;
      parts.push(`<h3>${esc(t('breakwater.title'))}</h3>`);
      parts.push(
        `<p>${p ? `${esc(t('breakwater.proposed'))} <strong>${esc(p.name)}</strong> (${esc(p.modules.map((m) => `${m.code} ${len(m.length)} × ${len(p.width)} m`).join(', '))})` : esc(t('breakwater.none'))}</p>`,
      );
      parts.push(
        table(
          [t('breakwater.product'), t('breakwater.width'), t('breakwater.perMetre'), t('breakwater.result')],
          proposal.evaluations.map((e) => [
            esc(e.product.id),
            esc(`${len(e.product.width)} / ${height(e.product.freeboard)}`),
            esc(len(weightPerMetre(e.product))),
            esc(`${e.ok ? t('breakwater.ok') : e.checks.some((c) => c.transmitted === null) ? t('breakwater.beyondCurve') : t('breakwater.notEnough')}${e.beyondBestWavelength ? ` (${t('breakwater.beyondBest')} ${len(e.product.bestBelowWavelength)} m)` : ''}`),
          ]),
          [1, 2],
        ),
      );
      parts.push(`<p class="small">${esc(t('breakwater.note'))}</p>`);
    }
    // D58, I107: shelter behind the drawn breakwaters.
    const shelter = breakwaterShelter(project.site, piers, waveResult);
    if (shelter.length > 0) {
      parts.push(`<h3>${esc(t('shelter.title'))}</h3>`);
      parts.push(
        table(
          [t('shelter.direction'), t('shelter.pier'), t('shelter.share'), t('shelter.breakwater'), t('shelter.waves'), t('shelter.result')],
          shelter.map((r) => {
            const over = (c: (typeof r.checks)[number]) => (c.transmitted ?? c.check.waves.hm0) - c.check.limit!;
            const worst = r.checks.reduce((a, c) => (over(c) > over(a) ? c : a));
            const result = r.breakwaterId === null ? 'shelter.unsheltered' : worst.transmitted === null ? 'shelter.beyondCurve' : worst.ok && r.share >= 1 - 1e-9 ? 'shelter.ok' : worst.ok ? 'shelter.partly' : 'shelter.notEnough';
            return [
              esc(WAVE_SECTORS[r.sector]!),
              esc(r.pierId),
              esc(formatPercent(r.share, language)),
              esc(r.breakwaterId ?? '–'),
              esc(`${height(worst.check.waves.hm0)} → ${worst.transmitted === null ? '–' : height(worst.transmitted)} / ${height(worst.check.limit!)}`),
              esc(t(result as StringKey)),
            ];
          }),
          [2, 4],
        ),
      );
      parts.push(`<p class="small">${esc(t('shelter.note'))}</p>`);
    }
    const climate = w.climate;
    if (climate) {
      parts.push(
        `<p class="small">${esc(t('wind.title'))}: ${esc(climate.source)}; ${esc(t('wind.cell'))} ${climate.cell.lat.toFixed(2)}, ${climate.cell.lon.toFixed(2)}; ${climate.startYear}–${climate.endYear}; ${esc(climate.fetchedOn)}. ${esc(t('wind.note'))}</p>`,
      );
    }
    // I108: the FMI station climate and which climate gave the winds.
    const station = w.stationClimate;
    if (station) {
      parts.push(
        `<p class="small">${esc(t('station.title'))}: ${esc(station.source)}; ${station.startYear}–${station.endYear}; ${esc(station.fetchedOn)}. ${esc(t('station.choice'))}: ${esc(t(`station.choice.${w.climateChoice}`))}. ${esc(t('station.note'))}</p>`,
      );
    }
    parts.push(`<p class="small">${esc(t('waves.note'))}</p>`);
  }
  return parts;
}

/** Status colours of the fetch figure, as in the wave window's table (red exceeds, green OK). */
const STATUS_FILL = { exceeds: '#dc2626', ok: '#059669', unknown: '#64748b' } as const;

/**
 * Fetch of each 45° sector as a wedge (radius ∝ fetch, colour = result of the sector) and, after
 * a map lookup, the 5° rays as a line. Null when no sector has a fetch.
 */
export function fetchFigureSvg(waves: WaveSettings, result: WaveAssessment | null, language: Language): string | null {
  const af = waves.autoFetch;
  const fetches = waves.sectors.map((x) => x.fetch);
  const max = Math.max(0, ...fetches, ...(af ? af.distances : []));
  if (!(max > 0)) return null;
  const size = 240;
  const c = size / 2;
  const radius = c - 24;
  const r = (m: number) => (m / max) * radius;
  const point = (bearing: number, rr: number) => {
    const a = (bearing * Math.PI) / 180;
    return [c + rr * Math.sin(a), c - rr * Math.cos(a)] as const;
  };
  const f = (x: number) => x.toFixed(1);
  const out: string[] = [];
  // Rings at round distances, at most four.
  const km = max / 1000;
  const step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].find((s) => km / s <= 4) ?? 100;
  for (let d = step; d <= km + 1e-9; d += step) {
    const [x, y] = point(22.5, r(d * 1000));
    out.push(`<circle cx="${c}" cy="${c}" r="${f(r(d * 1000))}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`);
    out.push(`<text x="${f(x + 2)}" y="${f(y - 2)}" font-size="9" fill="#64748b">${esc(`${formatLength(d, language)} km`)}</text>`);
  }
  ['N', 'E', 'S', 'W'].forEach((label, i) => {
    const [x, y] = point(i * 90, radius + 13);
    out.push(`<text x="${f(x)}" y="${f(y + 3)}" font-size="11" text-anchor="middle" fill="#334155">${label}</text>`);
  });
  fetches.forEach((fetch, k) => {
    if (!(fetch > 0)) return;
    const status = result?.sectors.find((x) => x.sector === k)?.status ?? 'unknown';
    const bearing = waveSectorBearing(k);
    const rr = r(fetch);
    const [ax, ay] = point(bearing - 21, rr);
    const [bx, by] = point(bearing + 21, rr);
    out.push(
      `<path d="M${c},${c} L${f(ax)},${f(ay)} A${f(rr)},${f(rr)} 0 0 1 ${f(bx)},${f(by)} Z" fill="${STATUS_FILL[status]}" fill-opacity="0.45" stroke="${STATUS_FILL[status]}" stroke-width="1"><title>${esc(
        `${WAVE_SECTORS[k]}: ${formatLength(fetch, language)} m`,
      )}</title></path>`,
    );
  });
  if (af && af.distances.length > 2) {
    const pts = af.distances.map((d, i) => point(i * af.stepDeg, r(d)).map(f).join(',')).join(' ');
    out.push(`<polygon points="${pts}" fill="none" stroke="#0369a1" stroke-width="1" stroke-dasharray="3 2"/>`);
  }
  out.push(`<circle cx="${c}" cy="${c}" r="2.5" fill="#0f172a"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Fetch per direction">${out.join('')}</svg>`;
}

export interface WaveReportInput {
  project: Project;
  /** Piers of the selected alternative; empty = no alternative (all headings are checked). */
  piers: readonly MainPier[];
  /** Name of the selected alternative, or null. */
  layoutName: string | null;
  /** Position of the site lookups and whether it was entered (else the centre of the site on the map). */
  position: { lat: number; lon: number } | null;
  positionEntered: boolean;
  /** The wind rose of the wave window as SVG markup, or null. */
  windRoseSvg: string | null;
  language: Language;
  /** Date of the report, YYYY-MM-DD. */
  date: string;
}

/** U29: the wave screening as a report of its own, printable from the wave window. */
export function buildWaveReportHtml(input: WaveReportInput): string {
  const { project, piers, layoutName, position, positionEntered, windRoseSvg, language, date } = input;
  const t = (key: StringKey) => translate(language, key);
  const { table } = tableHelpers(t);
  const len = (m: number) => formatLength(m, language);
  const ms = (x: number | null | undefined) => (x === null || x === undefined ? '–' : len(x));
  const w = project.waves;
  const result = assess(project, piers);
  const parts: string[] = [];

  // Title, what was studied, disclaimer and the result in one line.
  parts.push(`<h1>${esc(project.name || t('app.title'))}</h1>`);
  const where = position
    ? `${position.lat.toFixed(4)}, ${position.lon.toFixed(4)} (${t(positionEntered ? 'waveReport.positionEntered' : 'waveReport.positionSite')})`
    : t('waveReport.positionNone');
  parts.push(
    `<p class="meta">${esc(t('waveReport.title'))} · ${esc(t('report.date'))} ${esc(date)} · ${esc(t('waveReport.position'))}: ${esc(where)} · ${esc(t('report.alternative'))}: ${esc(layoutName ?? t('waveReport.noLayout'))}</p>`,
  );
  parts.push(`<div class="disclaimer">${esc(t('app.disclaimer'))}</div>`);
  if (!result) {
    parts.push(`<div class="summary">${esc(t('waves.enter'))}</div>`);
  } else {
    const bad = result.bad.map((k) => WAVE_SECTORS[k]!).join(', ');
    parts.push(
      `<div class="summary ${result.bad.length > 0 ? 'bad' : 'good'}"><strong>${esc(result.bad.length > 0 ? `${t('waves.bad')}: ${bad}` : t('waves.noneBad'))}</strong><br>${esc(
        t(`waveAdvice.${result.advice}`),
      )}</div>`,
    );
  }

  // Where the fetches and depths came from, with the fetch figure.
  parts.push(`<h2>${esc(t('waveReport.fetches'))}</h2>`);
  const figure = fetchFigureSvg(w, result, language);
  const af = w.autoFetch;
  const ad = w.autoDepth;
  const sources: string[] = [];
  if (af) {
    const open = sectorFetches(af.distances, af.radius, af.stepDeg).map((x) => x.open);
    sources.push(
      `<p>${esc(t('autoFetch.done'))} ${af.position.lat.toFixed(4)}, ${af.position.lon.toFixed(4)} (${esc(formatCount(af.radius / 1000, language))} km, ${esc(af.fetchedOn)})${
        open.some((x) => x) ? esc(` · ${WAVE_SECTORS.filter((_, k) => open[k]).join(', ')}: ${t('autoFetch.open')}`) : ''
      }.</p>`,
    );
    sources.push(`<p class="small">${esc(af.source)}</p>`);
  } else {
    sources.push(`<p>${esc(t('waveReport.fetchManual'))}</p>`);
  }
  sources.push(`<p>${esc(t('waves.fetchDepth'))}: ${esc(len(w.fetchDepth ?? project.anchoring.depth))}</p>`);
  if (ad) {
    sources.push(
      `<p>${esc(t('autoDepth.done'))} (${esc(ad.fetchedOn)}): ${esc(
        WAVE_SECTORS.map((name, k) => {
          const x = ad.sectors[k];
          return `${name} ${x ? `${len(x.depth)} m (${x.source === 'emodnet' ? 'EMODnet' : 'SYKE'})` : '–'}`;
        }).join(', '),
      )}</p>`,
    );
  }
  if (figure) {
    parts.push(`<div class="figure">${figure}<div>${sources.join('')}<p class="small">${esc(t('waveReport.fetchFigure'))}</p></div></div>`);
  } else {
    parts.push(sources.join(''));
  }

  // The screening itself, shared with the layout report.
  const screening = waveScreeningParts(project, [...piers], language);
  if (screening.length > 0) parts.push(...screening);
  else parts.push(`<h2>${esc(t('waves.title'))}</h2><p>${esc(t('waves.enter'))}</p>`);

  // Wind climate: rose and extreme winds by direction, and the FMI station beside ERA5.
  parts.push(`<h2>${esc(t('waveReport.windClimate'))}</h2>`);
  const climate = w.climate;
  const station = w.stationClimate;
  if (!climate && !station) parts.push(`<p>${esc(t('waveReport.noClimate'))}</p>`);
  if (climate) {
    const pct = (x: number) => formatPercent(x, language);
    const highlight = new Set((result?.bad ?? []).map((k) => 2 * k));
    const rose = windRoseSvg && windRoseSvg.trimStart().startsWith('<svg') ? windRoseSvg : '';
    parts.push(`<h3>${esc(t('wind.title'))}</h3>`);
    parts.push(
      `<div class="figure">${rose}<div>${table(
        [t('wind.direction'), t('wind.share'), t('wind.oneYear'), t('wind.fiftyYear')],
        climate.sectors.map((s, k) => [esc(`${sectorBearing(k)}°`), esc(pct(s.rose.reduce((a, b) => a + b, 0))), esc(ms(s.oneYear)), esc(ms(s.fiftyYear))]),
        [1, 2, 3],
        (k) => (highlight.has(k) ? 'bad' : ''),
      )}<p class="small">${esc(t('wind.cell'))} ${climate.cell.lat.toFixed(2)}, ${climate.cell.lon.toFixed(2)} · ${climate.startYear}–${climate.endYear} · ${esc(formatCount(climate.hours, language))} h · ${esc(climate.fetchedOn)}</p></div></div>`,
    );
  }
  if (station) {
    parts.push(`<h3>${esc(t('station.title'))}</h3>`);
    parts.push(
      `<p class="small">${esc(station.source.split('; ').pop() ?? station.source)} · ${station.startYear}–${station.endYear} · ${esc(formatCount(station.hours, language))} h · ${esc(station.fetchedOn)}</p>`,
    );
    parts.push(
      table(
        [t('wind.direction'), t('station.era5'), t('station.fmi')],
        station.sectors.map((x, k) => [
          esc(`${sectorBearing(k)}°`),
          esc(climate ? `${ms(climate.sectors[k]?.oneYear)} / ${ms(climate.sectors[k]?.fiftyYear)}` : '–'),
          esc(`${ms(x.oneYear)} / ${ms(x.fiftyYear)}`),
        ]),
        [1, 2],
      ),
    );
    parts.push(`<p>${esc(t('station.choice'))}: ${esc(t(`station.choice.${w.climateChoice}`))}</p>`);
  }

  // How the fetches and depths were looked up (the wave and wind methods are in the sections above).
  if (af || ad) {
    parts.push(`<h2>${esc(t('waveReport.methods'))}</h2>`);
    if (af) parts.push(`<p class="small">${esc(t('autoFetch.note'))}</p>`);
    if (ad) parts.push(`<p class="small">${esc(t('autoDepth.note'))} ${esc(DEPTH_SOURCES.emodnet)}; ${esc(DEPTH_SOURCES.syke)}.</p>`);
  }

  return printDocument(language, `${project.name || t('app.title')} – ${t('waveReport.title')}`, parts.join('\n'));
}
