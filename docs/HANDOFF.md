# Jatko-ohje uudelle istunnolle (Marina-app)

Kopioi tämä uuden istunnon ensimmäiseksi viestiksi.

---

Jatketaan Marina-app-projektia (repo `vitu-cpu/marina-app`). Lue ensin `CLAUDE.md`,
`docs/SPEC.md`, `docs/DECISIONS.md` ja `docs/RESEARCH.md`. Työskentele haarassa
`claude/trusting-tesla-4khdre` (tai luo se `main`ista, jos sitä ei ole). Keskustele kanssani
suomeksi, UI pysyy englanniksi.

## Työtavat (CLAUDE.md + omat toiveeni)
- Yksi vaihe kerrallaan; committaa ja pushaa, kun `npx tsc --noEmit`, `npx vitest run` ja
  tarvittaessa `npm run build && node e2e/smoke.cjs` menevät läpi.
- Kirjaa päätökset ja oletukset `docs/DECISIONS.md`:hen (seuraava vapaa: D25, I54, U19).
- Yksiköt: pituudet m 1 desimaalilla, pinta-alat m² ja lukumäärät kokonaislukuina.
- Älä koskaan väitä teknistä tai turvallisuusvaatimustenmukaisuutta (RIL 201-3-2013,
  AS 3962) – kaikki on alustavaa ja vaatii pätevän suunnittelijan tarkastuksen.
- Älä keksi lukuja. Jokaiselle arvolle lähde (URL + lukupäivä) tai merkintä "Assumption" /
  "ESTIMATE". Kysy minulta, jos tarvitset jotain parempaan tulokseen.

## Tilanne (2026-11-14, viimeisin commit a35a9b6)
Testit: 320/320, e2e 17 vaihetta. Tehty tässä vaiheessa:
1. `docs/RESEARCH.md`: toimittajat, hinnat, ketjuluokat, ankkurointimenetelmä, kustannusarvion menetelmä, lähteet.
2. Venepaikkatavoite kappalemäärinä (`engine/targets.ts`, D20, I31–I34).
3. Rantaponttoni korkean muurin eteen, pistolaiturit sen reunasta (`Site.accessPontoons`, D21, I35–I38).
4. Muokkaus: sivun täyttö yhdellä luokalla / jakaumalla + tyhjät metrit, luokan vaihto,
   laiturin pituus/poisto/lisäys; täyttö ei vie naapurin väylää (`engine/edit.ts`, D22, I39–I43).
5. Hinnasto `data/hinnasto.xlsx` (125 tuotetta, 20 parametria), oma xlsx-lukija/kirjoittaja
   `src/catalog/xlsx.ts` (fflate), validointi `src/catalog/priceList.ts` (D19, I44–I46).
6. Ankkurointisuunnitelma karttatasona (`engine/anchoring.ts`, D23, I47–I49).
7. Tuoteluettelo + kustannusarvio + Excel-vienti (`engine/bom.ts`, `ui/costModel.ts`,
   `ui/panels/CostPanels.tsx`, `ui/export/bomXlsx.ts`, D24, I50–I53).

Tärkeimmät tiedostot: `src/engine/model.ts` (Project: `anchoring`, `cost`), `generate.ts`,
`fill.ts`, `validate.ts`, `site.ts`, `state/store.ts`, `state/projectFile.ts`,
`ui/panels/{Left,Right}Sidebar.tsx`, `ui/canvas/MarinaCanvas.tsx`, `e2e/smoke.cjs`.

## Avoimet asiat, ehdotettu järjestys
1. **Lue lähteet, joita edellinen istunto ei saanut auki** (sallitut palvelimet lisättiin
   ympäristöön, mutta ne tulevat voimaan vasta uudessa istunnossa):
   - Chalmers 2026, *Development of a Mooring Calculation Model for Pontoons*:
     https://odr.chalmers.se/items/45ca2ffd-b68f-4e8e-ae23-56df9091c482/full
   - UFC 4-152-07 *Design: Small Craft Berthing Facilities* (wbdg.org; lisää palvelin tarvittaessa)
   - California DBW *Layout and Design Guidelines for Marina Berthing Facilities* 2005:
     https://demo2.parks.ca.gov/pages/28702/files/Guide05.pdf
   - Vaasan selvitys 2020 (www.vaasa.fi) – nyt vain hakutuloksen ote (733 €/jm)
   - Theseus-opinnäytetyöt (www.theseus.fi): laiturin ankkurointi, venesataman kustannukset
   - Savorak (savorak.fi, ilman www – lisää sallittuihin), Lip-Lap ohjautuu sinne
   Korvaa niillä `DEFAULT_ANCHORING`-oletuksia (profiilikorkeus 0,25 × L, Cd 1,2, kitka
   savi 0,3 / kallio 0,5, linjaväli 12 m, ketjun pituus 3 × syvyys, varmuuskertoimet).
2. **Ankkuroinnin ero käytäntöön (I49):** oletuksilla ankkurit tulevat useita tonneja per
   linja, toimittajien paketit 2 × 1–3 t per ponttoni. Selvitä lähteistä (Chalmers, UFC,
   valmistajat) realistinen menetelmä (esim. upotetun ankkurin pito savessa, joustimet),
   älä viritä lukuja ilman lähdettä.
3. **Hinnaston aukot:** asennuksen tuntimenekit, työveneen päivähinta ja Marinetekin hinnat
   ovat oletuksia; A-Laitureiden G40-ketjuilta puuttuu murtokuorma; Top Marinen HD 3,0 m,
   tikkaat ja sähköpylväät ovat varmistamattomia (konekoosteesta). Päivitä, jos löytyy
   lähde, tai kysy minulta tarjoushinnat.
4. **Rantaponttonin ankkurointi:** nyt kuin laituri, vain oma tuulipinta; muuriin
   kiinnitys ja siihen liittyvien laitureiden kuormat puuttuvat.
5. **Sormilaiturien (pitkien kävelyaisojen) kärkiankkurointi** puuttuu.
6. **Muut roadmapista (SPEC §11):** kylkipaikka, Y-puomi, peräpoiju (peräpoijun
   ketjusääntö: Suomen Laiturikaupan esite s. 47, ks. RESEARCH §2.5), GeoJSON-tuonti,
   DXF/PDF, täysi suomennos, bundlen pilkkominen, generointi Web Workeriin.

## Kysymykset, jotka odottavat vastaustani
- Onko toteutuneen sataman ankkurointisuunnitelmaa tai toimittajan mitoitusta kalibrointiin?
- Saanko urakoitsijalta tarjoushinnat asennukselle ja työveneelle?
- Hankinko RIL 201-3-2013:n (70 €, RIL)?
