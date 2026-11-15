# Jatko-ohje uudelle istunnolle (Marina-app)

Kopioi tämä uuden istunnon ensimmäiseksi viestiksi.

---

Jatketaan Marina-app-projektia (repo `vitu-cpu/marina-app`). Lue ensin `CLAUDE.md`,
`docs/SPEC.md`, `docs/DECISIONS.md`, `docs/RESEARCH.md` ja `docs/HANDOFF.md`. Keskustele kanssani
suomeksi, UI pysyy englanniksi.

## Haara ja julkaisu
Neljännen istunnon työ on haarassa `claude/tender-keller-45kwzk` (main + 12 committia). Kun
haluan julkaista, tee pull request mainiin: GitHub Actions testaa ja julkaisee mainin osoitteeseen
https://vitu-cpu.github.io/Marina-app/ . Jos PR on jo yhdistetty, aloita uusi työ mainista uuteen
haaraan.

## Työtavat (CLAUDE.md + omat toiveeni)
- Yksi vaihe kerrallaan; committaa ja pushaa, kun `npx tsc --noEmit`, `npx vitest run` ja
  tarvittaessa `npm run build && node e2e/smoke.cjs` menevät läpi.
- Kirjaa päätökset ja oletukset `docs/DECISIONS.md`:hen (seuraavat vapaat: **D53, I101, U26**).
- Yksiköt: pituudet m 1 desimaalilla, pinta-alat m² ja lukumäärät kokonaislukuina. Poikkeus
  odottaa vahvistustani: aallonkorkeudet 2 desimaalilla (U25).
- Älä koskaan väitä teknistä tai turvallisuusvaatimustenmukaisuutta (RIL 201-3-2013, AS 3962).
- Älä keksi lukuja: jokaiselle arvolle lähde (URL + lukupäivä) tai merkintä "Assumption" /
  "ESTIMATE". Kysy, jos tarvitset jotain parempaan tulokseen.
- Node-skriptit, jotka hakevat verkosta kehitysympäristössä: `NODE_USE_ENV_PROXY=1
  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

## Tilanne (2026-11-15, neljännen istunnon jälkeen)
Testit 448/448, e2e 22 vaihetta. Neljännessä istunnossa (omistajan päätökset D42–D52):

1. **AS 3962-2001** (D42, RESEARCH §11): omistajan toimittama kopio luettu ja ohjelman arvot
   tarkistettu. Kopio ei ole repossa; siinä on toisen henkilön käyttölisenssi. Tuuli: AS:n kaava
   30 s tuulella antaa sivutuulelle 0,95 × UFC:n arvon, joten tuulimalli ei muuttunut.
2. **Aaltoarvio 8 suuntasektorilla** (D47, I90–I92): jokaiselle sektorille avovesimatka (0 = ei
   avovettä), syvyys ja tuulet; kriteerit AS 3962 taulukko 4.2 (keula/vino/sivu), UFC valittavissa;
   kaikki ylittävät suunnat listataan; vanha yksi fetch siirtyy suuntansa sektoriin.
3. **Marinetekin aallonmurtajaehdotus** (D48, I93, RESEARCH §12): 3300, 3300K, 3800, 4300K, 5300K,
   vaimennuskäyrät digitoitu esitteistä; kevyin riittävä ehdotetaan tai "mikään ei riitä".
4. **Avovesimatkat kartalta** (I94, RESEARCH §13): OpenStreetMapin rantaviiva Overpass API:sta,
   säteet 5° välein, sektorin pisin säde; säteet kartalla (taso "Fetch rays"). **Testattu vain
   simuloidulla vastauksella** (Overpassin pääpalvelin katkaisi yhteyden kehitysympäristöstä).
5. **Vedenkorkeudet sijainnista** (D50, I95, RESEARCH §14): Ilmatieteen laitoksen mareografit
   (meri, 1991–2020) ja SYKEn asemat (järvet ja joet, 30 viimeistä havaintovuotta); käyttäjä
   valitsee aseman; HW/MHW/MW/MNW/NW → ylä- ja alivesi (ääriarvot) ja uudet normaali ylä- ja
   alivesi (peräpoijujen tarkistus). Testattu oikealla datalla: Helsinki 1,5/1,0 m (normaali
   1,0/0,6), Porovesi Iisalmi 1966–1995 1,4/1,4 m (0,8/0,7).
6. **Laiturit tuotemoduuleista** (D44, I89): oletus Marinetek Premier 2700 (2,7 m; 19,90 / 16,05 /
   12,20 m), enintään kaksi pisintä lyhyempää moduulia laiturissa; hinnastoon Premier-moduulit
   (ESTIMATE). Vanhat projektit: vapaa pituus.
7. **Ketjut joka liitoksesta X-kuviona** (D46, I96): Iisalmen suunnitelman mukaan; rannan päässä
   kärkeä kohti, kärjessä ulospäin. Demoissa yksi ketju 4,4–4,6 laiturimetriä kohden (Iisalmi 5 m).
8. **Kulkusillat rannasta** (D49, I97): laituri 4 m irti rannasta, 6 m kulkusilta, kaksi ristikkäistä
   rantakiinnitysketjua kulkusillan alle; kulkusilta kartalla ja tuoteluettelossa.
9. **Sekatyyppi** (D51, I98): Y-puomit pienille, sormet isoille samassa rivissä. Ei ollut demoissa
   tehokkaampi (jakajat −6 % €, paikkoja −1–2 %), joten **oletus on edelleen aisalaituri**.
10. **Aaltokuorma ankkurointiin** (D45, I99): AS 3962 4.8.2.3, 2 kN/m niistä suunnista, joilla on
    avovettä. **Vaikutus suuri**: suorakaidedemossa 2 km itäinen fetch nostaa ankkurit 1 224 t →
    5 040 t (285 k€ → 1,09 M€), koska betonipainot lasketaan pelkällä kitkalla.
11. **AS 3962 -tarkistukset** (D52, I100): neuvoa-antava lista (kulkutie, sormet, paikkaleveys,
    väylä, sisääntulo, kulkusillan leveys ja kaltevuus, syvyys, tikkaat); uusi valinnainen
    laiturimuurin korkeus kulkusillan kaltevuuteen.

## Avoimet päätökset (kysy omistajalta)
1. Sekatyyppi oletukseksi vai aisalaituri (I98)?
2. Aaltokuorman ja kitka-ankkureiden yhdistelmä tekee ankkureista moninkertaiset käytäntöön
   nähden (I99). Kalibroidaanko ankkurimalli (upotettu betonipaino, Iisalmi vertailukohtana) vai
   käytetäänkö aaltokuormalle pienempää arvoa?
3. U25: aallonkorkeudet 2 desimaalilla?
4. Onko Iisalmen suunnitelmasta saatavilla mitoitustiedot (syvyys, fetch, kuormat), jotta sitä
   voi käyttää tarkistuslaskelmana?

## Jatkotoimet, ehdotettu järjestys
1. **Kokeile oikeat haut selaimessa** julkaisun jälkeen: avovesimatkat kartalta (Overpass),
   vedenkorkeudet (FMI/SYKE) ja tuulidata (Open-Meteo), esim. Iisalmi ja Helsinki.
2. **Ankkurimallin kalibrointi** (kohta 2 yllä): upotetun betonipainon kapasiteetti (NAVFAC/OCEL),
   Iisalmen 100 m / 20 × 3 200 kg / 22 mm G40 30 m vertailuna.
3. **Strategia E ja rantaväli** (I98 d): suorakaidedemossa rantaväli > 0 pudottaa läntisimmän
   laiturin (364 → 308 paikkaa); haku korjattava.
4. **Aallonmurtaja kartalle**: aallonmurtajaponttonin sijoitus ja pituus kartalla, sen ankkurointi
   ja suojaava vaikutus (Iisalmen kaltainen tapaus).
5. **Kulkusillan leveys tuotteesta** AS 3962 taulukon 3.3 mukaan (paikkamäärä per kulkusilta) ja
   laiturimuurin korkeus esim. MML:n korkeusmallista.
6. **Tuulen vertailu** Ilmatieteen laitoksen havaintoihin (opendata.fmi.fi on nyt sallittu).
7. **Syvyys avovesimatkalla** syvyysaineistosta (selvitä avoimet lähteet, esim. Traficomin
   syvyystiedot).
8. **Hinnaston aukot**: Marinetekin tarjous (Premier, aallonmurtajat, sormet, puomit), paalut, A-Laiturit
   G40 -ketjun murtokuorma, asennuksen tuntimenekit ja työveneen hinta (oletuksia), Top Marinen
   MD-paketin ristiriitainen hinta.
9. Roadmap: kylkipaikka, GeoJSON-tuonti, DXF-vienti, T- ja L-päät.

## Ympäristö
Sallittuihin palvelimiin lisättiin tässä istunnossa overpass-api.de, opendata.fmi.fi,
rajapinnat.ymparisto.fi, en.ilmatieteenlaitos.fi, www.ilmatieteenlaitos.fi, www.ymparisto.fi ja
wiki.openstreetmap.org (aiemmin mm. batunionen.se, pdhonline.com, open-meteo.com, marinetek.hr).
