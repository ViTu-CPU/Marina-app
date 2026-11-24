# Jatko-ohje uudelle istunnolle (Marina-app)

Kopioi tämä uuden istunnon ensimmäiseksi viestiksi.

---

Jatketaan Marina-app-projektia (repo `vitu-cpu/marina-app`). Lue ensin `CLAUDE.md`,
`docs/SPEC.md`, `docs/DECISIONS.md`, `docs/RESEARCH.md` ja `docs/HANDOFF.md`. Keskustele kanssani
suomeksi, UI pysyy englanniksi.

## Haara ja julkaisu
Viidennen istunnon työ on haarassa `claude/adoring-ritchie-aoo2w4`. Siinä ovat myös neljännen
istunnon commitit (`claude/tender-keller-45kwzk`). Pull request mainiin: **#2**
(https://github.com/ViTu-CPU/Marina-app/pull/2). Kun se yhdistetään, GitHub Actions testaa ja julkaisee
mainin osoitteeseen https://vitu-cpu.github.io/Marina-app/ . Jos PR on jo yhdistetty, aloita uusi työ
mainista uuteen haaraan.

## Työtavat (CLAUDE.md + omat toiveeni)
- Yksi vaihe kerrallaan; committaa ja pushaa, kun `npx tsc --noEmit`, `npx vitest run` ja
  tarvittaessa `npm run build && node e2e/smoke.cjs` menevät läpi.
- Kirjaa päätökset ja oletukset `docs/DECISIONS.md`:hen (seuraavat vapaat: **D70, I130, U37**).
- Yksiköt: pituudet m 1 desimaalilla, pinta-alat m² ja lukumäärät kokonaislukuina. Poikkeus
  (vahvistettu, D54): aallonkorkeudet 2 desimaalilla.
- Älä koskaan väitä teknistä tai turvallisuusvaatimustenmukaisuutta (RIL 201-3-2013, AS 3962).
- Älä keksi lukuja: jokaiselle arvolle lähde (URL + lukupäivä) tai merkintä "Assumption" /
  "ESTIMATE". Kysy, jos tarvitset jotain parempaan tulokseen.
- Node-skriptit, jotka hakevat verkosta kehitysympäristössä: `NODE_USE_ENV_PROXY=1
  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

## Tilanne (2026-11-16, viidennen istunnon jälkeen)
Testit 484/484, e2e 22 vaihetta. Viidennessä istunnossa (omistajan päätökset D53–D59):

1. **Vastaukset** (D53–D56): aisalaituri pysyy oletuksena; aallonkorkeudet 2 desimaalilla
   vahvistettu; ankkurimalli kalibroidaan; Iisalmen mitoitustietoja ei ole.
2. **Oikea tuulidata** (I101): Open-Meteo toimii oikealla datalla (1996–2025, 262 992 tuntia, ei
   aukkoja). **Sisämaan järvellä ERA5:ssä ei ole meriruutua**: Iisalmessa `sea`, `nearest` ja `land`
   antavat saman maaruudun, ja tuulet ovat pienet (50 v 8,1–10,3 m/s; Helsinki 16,4–20,8 m/s).
3. **Ankkurivertailu** (I102): suunnitelma ja raportti näyttävät saman suunnitelman toisella
   ankkurityypillä. Iisalmen kaltainen 99,5 m laituri saa 20 ketjua, kuten piirustus. Pohjaan
   painunut betonipaino savessa (Sound & Sea Technology 2009 A-1.1) vastaa kitkakerrointa 0,26–0,39,
   joten oletus 0,3 säilyy.
4. **Strategia E** (I103): laituri täytetään uudelleen lopulliselle moduulipituudelle. Rantaväli ei
   enää pudota viimeistä laituria (suorakaide 4 m: 307 → 358 paikkaa, lahti 325 → 335).
5. **Betoniankkurit aina ja aaltokuorma aalloista** (D57, D59, I104): Merin (Vaasa, omistajan tiedot:
   11 × 20 × 4 × 1,4 m rinnakkain, 44 × 20 m; 45 × 5 t + 8 × 4 t = 257 t) toteutuneet ankkurit ovat
   0,97–1,65 × mallin tarve pitkällä sivulla, joten kitkamalli ja 2 kN/m sopivat avoimeen kohteeseen.
   Iisalmi sopii vain pienillä aalloilla. Aaltokuorma on nyt 0, kun 50 v Hm0 ≤ 0,3 m (UFC 4-152-07
   6-3.4.7.2), täysi 2 kN/m, kun Hm0 ≥ 0,6 m (AS 3962 taulukko 4.2 ja 4.8.2.3), ja välillä Hm0²:n
   mukaan (oletus). Iisalmen tapaus: 3,55 t/ketju, kun Hm0 ≤ 0,3 m (1,1 × piirustus).
6. **Aallonmurtajatyökalu** (D58, I105–I107): työkalupalkin "Breakwater" piirtää kelluvan
   aallonmurtajan kahdella napsautuksella. Tyypiksi tulee aaltoarvion ehdotus, jota voi vaihtaa
   kohdeluettelossa. Laiturit ja veneet pysyvät siitä esteetäisyyden päässä. Ankkurointi tehdään
   moduulien liitoksista, ja kummassakin päässä on ulospäin suuntautuvat ketjut. Moduulit ja paino
   näkyvät tuoteluettelossa (ei hintaa). Aaltotyökalu ja raportti näyttävät laiturien suojan
   (suora varjo, diffraktio ei mukana) ja läpäisevän aallon Hm0 × (1 − Ac).

## Ankkuroinnin korjaus (2026-11-18, D62, I114–I120, U26)
Haara `claude/new-session-olvxtp`. Ankkurimitoitus ei enää monista painoja: linjalla on enintään
yksi ankkuri (2 vain käyttäjän tandem-valinnalla). Jos hinnaston mikään ankkuri ei riitä, linja on
INFEASIBLE, ankkuripistettä ei hinnoitella ja BOM:iin tulee rivi "Anchor point – type and size by
geotechnical/mooring design". Hinnastossa on uudet ankkurisarakkeet (docs/PRICE_LIST.md), asennus
skaalautuu ankkurikappaleiden mukaan, yhteenveto luettelee kaikki hinnoittelemattomat erät ja Total
kertoo, mitä se ei sisällä. **Oletusarvoilla (savi μ 0,3) demojen kaikki linjat ovat INFEASIBLE**
(tarve 3,4–9,1 t, raskain sallittu paino 3 t). Regressiotestin fixture on sijaistiedosto, koska
omistajan "Untitled project" -tiedostoa ei ollut (I120). Testit 527/527, e2e 22 vaihetta.

## Mitoitusspeksi, syvyys ja varusteet (2026-11-19, D63–D65, I121–I126, U27–U28)
Sama haara `claude/new-session-olvxtp`.
- **Mitoitus omistajan speksin mukaan** (`docs/ANKKUROINTI_MITOITUS_SPEC.md`, D64): `src/engine/mooring.ts`
  on liitteen A portti, ja liitteen B testit menevät läpi ±1 %:n tarkkuudella.
- **Ankkurit** (D63): betoniankkuri enintään 5 t (yksi linjaa kohti), muuten paaluankkuri ketjun
  päähän. Paaluankkuri on hinnoittelematon, ellei hinnastossa ole `pile`-riviä.
  **Demojen kaikki linjat saavat paaluankkurin**, koska kitkalla tarvitaan 18–48 t (speksin liitteen B
  huomio: eroa ei piiloteta).
- **Mitoitussyvyys sijainnista** (I121): EMODnet tai SYKE, kahdeksan 200 m sädettä. Haku käynnistyy
  itsestään, kun sijainti tunnetaan; käsin syötetty syvyys katkaisee sen.
- **Access pontoon** (I122): sitä pitävät kiinni siihen liitetyt laiturit (omistajan D28) ja
  kulkusiltojen rantaketjut vaikutuspituuden mukaan. Omia ketjuja venepaikkojen läpi ei enää ole.
- **Varusteet** (D65): turvatikkaat 40 m ja pelastusvälinepylväät 80 m välein (Top Marine).
  Sähkö- ja vesipollareissa on 4 venepaikkaa per pollari (oletus). Varusteet ovat omalla tasollaan
  sekä BOM:ssa, DXF:ssä ja raportissa.
- Testit 544/544, e2e 22 vaihetta.

## Aaltoarvion tulostus ja käyttöliittymäanalyysi (2026-11-23, U29)
Haara `claude/inspiring-ramanujan-5ksg2y`. Waves-ikkunassa on "Print": oma aaltoraportti (A4, PDF selaimen
kautta), joka toimii myös ilman vesialuetta ja layoutia. Raportin aalto-osio, tulostustyylit ja sivukehys ovat
yhteisiä layout-raportin kanssa (`src/ui/export/htmlDoc.ts`, `waveReport.ts`). Käyttöliittymän
parannusehdotukset: `docs/UI_REVIEW.md`. Testit 554/554, e2e 22 vaihetta.

## Käyttöliittymä ja Helsingin kaava-aineisto (2026-11-23, U30–U34)
Sama haara. UI_REVIEW-kohdat 1–10 toteutettu (U30–U33): aaltopaneeli kartan vieressä numeroiduin
vaihein, Export-valikko, tarkistuslista, aloitusvalinta, tulokset välilehdillä ja karttatasojen
esiasetukset. Helsingin avoin karttadata (U34): pohjakartat, ajantasa-asemakaava ja kaava-alueen
valinta suunnittelualueeksi (kartta.hel.fi WMS/WFS, CC BY 4.0). Ympäristöön lisättiin
kartta.hel.fi, www.hel.fi ja hri.fi. Julkaistu PR #8:lla. 2026-11-24: aaltopisteen valinta kartalta (U35). Testit 578/578, e2e 23 vaihetta.

## Karttapohja, ankkurit ja sekasuuntaiset laiturit (2026-11-24, U36, D66–D67, I127–I128)
Haara `claude/tender-gates-6kg09a`.
- **Aloituskartta (U36):** uusi projekti avautuu OpenStreetMapiin Helsingin keskustassa (Senaatintori);
  taustakuvan lataus korvaa kartan. Aloituskartta ei anna sijaintia hauille ennen kuin vesialue on piirretty.
- **Ankkurit eivät maalle (D66, I127):** rantaviivan tai saaren yli menevä ketju kiinnitetään rantamuuriin
  (oletus) tai betonipainoon muurin juurelle lyhennetyllä ketjulla.
- **Strategia F (D67, I128):** laiturit useaan suuntaan, kukin ryhmä kohtisuoraan omaan rantaosuuteensa,
  yhteiset väylät; rivit veneluokittain (D68, I129). Laaja L-allas 757 paikkaa (E 597).
- **Ankkurit maalla (D66):** oletus betonipaino muurin juureen (omistajan valinta).
- **Useita rantaviivoja (D69):** jokainen piirto lisää palan; laiturit molemmilta rannoilta, kun yksi ei ulotu yli.

Avoimet kysymykset omistajalle:
1. Mistä saadaan 30 s mitoitustuuli (speksin TODO)?
2. Kuinka monta venepaikkaa pollaria kohti?
3. Kumpi tikasväli: 25 m (Merenkulkulaitos 3/2007, ei varmistettu) vai 40 m?
4. Mistä saadaan paaluankkurin hinta tai tarjous?

## Jatkotoimet, ehdotettu järjestys
1. **Yhdistä PR #2 ja kokeile oikeat haut selaimessa**: avovesimatkat (Overpass), vedenkorkeudet
   (FMI/SYKE) ja tuulidata (Open-Meteo), esim. Iisalmi ja Helsinki. Overpassia ei voitu testata
   kehitysympäristöstä: pääpalvelin katkaisee yhteyden, ja overpass.private.coffee lisättiin
   ympäristöön, mutta istunnon lupatarkistus esti kutsun.
2. **Tuulen vertailu FMI:n havaintoihin: tehty (I108).** "Waves"-ikkunan "Find FMI stations" listaa
   60 km:n säteellä olevat asemat; valitun aseman tuntihavainnot haetaan kuukausi kerrallaan, ja
   aaltoarvio käyttää oletuksena suurempaa ERA5:stä ja FMI:stä. Kokeile selaimessa ja valitse
   rannikolla mieluiten saari- tai ranta-asema.
3. **Lähteet, joita ei voitu lukea** (RESEARCH §9.15): Ruokolahden Rasilan venesataman lupapäätös
   (ESAVI 236/2023), Oulun kelluvien talojen tekninen ohje, Pyhtään, Kustavin ja Naantalin
   asiakirjat, Ylen ja Bluetin Meri-sivut sekä tanskalainen venesatama-aineisto (kyst.dk). Palvelimet
   lisättiin ympäristöön, mutta web-haku ei saanut niitä auki. Avaa ne selaimessa ja liitä PDF:t
   istuntoon, niin ankkurointivertailua voi täydentää.
4. **Kulkusillan leveys tuotteesta: tehty (I109).** Laiturimuurin korkeus MML:n korkeusmallista on
   kesken: MML:n korkeusmallien kyselypalvelu (WCS) vaatii henkilökohtaisen API-avaimen.
5. **Syvyys avovesimatkalla: tehty (I110).** "Find depths along the fetches": merellä EMODnet, järvillä
   SYKEn syvyysvyöhykkeet. Avoin kysymys: SYKE pyytää sovelluksilta tunnisteen WFS-käyttöön (gis-tuki).
6. **Hinnaston aukot**: Marinetekin tarjous (Premier, aallonmurtajat, sormet, puomit), paalut,
   A-Laiturit G40 -ketjun murtokuorma, asennuksen tuntimenekit ja työveneen hinta (oletuksia), Top
   Marinen MD-paketin ristiriitainen hinta.
7. **CAD-vienti tuotekirjastoineen: tehty (I111).** "Export DXF": jokainen tuote on lohko, laiturit
   lohkojen sijoituksia ja koko tuotekirjasto piirroksen vieressä. Kokeile AutoCADissa (Tallenna DWG:nä).
8. Roadmap: kylkipaikka, GeoJSON-tuonti, T- ja L-päät.

## Ympäristö
Tässä istunnossa sallittuihin palvelimiin lisättiin overpass.private.coffee, yle.fi, bluet.fi,
kyst.dk, ruokolahti.fi, ouka.fi, pyhtaa10.oncloudos.com, asiakirjat.kustavi.fi ja
naantali.oncloudos.com sekä syvyyshakua varten julkinen.traficom.fi, paikkatiedot.ymparisto.fi ja
rest.emodnet-bathymetry.eu. Aiemmin lisättyjä ovat muun muassa overpass-api.de, opendata.fmi.fi,
rajapinnat.ymparisto.fi, archive-api.open-meteo.com, batunionen.se, marinetek.hr ja wbdg.org.
