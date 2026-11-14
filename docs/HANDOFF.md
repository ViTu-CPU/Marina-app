# Jatko-ohje uudelle istunnolle (Marina-app)

Kopioi tämä uuden istunnon ensimmäiseksi viestiksi.

---

Jatketaan Marina-app-projektia (repo `vitu-cpu/marina-app`). Lue ensin `CLAUDE.md`,
`docs/SPEC.md`, `docs/DECISIONS.md`, `docs/RESEARCH.md` ja `docs/HANDOFF.md`. Työskentele haarassa
`claude/trusting-tesla-4khdre` (tai luo se `main`ista, jos sitä ei ole). Keskustele kanssani
suomeksi, UI pysyy englanniksi.

## Työtavat (CLAUDE.md + omat toiveeni)
- Yksi vaihe kerrallaan; committaa ja pushaa, kun `npx tsc --noEmit`, `npx vitest run` ja
  tarvittaessa `npm run build && node e2e/smoke.cjs` menevät läpi.
- Kirjaa päätökset ja oletukset `docs/DECISIONS.md`:hen (seuraava vapaa: D28, I64, U20).
- Yksiköt: pituudet m 1 desimaalilla, pinta-alat m² ja lukumäärät kokonaislukuina.
- Älä koskaan väitä teknistä tai turvallisuusvaatimustenmukaisuutta (RIL 201-3-2013,
  AS 3962) – kaikki on alustavaa ja vaatii pätevän suunnittelijan tarkastuksen.
- Älä keksi lukuja. Jokaiselle arvolle lähde (URL + lukupäivä) tai merkintä "Assumption" /
  "ESTIMATE". Kysy minulta, jos tarvitset jotain parempaan tulokseen.

## Tilanne (2026-11-14, kolmannen istunnon jälkeen)
Testit 334/334, e2e 18 vaihetta. Aiemmin tehty: tutkimus (RESEARCH.md), venepaikat
kappalemäärinä (D20), rantaponttoni (D21), muokkaus (D22), hinnasto data/hinnasto.xlsx (D19),
ankkurointisuunnitelma (D23), tuoteluettelo + kustannusarvio (D24), UFC-tuulikuorma ja
lähteistetyt oletukset (I54–I57), kiila-ankkurit (I59).

Kolmannessa istunnossa (omistajan päätökset D25–D27):
1. **Vinot ketjut (D25, I60–I61)**: laiturin kaikki ketjut ovat vinossa θ = 45° kohtisuorasta
   (parametri `splayAngle`, 0–80°). Rannanpuoleinen puolisko on vinossa kärkeä kohti ja kantaa
   mereltä tulevan tuulen, kärjenpuoleinen puolisko rantaa kohti ja kantaa rannalta tulevan.
   Kumpikin suunta tarkistetaan erikseen, ja linja mitoitetaan suuremman mukaan. Päätyketjut
   ±30° ja maatuen oletettu kuorma poistuivat. Lähteet: Chalmers 2026 kuva 4 (SF Marina,
   kulmat ulospäin) ja 45° K-Raudan Savorak-paketin kuvauksesta (heikko lähde, hakuote).
   Demoissa suurin linja 46,3 → 17,3 kN; ankkurimassa per laiturimetri lähes ennallaan.
2. **Ankkurityyppi (D26)**: betonipaino pysyy oletuksena.
3. **Väylä (D27, I62)**: oletuskerroin 1,5 → 1,75 (California DBW 2005 Table B-2), kerrotaan
   edelleen veneen (ei paikan) pituudella. Demot: suorakaide 428 → 381 paikkaa, lahti 436 → 351.
   Lahden strategia E jättää silloin 12 m luokan kokonaan pois (I25). Vanhat projektit
   säilyttävät tallennetun kertoimen.
4. **Hinnasto**: Top Marinen HD 3,0 m, tikkaat ja sähköpylväät tarkistettu sanatarkasti; MDP
   2,4 × 15 m lisätty; Savorakin painot 300–3 000 kg ja ketjut 10–22 mm lisätty (I63).
5. **Kalibrointi**: julkista suomalaista ankkurointisuunnitelmaa ei löytynyt; Skotlannin
   lupahakemuksista (marine.gov.scot) ei saatu ketjukokoja, ankkureita eikä kuormia (RESEARCH §9.10).

## Avoimet asiat, ehdotettu järjestys
1. **Rantaponttonin ankkurointi muuriin** ja siihen liittyvien laitureiden kuormat (nyt varoitus
   `ACCESS_PONTOON_WALL_FIXING`).
2. **Pitkien sormilaiturien kärkiankkurointi.**
3. Hinnaston aukot: A-Laiturit G40 -ketjujen murtokuorma (kysyttävä toimittajalta);
   asennuksen tuntimenekit, työveneen päivähinta ja Marinetekin hinnat ovat oletuksia.
   Top Marinen MD-paketin hinta on eri sivuilla ristiriitainen (RESEARCH §2.3).
4. Vinojen ketjujen suunta (I60): jos käytännöstä löytyy tietoa (ulospäin vai sisäänpäin,
   kulma), päivitä.
5. Roadmap (SPEC §11): kylkipaikka, Y-puomi, peräpoiju, GeoJSON, DXF/PDF, suomennos,
   bundlen pilkkominen, Web Worker.

## Omistajan vastaukset 2026-11-14
- Toteutuneen sataman ankkurointisuunnitelmaa, urakoitsijan tarjoushintoja tai
  RIL 201-3-2013:a ei ole nyt saatavilla. Kysy uudelleen, jos tilanne muuttuu.
- marine.gov.scot ja www.highland.gov.uk lisättiin ympäristön sallittuihin palvelimiin.
