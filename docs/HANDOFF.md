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
- Kirjaa päätökset ja oletukset `docs/DECISIONS.md`:hen (seuraava vapaa: D25, I60, U20).
- Yksiköt: pituudet m 1 desimaalilla, pinta-alat m² ja lukumäärät kokonaislukuina.
- Älä koskaan väitä teknistä tai turvallisuusvaatimustenmukaisuutta (RIL 201-3-2013,
  AS 3962) – kaikki on alustavaa ja vaatii pätevän suunnittelijan tarkastuksen.
- Älä keksi lukuja. Jokaiselle arvolle lähde (URL + lukupäivä) tai merkintä "Assumption" /
  "ESTIMATE". Kysy minulta, jos tarvitset jotain parempaan tulokseen.

## Tilanne (2026-11-14, viimeisin commit 0f70017)
Testit 329/329, e2e 18 vaihetta. Aiemmin tehty: tutkimus (RESEARCH.md), venepaikat
kappalemäärinä (D20), rantaponttoni (D21), muokkaus (D22), hinnasto data/hinnasto.xlsx (D19),
ankkurointisuunnitelma (D23), tuoteluettelo + kustannusarvio (D24).

Toisessa istunnossa (fb8c411, 0f70017):
1. Luettu: UFC 4-152-07 C1, UFC 4-159-03, California DBW 2005, Chalmers 2026, Sound & Sea
   Technology 2009, Vaasa 2020, Savorak (RESEARCH §9). Ei saatu: theseus.fi (Cloudflare),
   NAVFAC-käsikirja apps.dtic.mil (palvelin estää).
2. Tuulikuorma UFC:n kuvan 6-5 mukaan: poikittainen tuuli veneisiin keulasta, pitkittäinen
   kyljestä (ensimmäinen versio oli toisin päin, I54).
3. Oletukset lähteistä: Cd 1,6, profiilikorkeus 0,15 × L, ketju 4 × syvyys, ketjun SF 3,0
   uuden murtokuormasta ilman korroosiovaraa, betoni 2 400 kg/m³, hiekan kitka 0,60 (I55);
   suurin ankkurikappale 3 000 kg (I56); vanhat projektit säilyttävät arvonsa (I57);
   "Reset factors to defaults" (U19).
4. Ankkurityyppi: betonipaino (kitka, oletus) tai betonikiila (Pearl Harbor, Sound & Sea
   Technology 2009 taulukot 35–36; ketjua pidennetään kulmarajaan 5°/6°) (I59).
5. Avoin: kaksi päätyketjua kantavat pitkittäisen tuulen ja ovat nyt raskaimmat (I58).

## Avoimet asiat, ehdotettu järjestys
1. **Pitkittäiskuorman vienti (I58)**: päätyketjut ±30° vai vinot sivuketjut tms. – odottaa
   omistajan tietoa käytännöstä.
2. **Oletusankkurityyppi**: betonipaino vai kiila – odottaa omistajan päätöstä.
3. **Väylän leveys**: DBW 2005 antaa 1,75 × L_b (nyt oletus 1,5 ilman lähdettä) – kysy omistajalta.
4. Hinnaston aukot: asennuksen tuntimenekit, työveneen päivähinta, Marinetek (oletuksia);
   A-Laiturit G40 murtokuorma puuttuu; Top Marinen HD 3,0 m, tikkaat, sähköpylväät
   varmistamatta; Savorakin painot ja ketjut voisi lisätä (RESEARCH §9.7).
5. Rantaponttonin ankkurointi muuriin ja siihen liittyvien laitureiden kuormat.
6. Pitkien sormilaiturien kärkiankkurointi.
7. Roadmap (SPEC §11): kylkipaikka, Y-puomi, peräpoiju, GeoJSON, DXF/PDF, suomennos,
   bundlen pilkkominen, Web Worker.

## Kysymykset, jotka odottavat vastaustani
- Onko toteutuneen sataman ankkurointisuunnitelmaa tai toimittajan mitoitusta kalibrointiin?
- Saanko urakoitsijalta tarjoushinnat asennukselle ja työveneelle?
- Hankinko RIL 201-3-2013:n (70 €, RIL)?
