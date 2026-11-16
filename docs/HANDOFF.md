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
- Kirjaa päätökset ja oletukset `docs/DECISIONS.md`:hen (seuraavat vapaat: **D62, I111, U26**).
- Yksiköt: pituudet m 1 desimaalilla, pinta-alat m² ja lukumäärät kokonaislukuina. Poikkeus
  (vahvistettu, D54): aallonkorkeudet 2 desimaalilla.
- Älä koskaan väitä teknistä tai turvallisuusvaatimustenmukaisuutta (RIL 201-3-2013, AS 3962).
- Älä keksi lukuja: jokaiselle arvolle lähde (URL + lukupäivä) tai merkintä "Assumption" /
  "ESTIMATE". Kysy, jos tarvitset jotain parempaan tulokseen.
- Node-skriptit, jotka hakevat verkosta kehitysympäristössä: `NODE_USE_ENV_PROXY=1
  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`.

## Tilanne (2026-11-16, viidennen istunnon jälkeen)
Testit 479/479, e2e 22 vaihetta. Viidennessä istunnossa (omistajan päätökset D53–D59):

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
7. **CAD-vienti tuotekirjastoineen (D61, omistajan pyyntö):** valittu vaihtoehto CAD-tiedostoon niin,
   että jokainen tuote on lohko (BLOCK), laituri koostuu lohkojen sijoituksista ja koko tuotekirjasto on
   samassa tiedostossa sivussa (helppo kopioida ponttoneja, aisoja jne.). Ehdotus: DXF (AutoCAD
   tallentaa DWG:nä); vahvista omistajalta ennen toteutusta.
8. Roadmap: kylkipaikka, GeoJSON-tuonti, T- ja L-päät.

## Ympäristö
Tässä istunnossa sallittuihin palvelimiin lisättiin overpass.private.coffee, yle.fi, bluet.fi,
kyst.dk, ruokolahti.fi, ouka.fi, pyhtaa10.oncloudos.com, asiakirjat.kustavi.fi ja
naantali.oncloudos.com sekä syvyyshakua varten julkinen.traficom.fi, paikkatiedot.ymparisto.fi ja
rest.emodnet-bathymetry.eu. Aiemmin lisättyjä ovat muun muassa overpass-api.de, opendata.fmi.fi,
rajapinnat.ymparisto.fi, archive-api.open-meteo.com, batunionen.se, marinetek.hr ja wbdg.org.
