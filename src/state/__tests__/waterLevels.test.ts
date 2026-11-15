import { describe, expect, it } from 'vitest';
import { anchoringLevels, characteristicLevels } from '../../engine/waterLevels';
import { findGauges, fromTm35fin, gaugeLevels, parseFmi, toTm35fin } from '../waterLevels';

describe('characteristic water levels (D50)', () => {
  it('HW, MHW, MW, MNW, NW over complete years; years with too few days do not give maxima or minima', () => {
    const daily: { time: string; value: number }[] = [];
    // 2001: 365 days 100 cm except one high (180) and one low (60); 2002: 365 days 110 except 150 and 90.
    for (const [year, base, hi, lo] of [[2001, 100, 180, 60], [2002, 110, 150, 90]] as const) {
      for (let d = 0; d < 365; d++) daily.push({ time: `${year}-01-01T00:00:00`, value: d === 10 ? hi : d === 20 ? lo : base });
    }
    // 2003: only 30 days (incomplete), with the highest value of all.
    for (let d = 0; d < 30; d++) daily.push({ time: '2003-01-01T00:00:00', value: d === 0 ? 200 : 105 });
    const l = characteristicLevels(daily, 2001, 2003)!;
    expect(l.years).toBe(2);
    expect(l.hw).toBe(200); // every day counts for the extremes
    expect(l.nw).toBe(60);
    expect(l.mhw).toBe(165); // (180 + 150) / 2
    expect(l.mnw).toBe(75);
    const sum = 363 * 100 + 180 + 60 + 363 * 110 + 150 + 90 + 29 * 105 + 200;
    expect(l.mw).toBeCloseTo(sum / (365 + 365 + 30), 9);
    expect(characteristicLevels(daily, 1990, 1995)).toBeNull();
  });

  it('anchoring levels at MW: extremes rounded up to 0.1 m, normal to the nearest 0.1 m', () => {
    // Helsinki Kaivopuisto 1991–2020 (FMI): MW 0.020, MHW 0.977, HW 1.512, MNW −0.594, NW −0.927 m.
    expect(anchoringLevels({ mw: 0.02, mhw: 0.977, hw: 1.512, mnw: -0.594, nw: -0.927 })).toEqual({ highWater: 1.5, lowWater: 1, normalHighWater: 1, normalLowWater: 0.6 });
  });
});

describe('gauges near the site (D50)', () => {
  it('ETRS-TM35FIN forward and inverse (GRS80, central meridian 27° E, k 0.9996)', () => {
    // On the central meridian N = 0.9996 × the meridian arc; the arc to 60° on GRS80 is 6 654 072.8 m
    // (numerical integration of the meridian radius), so N = 6 651 411.2 m.
    expect(toTm35fin(60, 27).n).toBeCloseTo(6651411.19, 1);
    expect(toTm35fin(0, 27)).toEqual({ n: 0, e: 500000 });
    // SYKE station Porovesi, Iisalmi: N 7 047 437, E 508 990; there and back within a millimetre.
    const p = fromTm35fin(7047437, 508990);
    const q = toTm35fin(p.lat, p.lon);
    expect(q.n).toBeCloseTo(7047437, 3);
    expect(q.e).toBeCloseTo(508990, 3);
    // Its degrees-minutes-seconds fields (63°33′16″, 27°11′03″) lie about 170 m away: another datum (I95).
    const dms = toTm35fin(63 + 33 / 60 + 16 / 3600, 27 + 11 / 60 + 3 / 3600);
    expect(Math.hypot(dms.n - 7047437, dms.e - 508990)).toBeGreaterThan(100);
    expect(Math.hypot(dms.n - 7047437, dms.e - 508990)).toBeLessThan(250);
  });

  const element = (pos: string, param: string, value: number) =>
    `<BsWfs:BsWfsElement gml:id="x"><BsWfs:Location><gml:Point><gml:pos>${pos} </gml:pos></gml:Point></BsWfs:Location><BsWfs:Time>1991-01-01T00:00:00Z</BsWfs:Time><BsWfs:ParameterName>${param}</BsWfs:ParameterName><BsWfs:ParameterValue>${value}</BsWfs:ParameterValue></BsWfs:BsWfsElement>`;
  const fmiSimple = [
    ['60.15371 24.95622', [20, 977, 1512, -594, -927]],
    ['65.67337 24.51526', [22, 1270, 1675, -894, -1280]],
  ]
    .flatMap(([pos, v]) =>
      ['WLEVP1YAVG_P30Y_AVG', 'WLEVP1YMAX_P30Y_AVG', 'WLEVP1YMAX_P30Y_MAX', 'WLEVP1YMIN_P30Y_AVG', 'WLEVP1YMIN_P30Y_MIN'].map((p, i) => element(pos as string, p, (v as number[])[i]!)),
    )
    .join('');
  const fmiNames =
    '<gml:Point gml:id="p1" srsDimension="2">\n<gml:name>Helsinki Kaivopuisto</gml:name>\n<gml:pos>60.15371 24.95622 </gml:pos>\n</gml:Point><gml:Point gml:id="p2"><gml:name>Kemi Ajos</gml:name><gml:pos>65.67337 24.51526 </gml:pos></gml:Point>';

  it('FMI: values by position from the simple answer, names from the timevaluepair answer, mm → m', () => {
    const g = parseFmi(fmiSimple, fmiNames);
    expect(g.map((x) => x.name)).toEqual(['Helsinki Kaivopuisto', 'Kemi Ajos']);
    expect(g[0]!.levels).toEqual({ mw: 0.02, mhw: 0.977, hw: 1.512, mnw: -0.594, nw: -0.927 });
    expect(g[0]!.position).toEqual({ lat: 60.15371, lon: 24.95622 });
  });

  it('search: FMI mareographs and SYKE stations, nearest first; SYKE levels from 30 years of daily values over several pages', async () => {
    const urls: string[] = [];
    const days = (year: number, base: number) => Array.from({ length: 365 }, (_, d) => ({ Aika: `${year}-01-01T00:00:00`, Arvo: d === 0 ? base + 80 : d === 1 ? base - 60 : base }));
    const fetchImpl = (async (input: string) => {
      const url = decodeURIComponent(String(input).replace(/\+/g, ' '));
      urls.push(url);
      if (url.includes('::simple')) return new Response(fmiSimple);
      if (url.includes('::timevaluepair')) return new Response(fmiNames);
      if (url.includes('/Paikka?'))
        return new Response(
          JSON.stringify({
            value: [
              { Paikka_Id: 1823, Nimi: 'Porovesi, Iisalmi ', KoordLat: '633316', KoordLong: '271103', KoordErTmPohj: 7047437, KoordErTmIta: 508990, JarviNimi: 'Porovesi', Tila_Id: 2 },
              { Paikka_Id: 4015, Nimi: 'Paloisjärvi', KoordLat: '633345', KoordLong: '271340', KoordErTmPohj: 7048330, KoordErTmIta: 511140, JarviNimi: null, Tila_Id: 1 },
            ],
          }),
        );
      if (url.includes('$top=1')) return new Response(JSON.stringify({ value: [{ Aika: '1995-12-31T00:00:00' }] }));
      if (url.includes('/Vedenkorkeus?')) {
        // Two pages: 1966–1980 and 1981–1995.
        const second = url.includes('page=2');
        const years = Array.from({ length: 15 }, (_, i) => (second ? 1981 : 1966) + i);
        return new Response(JSON.stringify({ value: years.flatMap((y) => days(y, 100)), ...(second ? {} : { 'odata.nextLink': 'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.1/odata/Vedenkorkeus?page=2' }) }));
      }
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const gauges = await findGauges(63.559, 27.1925, { fetchImpl });
    expect(gauges[0]!.name).toBe('Porovesi, Iisalmi');
    expect(gauges[0]!.active).toBe(false);
    expect(gauges[0]!.distance).toBeGreaterThan(500);
    expect(gauges[0]!.distance).toBeLessThan(1000);
    expect(gauges.map((g) => g.source)).toEqual(['syke', 'syke', 'fmi', 'fmi']);
    expect(urls.some((u) => u.includes('KoordErTmPohj ge'))).toBe(true);
    let pages = 0;
    const info = await gaugeLevels(gauges[0]!, { fetchImpl, onProgress: (n) => (pages = n), today: new Date('2026-11-15') });
    expect(pages).toBe(2);
    expect(info).toMatchObject({ source: 'syke', station: 'Porovesi, Iisalmi', waterBody: 'Porovesi', startYear: 1966, endYear: 1995, fetchedOn: '2026-11-15' });
    // cm → m: HW 1.80, MHW 1.80, NW 0.40, MNW 0.40; MW = (363·100 + 180 + 40) / 365 cm.
    expect(info.levels.hw).toBeCloseTo(1.8, 9);
    expect(info.levels.nw).toBeCloseTo(0.4, 9);
    expect(info.levels.mw).toBeCloseTo((363 * 100 + 180 + 40) / 365 / 100, 9);
    expect(urls.some((u) => u.includes("Aika ge datetime'1966-01-01T00:00:00'"))).toBe(true);
    // FMI: the 1991–2020 levels come with the search.
    const helsinki = await gaugeLevels(gauges.find((g) => g.name === 'Helsinki Kaivopuisto')!, { today: new Date('2026-11-15') });
    expect(helsinki).toMatchObject({ source: 'fmi', startYear: 1991, endYear: 2020, levels: { hw: 1.512 } });
  });
});
