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
- Kirjaa päätökset ja oletukset `docs/DECISIONS.md`:hen (seuraava vapaa: D39, I86, U25).
- Yksiköt: pituudet m 1 desimaalilla, pinta-alat m² ja lukumäärät kokonaislukuina.
- Älä koskaan väitä teknistä tai turvallisuusvaatimustenmukaisuutta (RIL 201-3-2013,
  AS 3962) – kaikki on alustavaa ja vaatii pätevän suunnittelijan tarkastuksen.
- Älä keksi lukuja. Jokaiselle arvolle lähde (URL + lukupäivä) tai merkintä "Assumption" /
  "ESTIMATE". Kysy minulta, jos tarvitset jotain parempaan tulokseen.

## Tilanne (2026-11-15, kolmannen istunnon jälkeen)
Testit 381/381, e2e 20 vaihetta. Aiemmin tehty: tutkimus (RESEARCH.md), venepaikat
kappalemäärinä (D20), rantaponttoni (D21), muokkaus (D22), hinnasto data/hinnasto.xlsx (D19),
ankkurointisuunnitelma (D23), tuoteluettelo + kustannusarvio (D24), UFC-tuulikuorma ja
lähteistetyt oletukset (I54–I57), kiila-ankkurit (I59).

Kolmannessa istunnossa (omistajan päätökset D25–D32):
1. **Vinot ketjut (D25, I60–I61)**: laiturin kaikki ketjut ovat vinossa θ = 45° kohtisuorasta
   (parametri `splayAngle`, 0–80°). Rannanpuoleinen puolisko on vinossa kärkeä kohti ja kantaa
   mereltä tulevan tuulen, kärjenpuoleinen puolisko rantaa kohti ja kantaa rannalta tulevan.
   Kumpikin suunta tarkistetaan erikseen, ja linja mitoitetaan suuremman mukaan. Päätyketjut
   ±30° ja maatuen oletettu kuorma poistuivat. Lähteet: Chalmers 2026 kuva 4 (SF Marina,
   kulmat ulospäin) ja 45° Savorakin mökkilaiturin ohjeesta (heikko lähde).
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
6. **Rantaponttoni muurin edessä (D28, I64–I66)**: ketjut vain vesipuolella; muurista poispäin
   pitävät kaksi ristikkäistä rantaketjua kulkusillan kohdalla (oletus: ponttonin keskellä) ja
   siihen liittyvät laiturit kuormitusleveyden mukaan; laiturit lisäävät osuutensa rannan
   puolelta tulevaan kuormaansa. Seinäkiinnike = hinnaston kategoria `wall_fixing` (Savorakin
   kalliosilmukka 20 mm, kapasiteettia ei julkaistu).
7. **Vakiopituiset aisat (D29, I67, I70)**: sormen pituus pyöristetään ylöspäin projektin
   pituuslistaan; oletus Marinetekin mallit 5, 6, 7 m (Boat Booms) ja 6, 8, 10, 12 m (Mooring
   Fingers). Marinetekin ponttonit hinnastossa moduuleina (I71; hinnat yhä ESTIMATE).
8. **Kärkiankkurointi (D30, D31, I68, I72)**: pistolaiturin kärkeen kaksi ristikkäistä ketjua;
   yli 12 m:n sormille päätypaalu Marinetekin mukaan (ohjain G200/G400/G700, 20/40/70 kN),
   kuorma puolet viereisten veneiden täydestä kylkituulesta (UFC). Paaluja ei hinnoitella.
9. **Marinetekin esitteet** luettu (RESEARCH §9.12): marinetek.hr lisätty ympäristöön.
10. **Kulkusillat rantaponttonilla (D32, I73, U20)**: käyttäjä antaa paikat metreinä ponttonin
   ensimmäisestä pisteestä (tyhjä = yksi keskellä); jokaisella kaksi rantaketjua, kuorma
   kuormitusleveyden mukaan; tuoteluettelo laskee kulkusillat; kartalla ruskea merkki.
11. **Selkeys (U21, U22)**: samanlaiset varoitukset yhdeksi riviksi (avattava); kartan selite.
12. **Tehostus (U23)**: generointi Web Workerissa (sivu ei jäädy, peruutus); kirjastot omissa
   tiedostoissaan (kokonaiskoko ennallaan, välimuisti tehostuu).
13. **Raportti (U24)**: "Report (PDF)" avaa tulostusikkunan valitun vaihtoehdon raportista
   (kuva, vertailu, lähtötiedot, ankkurointi, kustannukset, lähteet); "Tallenna PDF-tiedostona".
14. **Venepaikkatyypit (D33, D34, I74–I75)**: projektin oletustyyppi ja sivukohtainen tyyppi
   täytössä; Y-puomi (Marinetekin puomit 5–7 m, 0,4 m; pidemmille veneille kiinnityssormi).
   Peräpoiju (D35, I76–I77): poiju veneen pituus + suunnittelusyvyys laiturista, paikan sisällä.
   Poijun etäisyyskerroin (I78): oletus 1 (Suomen Laiturikauppa), Top Marine 3.
15. **Peräpoijujen mitoitus (D36, I79–I82)**: veneluokissa paino (t), tyhjä = arvio pituudesta
   (Top Marinen purjevenetaulukko). Poijupaino = 3 × veneen paino (omistajan valinta) tai
   Top Marinen valintataulukko. Hinnastoon Top Marinen poijut ja 500 kg betonipaino.
16. **Muut lähteet ja uudet oletukset (D37, I83–I85, RESEARCH §9.14)**: omistaja pyysi arvioimaan
   itse. Oletuksena nyt Svenska Båtunionenin Hamnhandboken 2016 (taulukko 3: paino vedessä
   300–1 200 kg, ketju 10–16 mm, poiju 45–120 kp; avoin satama = koko ylöspäin), ketju
   max(1,41 × syvyys, ylävesi + 0,8 m), etäisyyskerroin 1 säilyy. Varoitukset: syvyys > 5 m,
   vedenkorkeusvaihtelu > 1,3 m, poiju > 1,4 × veneen pituus. 3 × paino -sääntöä ei tue mikään
   muu lähde (10–25 kertaa muita raskaampi).
17. **Poijurivien väylä (D38)**: Båtunionen ≥ 2,5 × veneen pituus, ≥ 20 m (painojen välissä vain
   vapaa vesi lasketaan). Demot peräpoijuilla: suorakaide 355 → 207 paikkaa, lahti 345 → 260;
   laituriväli 66 m (käsikirjan taulukko 1: 69 m). Sormilaiturit ennallaan.

## Avoimet asiat, ehdotettu järjestys
0. **Paikkaleveys** (Båtunionen taulukko 2: kaikille kiinnitystavoille 0,7–0,8 m veneen leveyttä
   enemmän; nyt oletus 0,5 m = käsikirjan "suojaisa ja ahdas" -tapaus). Omistajan päätettävä.
1. Paalujen ja Marinetekin tuotteiden hinnat puuttuvat (pyydä tarjous).
2. Hinnaston aukot: A-Laiturit G40 -ketjujen murtokuorma (kysyttävä toimittajalta);
   asennuksen tuntimenekit, työveneen päivähinta ja Marinetekin hinnat ovat oletuksia.
   Top Marinen MD-paketin hinta on eri sivuilla ristiriitainen (RESEARCH §2.3).
3. Vinojen ketjujen suunta (I60): jos käytännöstä löytyy tietoa (ulospäin vai sisäänpäin,
   kulma), päivitä.
4. Roadmap (SPEC §11): kylkipaikka, GeoJSON, DXF (Y-puomi, peräpoiju, PDF-raportti, Web Worker
   ja bundlen pilkkominen tehty).

## Omistajan vastaukset 2026-11-14
- Toteutuneen sataman ankkurointisuunnitelmaa, urakoitsijan tarjoushintoja tai
  RIL 201-3-2013:a ei ole nyt saatavilla. Kysy uudelleen, jos tilanne muuttuu.
- marine.gov.scot ja www.highland.gov.uk lisättiin ympäristön sallittuihin palvelimiin.
