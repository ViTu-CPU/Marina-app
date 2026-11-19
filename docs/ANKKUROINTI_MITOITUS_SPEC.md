# ANKKUROINNIN MITOITUS – korjausspesifikaatio satamasuunnitteluohjelmaan

> **Koodausagentille:** Tämä tiedosto korvaa satamasuunnitteluohjelman nykyisen ankkuroinnin mitoituslogiikan. Toteuta luvut 2–8 ja liitteen A viitetoteutus (JavaScript, ES-moduuli). Liitteen B testien on mentävä läpi ±1 %:n tarkkuudella. Älä keksi kertoimia tai kaavoja tämän tiedoston ulkopuolelta. Jos jokin puuttuu, lisää `TODO` ja varoitus käyttöliittymään.
>
> **Käyttäjälle näytettävä rajaus (pakollinen tekstinä tulosnäkymässä):** "Alustava mitoitus. Ei korvaa suunnittelijan laskelmaa, pohjatutkimusta eikä valmistajan (esim. Seaflex/JFlex) mitoitusta. Jääkuormia ei mitoiteta."

Laadittu 18.11.2026 – lähteet luvussa 10.

---

## 1. Mitä korjataan ja miksi (tiivistelmä)

1. **Kuormat** lasketaan **AS 3962:2020** -standardin mukaan: tuulen paine `qz = 0.0006·V²`, veneiden tuulipinta-alat taulukosta 4.4, suojaus 100 % tuulen puoleiset ja 20 % suojan puoleiset, **aallon vähimmäiskuorma 2 kN/m** ja kuormayhdistelmä `tuuli + 1.5·virta + 1.5·aalto`.
2. **Kuorma jaetaan ankkurilinjoille** suunnan mukaan. Vain kuorman vastakkaisella puolella olevat linjat kantavat. Pitkittäiskuorma on erillinen mitoitustapaus.
3. **Ketju** mitoitetaan ketjukäyrällä (catenary) sekä **ylä- että alavedellä**. Tuloksena saadaan suurin jännitys, ketjun varmuus ja **ankkuriin kohdistuva nostovoima Fv**.
4. **Betoniankkuri** mitoitetaan kitkalla, joka lasketaan **vedenalaisesta painosta** ja josta Fv vähennetään. Kitkakerroin valitaan pohjan laadun mukaan (NAVFAC). Saveen voi käyttää koheesiomallia.
5. **Käytännön minimisäännöt** (FCG 2022, SF Marina, Båtunionen) näytetään varoituksina. Ne ovat erillisiä laskennasta.
6. **Seaflexiä ei mitoiteta ohjelmassa.** Ohjelma kokoaa valmistajalle lähetettävän lähtötietopaketin (luku 7).

---

## 2. Syötteet (tietomalli)

Kaikki yksiköt ovat SI-yksiköitä: m, kN, kg, kPa, m/s ja asteet.

### 2.1 Ponttoni `pontoon`
| Kenttä | Yksikkö | Oletus | Huom |
|---|---|---|---|
| `length` | m | – | moduulin tai yhtenäisen ponttonin pituus |
| `width` | m | – | |
| `freeboard` | m | 0.5 | kuivavarauma (tuulipinta). FCG 2022: +0.50…+0.65 m |
| `draft` | m | 0.5 | syväys (virtauspinta) |
| `type` | enum | `walkway` | `walkway` / `wave_attenuator` (aallonvaimennin) |

### 2.2 Venepaikat `berths`
`sideA` (+y-puoli) ja `sideB` (−y-puoli) ovat listoja muotoa `{ loa: m, type: 'motor' | 'yacht' }`. Lista järjestetään laiturin pituussuunnassa, ensimmäinen vene ensin.

### 2.3 Ympäristö `env`
| Kenttä | Yksikkö | Oletus | Huom |
|---|---|---|---|
| `windSpeed` | m/s | – | **30 sekunnin tasainen murtorajatilan mitoitustuuli** (AS 3962 4.8.3.2–3). Suomessa lähtöarvo otetaan eurokoodista tai Ilmatieteen laitokselta ja muunnetaan 30 s keskiarvoksi, ks. luku 9. |
| `waveLineLoad` | kN/m | 0 | Käyttäjän aaltoanalyysistä. Ohjelma käyttää arvoa `max(waveLineLoad, waveMin)`. |
| `currentSpeed` | m/s | 0 | AS 3962: joella tai suistossa vähintään 1.0 m/s |
| `waterDensity` | kg/m³ | 1025 | Merivesi 1026 ja makea vesi 1000 (AS 3962 4.8.4.3). Arvo 1025 on konservatiivinen, koska se pienentää ankkurin vedenalaista painoa. |
| `iceLineLoad` | kN/m | 0 | Vain raportoidaan, ei mitoiteta, ks. 3.6 |
| `extraStatic_kN` | kN | 0 | esim. kiinnittymisen ekvivalentti staattinen kuorma |
| `winterInWater` | bool | false | Laukaisee jäävaroituksen |
| `waterLevels` | m | – | `HW`, `NW` (+ mieluiten `MW`). Käytetään syvyyksien `h_HW`, `h_LW` laskentaan. |

### 2.4 Ankkurilinjat `legs[]`
| Kenttä | Yksikkö | Huom |
|---|---|---|
| `id` | – | |
| `dirDeg` | ° | Linjan suunta ponttonista **ankkuria kohti** ponttonin paikallisessa koordinaatistossa: 0° = +x (pituusakseli), 90° = +y |
| `h_LW`, `h_HW` | m | Korkeusero ankkurin silmukasta ponttonin kiinnityspisteeseen ali- ja ylävedellä |
| `chain.d_mm` | mm | ketjun nimellishalkaisija |
| `chain.kgPerM` | kg/m | **Valmistajan arvo ensisijainen.** Jos arvo puuttuu, käytetään likiarvoa `0.0219·d²` ja näytetään varoitus. |
| `chain.MBL_kN` | kN | murtokuorma valmistajalta (pakollinen) |
| `chain.length_m` | m | |
| `anchor.massDryKg` | kg | betoniankkurin kuivapaino |
| `anchor.seabed` | enum | `SEABED_FRICTION`-avain, ks. 5.2 |
| `anchor.slopeDeg` | ° | pohjan kaltevuus kuorman suuntaan (alamäkeen positiivinen), oletus 0 |
| `anchor.cohesive` | obj | valinnainen koheesiomalli `{Su_z, Su_a, A, B, z, gammaB}` |
| `anchor.capacityFactor` | – | Oletus 1.0. Arvoa > 1 saa käyttää vain dokumentoidulla perusteella (koeveto, mitattu upotus). Perusteeksi `capacityFactorSource` (teksti). |

### 2.5 Asetukset `opts`
| Kenttä | Oletus | Peruste |
|---|---|---|
| `FoS_chain` | 3.0 | Seaflex-raportti (New Bedford 2021): 3:1. API RP 2SK (offshore, ehjä, kvasistaattinen): 2.0. Chalmersin esimerkkikohde: ≈ 7.7. **Oletus on valinta, ei normiarvo.** |
| `FoS_anchor` | 1.5 | API RP 2SK (offshore): 1.8. Chalmersin mukaan kapasiteetti on hyvin herkkä upotukselle. **Oletus on valinta.** Näytä käyttöliittymässä myös tulos varmuudella 1.8. |
| `unevenFactor` | 1.0 | Kuorman epätasaisen jakautumisen kerroin linjoille (ei lähdettä). Käyttäjä voi nostaa. |
| `rhoConcrete` | 2400 | kg/m³ |
| `waveMin` | 2.0 | AS 3962 4.8.2.3. Arvo < 2.0 tuottaa varoituksen. |
| `leewardFactor` | 0.2 | AS 3962 4.8.3.3 |
| `rowShielding` | [1, 0.5, 0.3] | Tobiasson & Kollmeyer (pitkittäistuuli, veneet rivissä) |
| `cd` | ks. 3.2 | AS 3962 taulukko 4.3 |
| `preset` | – | `'FCG_wave_attenuator'` aktivoi FCG 2022 -minimit |

---

## 3. Kuormat (AS 3962:2020)

### 3.1 Tuulen paine
```
qz [kPa] = 0.0006 · V²        (AS 3962 Eq. 4.8.3.3(1))
FD [kN]  = CD · A · qz        (AS 3962 Eq. 4.8.3.3(2))
```
V on 30 s tasainen mitoitustuuli. Pysyvillä venepaikoilla käytetään murtorajatilan tuulta.

### 3.2 Vastuskertoimet (AS 3962 taulukko 4.3). Oletukseksi on valittu välin yläpää.
| Kohde | Väli | Oletus |
|---|---|---|
| Vene keula tuuleen | 0.7–0.9 | 0.9 |
| Vene perä tuuleen | 0.9–1.1 | 1.1 |
| Vene kylki tuuleen | 0.9–1.1 | 1.1 |
| Suorakaiderakenne (ponttonin kylki tai pääty) | 2.0 | 2.0 |

Poikittaistapauksessa veneelle käytetään arvoa `max(keula, perä)`, koska veneen kiinnityssuuntaa ei tiedetä.

### 3.3 Veneiden tuulipinta-alat (AS 3962 taulukko 4.4, vähimmäisarvot)
| LOA m | Moottori keula m² | Moottori kylki m² | Purje keula m² | Purje kylki m² |
|---|---|---|---|---|
| 8 | 5 | 16 | 4 | 11 |
| 10 | 7 | 22 | 5 | 15 |
| 12 | 11 | 29 | 6 | 20 |
| 15 | 18 | 45 | 9 | 28 |
| 18 | 22 | 64 | 11 | 40 |
| 20 | 24 | 76 | 12 | 44 |
| 25 | 30 | 95 | 15 | 60 |
| 30 | 45 | 120 | 35 | 92 |
| 35 | 54 | 167 | 36 | 122 |
| 40 | 78 | 213 | 40 | 182 |
| 45 | 85 | 264 | 50 | 210 |
| 50 | 90 | 285 | 60 | 249 |

Välissä interpoloidaan lineaarisesti. Alle 8 m ja yli 50 m veneille käytetään reuna-arvoa ja näytetään varoitus. Yli 25 m veneillä AS 3962 neuvoo käyttämään laskentakorkeutta z > 3 m (TODO: ei toteutettu, näytä varoitus).

### 3.4 Kuormatapaukset (4 pääsuuntaa per ponttoni)

**Poikittainen** `perp±`: tuuli ja aalto kohtisuoraan ponttonin pituusakselia vastaan. Veneet ovat keula tai perä tuuleen.
```
F_wind = qz·CD_head·( Σ A_head(tuulen puoleiset) + 0.2·Σ A_head(suojan puoleiset) )
       + qz·2.0·length·freeboard
F_wave = max(waveLineLoad, waveMin) · length
F_cur  = ½·ρ·2.0·v²/1000 · length·draft
```
Suojaussääntö: AS 3962 4.8.3.3, eli täysi voima tuulen puoleisiin veneisiin ja 20 % suojan puoleisiin. Laske molemmat suunnat (tuuli A- tai B-puolelta).

**Pitkittäinen** `par±`: tuuli ponttonin suuntaan. Veneet ovat kylki tuuleen rivissä.
```
F_wind = qz·CD_beam·Σ_sivut Σ_i A_beam,i·s_i      s = [1.0, 0.5, 0.3, 0.3, …]
       + qz·2.0·width·freeboard
F_wave = max(waveLineLoad, waveMin) · width
F_cur  = ½·ρ·2.0·v²/1000 · width·draft
```
Rivisuojaus perustuu Tobiasson & Kollmeyeriin (100/50/30 %). AS 3962 ei anna tähän tapaukseen omaa sääntöä, joten merkitse tämä käyttöliittymään.

### 3.5 Kuormayhdistelmä (murtorajatila, AS 3962 4.2(b))
```
F_ULS = F_wind + 1.5·F_cur + 1.5·F_wave + extraStatic_kN
```
Tuuli on jo murtorajatilan arvo, joten sen kerroin on 1.0. Aallot lasketaan vähintään 50 vuoden toistumisajalla (AS 3962 4.1).

### 3.6 Jää
- Ohjelma **ei mitoita** jääkuormaa. Jos `iceLineLoad > 0`, raportoidaan `F_ice = iceLineLoad·length` (poikittain) ja `·width` (pitkittäin) ja näytetään varoitus.
- Vertailuarvo FCG 2022 (Pielavesi, aallonvaimennin): jääkuorma vesirajassa 30 kN/m. Arvo on todennäköisesti paikallinen rakennekuorma (tulkinta, ei lähteen toteamus). 40 metrillä se tekisi 1200 kN, mikä on moninkertainen painoankkureiden kapasiteettiin nähden.
- Suomalainen lähde jääkuormille: RIL 201-3-2013.

### 3.7 Ei toteutettu (näytä TODO tai varoitus)
- Kiinnittymisen törmäysenergia (AS 3962 4.9: vähintään 0.3 m/s, uppoumat taulukosta 4.6). Toistaiseksi käyttäjä voi antaa ekvivalentin staattisen kuorman kenttään `extraStatic_kN`.
- Vinot tuulensuunnat. Tobiasson & Kollmeyerin lähteen mukaan noin 15–25° suoraan sivutuulesta poikkeava tuuli antaa suurimman voiman. Pääsuuntien tarkastelu voi siksi aliarvioida kuormaa.
- Dynamiikka (aaltotaajuinen liike, vaimennus), väsyminen ja korroosio. Malli on kvasistaattinen kuten Chalmersin prototyyppikin.

---

## 4. Kuorman jako ankkurilinjoille

Linjan yksikkövektori ponttonista ankkuria kohti on `u = (cos dirDeg, sin dirDeg)`. Kuorman suunta ponttoniin on `d`.

```
p_i     = u_i · d
aktiivinen, jos p_i < 0          (ankkuri on kuorman vastakkaisella puolella)
Th_i    = F_ULS · unevenFactor / Σ_aktiiviset |p_j|      (yhtä suuri vaakajännitys aktiivisille)
```
- Chalmersin mukaan **kohtisuora kuorma on mitoittava ja kuormittaa vain kuormitetun puolen ankkureita**.
- Jos mikään linja ei ole aktiivinen, kyseessä on **virhe**, koska ponttoni ei ole ankkuroitu kyseiseen suuntaan.
- Momenttitasapainoa ja jäykkyysjakoa ei lasketa. Tämä on rajoitus, joka mainitaan raportissa.
- **Huom. pitkittäiskuormasta:** jos linjat on levitetty vain 30° kohtisuorasta, pitkittäiskuorma tuottaa linjoille suuren jännityksen (liitteen B testi 4). Ohjelman pitää ehdottaa pitkittäisiä linjoja tai ristiinketjutusta, kun pitkittäistapaus on mitoittava.

---

## 5. Ketju ja betoniankkuri

### 5.1 Ketjukäyrä (venymätön, staattinen; kaavat Chalmers 2026 / Ma et al. 2019)
Merkinnät: `w` = ketjun paino vedessä [kN/m], `h` = korkeusero [m], `L` = ketjun pituus, `a = Th/w`.
```
Riippuva pituus kosketuspisteeseen:  ls = √( h·(h + 2a) )
JOS L ≥ ls  (osa ketjusta pohjassa):
    pohjassa = L − ls
    X        = (L − ls) + a·acosh(1 + h/a)
    T_fair   = Th + w·h
    T_anchor = Th,  Fv = 0
MUUTEN (koko ketju riippuu, ankkuriin kohdistuu nosto):
    ratkaise X:  (2a·sinh(X/2a))² = L² − h²
    ratkaise x1: a·(cosh((x1+X)/a) − cosh(x1/a)) = h
    Fv       = max(0, Th·sinh(x1/a))
    T_anchor = Th·cosh(x1/a)
    T_fair   = Th·cosh((x1+X)/a)
    nostokulma = atan(Fv/Th)
```
- Laske **molemmilla vedenkorkeuksilla** `h_LW` ja `h_HW`. Chalmersin esimerkkikohteessa suurin jännitys syntyi ylävedellä täydellä kuormalla.
- Ketjun paino: `w = kgPerM·(1 − ρw/7850)·g/1000`. Jos valmistajan kg/m-arvo puuttuu, käytetään likiarvoa `0.0219·d²` (hahlokettinki ilman välitukea) ja näytetään varoitus. Pitkähahloisen ketjun (DIN 763) paino on eri.
- Ketjun varmuus: `FoS_chain = MBL / max(T_fair, T_anchor)`.

### 5.2 Ankkurin vedenalainen paino ja kitkakapasiteetti
```
W' [kN] = m_dry · g · (1 − ρw/ρc) / 1000        (betoni menettää vedessä noin 43–45 % painostaan)
Kitkamaa:   Fh = (W' − Fv)·μ                     (PNNL 2009, liite A-1)
Kalteva pohja (kuorma vetää alamäkeen β):  Fh = W'(μ·cosβ − sinβ) − Fv·μ   → 0, kun tanβ = μ
```
Kitkakertoimet: massabetoni pohjamaata vasten (NAVFAC DM-7.02). Oletus on välin alapää.
| Avain | Pohja | μ (oletus) | Väli |
|---|---|---|---|
| `rock` | Ehjä kallio | 0.70 | 0.70 |
| `gravelCoarseSand` | Sora / karkea hiekka | 0.55 | 0.55–0.60 |
| `fineMediumSand` | Hieno–keskikarkea hiekka | 0.45 | 0.45–0.55 |
| `fineSiltySand` | Hieno siltt. hiekka | 0.35 | 0.35–0.45 |
| `silt` | Hieno siltti | 0.30 | 0.30 |
| `stiffClay` | Erittäin jäykkä savi | 0.40 | 0.40–0.50 |
| `mediumClay` | Keskijäykkä–jäykkä savi | 0.30 | 0.30–0.35 |
| `softClayMud` | Pehmeä savi / lieju | – | ei kitkamallia: käytä koheesiomallia tai asiantuntijaa |

### 5.3 Koheesiomalli (valinnainen, savi ja lieju; NCEL via PNNL 2009 liite A-1)
```
Fh = Su_z·A + (2·Su_a·z + ½·γb·z²)·B
```
`Su_z` = suljettu leikkauslujuus ankkurin pohjan tasolla [kPa], `Su_a` = keskiarvo välillä 0…z, `A` = pohjan ala [m²], `B` = leveys kuormaa vastaan [m], `z` = upotus [m], `γb` = maan tehokas tilavuuspaino [kN/m³]. Lähteessä on myös likiarvot (Nc = 5.7, Su_a = 0.5·Su_z). Ne jätetään käyttäjän syötteeksi, koska ne on annettu imperiaalisina yksiköinä.

### 5.4 Tarkistus ja vaadittu massa
```
FoS_anchor = Fh · capacityFactor / Th     ≥ opts.FoS_anchor
m_dry,req  = (FoS·Th + Fv·μ) / (μ·cosβ − sinβ) · 1000/g / (1 − ρw/ρc)
```
Mitoittava tapaus on se, jossa `FoS_anchor` on pienin kaikissa suunnissa ja kummallakin vedenkorkeudella.

### 5.5 Pakolliset varoitustekstit ankkurista
- "Kitkamalli on alaraja-arvio: upotus ja imu lisäävät kapasiteettia, mutta upotusta ei yleensä mitata." Chalmers: SF Marina arvioi upotukseksi noin 1/3 ankkurin korkeudesta. Chalmersin esimerkissä 3 tonnin ankkurin varmuus nousi arvosta 1.00 arvoon 2.00, kun upotus kasvoi 0.17 m:stä 0.40 m:iin.
- "Laskettu pito voi olla todellista suurempi." Yhdysvaltain laivaston koevedoissa betoniankkureiden todellinen pito oli 20–30 % ennustetusta (OTC 6033).
- Chalmers: useat pienet ankkurit samassa ketjussa eivät välttämättä vastaa yhtä suurta ankkuria, jolla on sama kokonaismassa.

---

## 6. Käytännön minimisäännöt (varoituksia, eivät korvaa laskentaa)

| Sääntö | Arvo | Lähde | Toteutus |
|---|---|---|---|
| Ketjun pituus | ≥ 5 × vesisyvyys | FCG 2022; Top Marine | varoitus, jos < 5 × h_HW |
| Ketjun pituus, alkuoletus | ≈ 4 × syvyys korkeimmalla vedellä | SF Marina (Chalmers 2026) | vahvempi varoitus, jos < 4 × h_HW |
| Ankkurointipisteitä | ≥ 4 / ponttoni | FCG 2022 | varoitus |
| Ankkuripaino (aallonvaimennin) | ≥ 850 kg / ponttonin pituusmetri (425 kg/m/sivu) | FCG 2022 | vain esiasetuksella `FCG_wave_attenuator`. **Kuiva vai vedenalainen paino ei käy ilmi lähteestä**, joten mainitse tämä. |
| Ketju (aallonvaimennin) | ≥ Ø28 mm, MBL ≥ 300 kN, sakkelit ≥ ketjun murtolujuus | FCG 2022 | esiasetus |
| Asennus | painot ja ketjut haraustason alapuolelle, painot tarvittaessa kaivetaan pohjaan, kiristys niin ettei paino liiku | FCG 2022 | infoteksti |
| Talvikäyttö | laituri rannan jäänmurtumislinjan ulkopuolelle, kevytponttonit nostetaan talveksi | Båtunionen 2016 | jos `winterInWater` |

**Toteutettujen hankkeiden vertailuarvot** (näytetään vertailuna, eivät ole sääntöjä):
- Parainen, A-Laiturit 2021: 10 000 kg betoniankkurit, DIN 763 22 mm / 30 m Grade 40, rantaketjut noin 13 m, kumi-iskunvaimentimet.
- Chalmers / SF Marina, lauttalaituri: 200 kN kiinnittymiskuorma, 30 mm R3 -ketju, 3 t ankkuri, suurin jännitys 108.7 kN, ketjun varmuus noin 7.7.

---

## 7. Seaflex (tai muu elastinen ankkurointi)

**Ohjelma ei mitoita Seaflexiä.** Valmistaja mitoittaa järjestelmän omalla JFlex-ohjelmallaan. Kuorma–venymäkäyriä ei ole julkaistu.

Ohjelma tuottaa **lähtötietopaketin** (vienti JSON- tai PDF-muodossa) valmistajalle. JFlexin syötteet ovat vedenkorkeuden vaihtelu, tuuli, aallot, virta, syvyys ja tuulipinta. Lisäksi paketissa ovat asemapiirros, ponttonityyppi ja mitat, venepaikkojen koot, pohjan laatu sekä luvun 3 kuormat.

Vertailuesimerkki (New Bedford, Seaflex Report 4671, 2021):
- 11.6 m ponttoni, 4 × Seaflex 4040TGBPTH. Yhden köyden murtokuorma 10 kN ja käyttökuorma 0.5–5 kN (30–80 % venymä); ohitusvarmistuksen murtokuorma 150 kN.
- Menetelmä: BS 6349-6:1989 ja AS 3962-2001 -tuulikuormat. Ankkuroinnin pituussuhde 2.5:1, vaakakulmat 30°.
- Kuormat: tuuli 4.9 kN, aalto 15.3 kN, virta 0.2 kN. Varmuus 3:1.

Ankkurointityypin valinnassa näytettävä tieto: ketjujärjestelmän vakaus perustuu riippuvan ketjun painoon, joten **matala vesi ja suuri vedenkorkeuden vaihtelu heikentävät ketjua**. Elastinen järjestelmä pitää tasaisen vedon (Marine Construction Magazine).

---

## 8. Tulosnäkymä

Jokaiselle linjalle näytetään mitoittava tapaus: suunta, vedenkorkeus, `Th`, `T_fair`, `Fv`, nostokulma, ketjun varmuus, ankkurin kapasiteetti, ankkurin varmuus ja vaadittu ankkurin kuivapaino.

Värikoodaus:
- vihreä = varmuus ≥ tavoite
- keltainen = varmuus ≥ 1.0 mutta < tavoite
- punainen = varmuus < 1.0

Lisäksi näytetään:
- kuormataulukko (tuuli, virta, aalto ja murtorajatilan summa per suunta)
- kaikki luvun 6 varoitukset lähdeviitteineen
- luvun 5.5 varoitustekstit
- pakollinen rajausteksti (alku)

---

## 9. Suomeen soveltaminen (tiedossa olevat aukot)

- **Mitoitustuuli:** AS 3962 käyttää 30 sekunnin tasaista murtorajatilan tuulta Australian kuormastandardin mukaan. Suomessa lähtöarvo tulee eurokoodista (SFS-EN 1991-1-4 ja kansallinen liite) tai Ilmatieteen laitokselta, ja se muunnetaan 30 s keskiarvoksi. **TODO:** muunnosta ei ole tässä spesifikaatiossa, joten käyttäjä syöttää V:n itse ja käyttöliittymä kertoo tämän.
- **Vedenkorkeudet:** esimerkiksi Helsingin havaitut ääriarvot ovat +151 cm (9.1.2005) ja −93 cm (28.1.2010) teoreettisen keskiveden suhteen. Kohteen arvot otetaan Ilmatieteen laitoksen datasta.
- **Jää:** ei mitoiteta, ks. 3.6.
- **Suomalaiset kuormaohjeet:** RIL 201-3-2013 (Vesirakenteet). Sitä ei ole käytetty tässä, koska se on maksullinen eikä ole ollut käytettävissä. Kun se saadaan, kuormat (erityisesti jää ja aallot) tarkistetaan sitä vasten.

---

## 10. Lähteet

1. **AS 3962:2020 Marina design.** Standards Australia. Luvut 4.1–4.16 (kuormat, yhdistelmät, taulukot 4.3–4.6). Käyttäjän toimittama kopio.
2. **FCG Finnish Consulting Group Oy (2022).** Pielaveden kunta, Kirkonkylän venesataman ponttoniaallonvaimennin, rakennustapaseloste 23.5.2022, P44743. Käyttäjän toimittama kopio.
3. **Aliprantis & Jarlgren (2026).** Development of a Mooring Calculation Model for Pontoons. Kandidaatintyö, Chalmers / SF Marina. https://odr.chalmers.se/bitstreams/8823a8b8-5646-4f38-a096-53286caf0a8b/download
4. **PNNL (2009).** Advanced Anchor and Mooring Study, liite A-1 (painoankkurit) ja taulukko 43 (varmuuskertoimet, viittaa API RP 2SK:hon). https://tethys.pnnl.gov/sites/default/files/publications/Advanced-Anchor-and-Mooring-Study.pdf
5. **NAVFAC DM-7.02:n kitkakertoimet** (toissijainen lähde: GEO5-ohje). https://finesoftware.eu/help/geo5/en/table-of-ultimate-friction-factors-for-dissimilar-materials-01/
6. **New Bedford ConCom Response (2022), Seaflex Report 4671.** https://newbedford-ma.s3.amazonaws.com/wp-content/uploads/sites/39/20220217112234/20220217-ConCom-Response.pdf
7. **Marina Dockage: tuulikuorman laskenta** (Tobiasson & Kollmeyer, ASCE Manual 50). https://www.marinadockage.com/?p=18078
8. **Marine Construction Magazine: elastinen vs. ketjuankkurointi.** https://marineconstructionmagazine.com/?p=3306
9. **Båtunionen, Hamnhandboken (2016).** https://batunionen.se/wp-content/uploads/2020/01/hamnhandboken-version-1-2016.compressed.pdf
10. **A-Laiturit Oy / Parainen (2021), ponttonilaiturin piirustus.** https://pargas.fi/dynasty/fi_FI/kokous/20215140-12-4.PDF
11. **OTC 6033 (1989), Deep Embedment Plate Anchors** (betoniankkureiden koevedot). https://stewart-usa.com/wp-content/uploads/2018/10/OTC-6033-Deep-Embedment-Plate-Anchors-1989.pdf
12. **Top Marine OÜ: ketjuankkurointi pohjoisissa jääoloissa** (valmistajan tieto). https://www.nauticexpo.com/prod/top-marine-oue/product-195765-541977.html
13. **Helsingin kaupunki / Ilmatieteen laitos (2013), aaltoiluselvityksen tilannekatsaus** (vedenkorkeuksien ääriarvot). https://www.hel.fi/static/kv/Geo/CasePankki/Aaltoiluselvityksen_tilannekatsaus_2013-05-15.pdf

---

## Liite A – viitetoteutus (`anchoring.mjs`)

Toteuta ohjelmaan vastaava moduuli tai käytä tätä sellaisenaan. Funktiot ovat puhtaita, eikä niillä ole riippuvuuksia.

```javascript
// anchoring.mjs — Ponttonilaiturin ankkuroinnin alustava mitoitus (viitetoteutus)
// Yksiköt: m, kN, kg, kPa, m/s, astetta. Kaikki funktiot puhtaita (ei sivuvaikutuksia).
// Lähteet: ks. ANKKUROINTI_MITOITUS_SPEC.md, luku 10.

export const G = 9.81; // m/s²

// ---------------------------------------------------------------------------
// 1. Taulukot
// ---------------------------------------------------------------------------

// AS 3962:2020 Table 4.4 — vähimmäistuulipinta-alat [head m², beam m²]
export const VESSEL_WIND_AREA = {
  motor: { 8: [5, 16], 10: [7, 22], 12: [11, 29], 15: [18, 45], 18: [22, 64], 20: [24, 76],
           25: [30, 95], 30: [45, 120], 35: [54, 167], 40: [78, 213], 45: [85, 264], 50: [90, 285] },
  yacht: { 8: [4, 11], 10: [5, 15], 12: [6, 20], 15: [9, 28], 18: [11, 40], 20: [12, 44],
           25: [15, 60], 30: [35, 92], 35: [36, 122], 40: [40, 182], 45: [50, 210], 50: [60, 249] },
};

// AS 3962:2020 Table 4.3 — tuulen vastuskertoimet (oletus = välin yläpää, konservatiivinen)
export const WIND_CD = {
  vesselBow: 0.9,      // 0.7–0.9
  vesselStern: 1.1,    // 0.9–1.1
  vesselBeam: 1.1,     // 0.9–1.1
  rectangular: 2.0,    // ponttonin kylki/pääty
};

// AS 3962:2020 Table 4.5 — virtauksen vastuskertoimet
export const CURRENT_CD = { pontoon: 2.0, vesselBow: 0.3, vesselBeamHull: 0.6, vesselBeamKeel: 1.2 };

// NAVFAC DM-7.02 (via GEO5-ohje) — massabetoni pohjamaata vasten, tan δ. Oletus = välin alapää.
export const SEABED_FRICTION = {
  rock:            { label: 'Ehjä kallio', mu: 0.70, range: [0.70, 0.70] },
  gravelCoarseSand:{ label: 'Sora / karkea hiekka', mu: 0.55, range: [0.55, 0.60] },
  fineMediumSand:  { label: 'Hieno–keskikarkea hiekka', mu: 0.45, range: [0.45, 0.55] },
  fineSiltySand:   { label: 'Hieno siltt. hiekka', mu: 0.35, range: [0.35, 0.45] },
  silt:            { label: 'Hieno siltti', mu: 0.30, range: [0.30, 0.30] },
  stiffClay:       { label: 'Erittäin jäykkä savi', mu: 0.40, range: [0.40, 0.50] },
  mediumClay:      { label: 'Keskijäykkä–jäykkä savi', mu: 0.30, range: [0.30, 0.35] },
  softClayMud:     { label: 'Pehmeä savi / lieju', mu: null, range: null }, // ei kitkamallia → koheesiomalli tai asiantuntija
};

// ---------------------------------------------------------------------------
// 2. Apufunktiot
// ---------------------------------------------------------------------------

function interp(table, L) {
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (L <= keys[0]) return { head: table[keys[0]][0], beam: table[keys[0]][1], extrapolated: L < keys[0] };
  if (L >= keys.at(-1)) return { head: table[keys.at(-1)][0], beam: table[keys.at(-1)][1], extrapolated: L > keys.at(-1) };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (L >= a && L <= b) {
      const t = (L - a) / (b - a);
      return {
        head: table[a][0] + t * (table[b][0] - table[a][0]),
        beam: table[a][1] + t * (table[b][1] - table[a][1]),
        extrapolated: false,
      };
    }
  }
}

export function vesselWindArea(type, loa) {
  return interp(VESSEL_WIND_AREA[type] ?? VESSEL_WIND_AREA.motor, loa);
}

function bisect(f, lo, hi, tol = 1e-9, maxIter = 200) {
  let flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) throw new Error('bisect: ei merkinvaihtoa');
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi), fm = f(mid);
    if (Math.abs(fm) < tol || (hi - lo) < tol) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return 0.5 * (lo + hi);
}

// AS 3962 Eq. 4.8.3.3(1): qz [kPa] = 0.0006 V² (V = 30 s mitoitustuuli, m/s)
export const windPressure = (V) => 0.0006 * V * V;

// AS 3962 Eq. 4.8.4.3(1): p [kPa] = ½ ρ CD v² / 1000
export const currentPressure = (rho, cd, v) => 0.5 * rho * cd * v * v / 1000;

// ---------------------------------------------------------------------------
// 3. Ympäristökuormat yhdelle ponttonille (4 pääsuuntaa)
// ---------------------------------------------------------------------------
// pontoon: { length, width, freeboard, draft }
// berths:  { sideA: [{loa, type}], sideB: [{loa, type}] }  (A = +y-puoli, B = −y-puoli)
// env:     { windSpeed, waveLineLoad, currentSpeed, waterDensity, iceLineLoad, extraStatic_kN }
// opts:    { cd: {...WIND_CD}, leewardFactor: 0.2, rowShielding: [1, 0.5, 0.3], waveMin: 2.0 }
export function environmentalLoads(pontoon, berths, env, opts = {}) {
  const warnings = [];
  const cd = { ...WIND_CD, ...(opts.cd || {}) };
  const leeward = opts.leewardFactor ?? 0.2;              // AS 3962 4.8.3.3
  const rowSh = opts.rowShielding ?? [1, 0.5, 0.3];        // Tobiasson & Kollmeyer
  const waveMin = opts.waveMin ?? 2.0;                     // AS 3962 4.8.2.3, kN/m
  if (waveMin < 2.0) warnings.push(`Aallon vähimmäisviivakuorma ${waveMin} kN/m < 2 kN/m (AS 3962 4.8.2.3) – sallittu vain tarkemmalla aaltoanalyysillä.`);
  const q = windPressure(env.windSpeed);
  const rho = env.waterDensity ?? 1025;

  const areas = (side) => side.map((b) => {
    const a = vesselWindArea(b.type, b.loa);
    if (a.extrapolated) warnings.push(`Veneen pituus ${b.loa} m on AS 3962 taulukon 4.4 (8–50 m) ulkopuolella – käytetty reuna-arvoa.`);
    return a;
  });
  const A = areas(berths.sideA || []), B = areas(berths.sideB || []);
  const sumHead = (arr) => arr.reduce((s, a) => s + a.head, 0);
  const rowBeam = (arr) => arr.reduce((s, a, i) => s + a.beam * (rowSh[i] ?? rowSh.at(-1)), 0);

  // --- Poikittainen (tuuli/aalto kohtisuoraan ponttonia vastaan), veneet keula/perä tuuleen
  const cdHead = Math.max(cd.vesselBow, cd.vesselStern);
  const windPerp = (windward, lee) => q * cdHead * (sumHead(windward) + leeward * sumHead(lee))
                                    + q * cd.rectangular * pontoon.length * pontoon.freeboard;
  const waveLL = Math.max(env.waveLineLoad ?? 0, waveMin);
  const wavePerp = waveLL * pontoon.length;
  const curPerp = currentPressure(rho, CURRENT_CD.pontoon, env.currentSpeed ?? 0) * pontoon.length * pontoon.draft;

  // --- Pitkittäinen (tuuli ponttonin suuntaan), veneet kylki tuuleen riveissä
  const windPar = q * cd.vesselBeam * (rowBeam(A) + rowBeam(B))
                + q * cd.rectangular * pontoon.width * pontoon.freeboard;
  const wavePar = waveLL * pontoon.width;
  const curPar = currentPressure(rho, CURRENT_CD.pontoon, env.currentSpeed ?? 0) * pontoon.width * pontoon.draft;

  const uls = (w, c, wa, extra = 0) => w + 1.5 * c + 1.5 * wa + extra; // AS 3962 4.2(b)
  const extra = env.extraStatic_kN ?? 0;

  // suunta = voiman suunta ponttoniin (yksikkövektori paikallisessa koordinaatistossa, x = pituusakseli)
  const cases = [
    { id: 'perp+', dir: [0, 1],  wind: windPerp(B, A), current: curPerp, wave: wavePerp }, // tuuli B-puolelta → voima +y
    { id: 'perp-', dir: [0, -1], wind: windPerp(A, B), current: curPerp, wave: wavePerp },
    { id: 'par+',  dir: [1, 0],  wind: windPar, current: curPar, wave: wavePar },
    { id: 'par-',  dir: [-1, 0], wind: windPar, current: curPar, wave: wavePar },
  ].map((c) => ({ ...c, F_uls: uls(c.wind, c.current, c.wave, extra) }));

  let ice = null;
  if (env.iceLineLoad > 0) {
    ice = { F_perp: env.iceLineLoad * pontoon.length, F_par: env.iceLineLoad * pontoon.width };
    warnings.push('Jääkuorma annettu: painoankkurit eivät yleensä kestä mitoittavaa jääkuormaa – vaatii erillisen tarkastelun (RIL 201-3-2013).');
  }
  return { q, cases, ice, warnings };
}

// ---------------------------------------------------------------------------
// 4. Kuorman jako ankkurilinjoille
// ---------------------------------------------------------------------------
// leg.dirDeg = linjan suunta ponttonista ankkuria kohti, paikallinen koord. (0° = +x, 90° = +y)
// Aktiivinen linja vastustaa kuormaa, kun u·d < 0 (ankkuri on kuorman vastakkaisella puolella).
// Oletus: aktiivisten linjojen vaakajännitys on yhtä suuri (ei jäykkyysjakoa, ei momenttia).
export function distributeToLegs(F, dir, legs, unevenFactor = 1.0) {
  const proj = legs.map((leg) => {
    const r = leg.dirDeg * Math.PI / 180;
    return Math.cos(r) * dir[0] + Math.sin(r) * dir[1];
  });
  const active = proj.map((p) => p < -1e-6);
  const sum = proj.reduce((s, p, i) => s + (active[i] ? -p : 0), 0);
  if (sum <= 0) return { ok: false, error: 'Mikään ankkurilinja ei vastusta tätä kuormasuuntaa.', Th: legs.map(() => 0) };
  const Th = proj.map((p, i) => (active[i] ? (F * unevenFactor) / sum : 0));
  return { ok: true, Th, active };
}

// ---------------------------------------------------------------------------
// 5. Ketjukäyrä (venymätön, staattinen)
// ---------------------------------------------------------------------------
// Th [kN] vaakavoima, w [kN/m] ketjun paino vedessä, h [m] korkeusero ankkurisilmukasta
// ponttonin kiinnityspisteeseen, L [m] ketjun pituus.
export function catenary(Th, w, h, L) {
  if (L <= h) return { ok: false, error: 'Ketju lyhyempi kuin korkeusero.' };
  if (Th <= 1e-9) return { ok: true, touchdown: true, onSeabed: L - h, X: L - h, Tfair: w * h, Tanchor: 0, Vanchor: 0, upliftDeg: 0 };
  const a = Th / w;
  const ls = Math.sqrt(h * (h + 2 * a));           // riippuva pituus kosketuspisteeseen
  if (L >= ls) {
    const xs = a * Math.acosh(1 + h / a);
    return { ok: true, touchdown: true, onSeabed: L - ls, X: (L - ls) + xs,
             Tfair: Th + w * h, Tanchor: Th, Vanchor: 0, upliftDeg: 0 };
  }
  // Kokonaan riippuva: L² − h² = (2a sinh(X/2a))²
  const X = bisect((x) => (2 * a * Math.sinh(x / (2 * a))) ** 2 - (L * L - h * h), 1e-9, L);
  const x1 = bisect((x) => a * (Math.cosh((x + X) / a) - Math.cosh(x / a)) - h, -50 * L, 50 * L);
  const Vanchor = Math.max(0, Th * Math.sinh(x1 / a));
  return { ok: true, touchdown: false, onSeabed: 0, X,
           Tfair: Th * Math.cosh((x1 + X) / a), Tanchor: Th * Math.cosh(x1 / a),
           Vanchor, upliftDeg: Math.atan2(Vanchor, Th) * 180 / Math.PI };
}

// Ketjun paino. Käytä ensisijaisesti valmistajan kg/m-arvoa (chain.kgPerM).
// Varalla: hahlokettinki ilman välitukea ≈ 0.0219·d² kg/m (d mm) – LIKIARVO.
export function chainWeight(chain, waterDensity = 1025) {
  const dry = chain.kgPerM ?? 0.0219 * chain.d_mm ** 2;
  const sub = dry * (1 - waterDensity / 7850);
  return { dryKgPerM: dry, w_kNperM: sub * G / 1000, estimated: chain.kgPerM == null };
}

// ---------------------------------------------------------------------------
// 6. Betoniankkurin kapasiteetti
// ---------------------------------------------------------------------------
export function submergedWeight_kN(massDryKg, rhoConcrete = 2400, rhoWater = 1025) {
  return massDryKg * G * (1 - rhoWater / rhoConcrete) / 1000;
}

// Kitkamalli (kitkamaa): Fh = (W' − Fv)·μ ; kalteva pohja (kuorma vetää alamäkeen, β):
// Fh = W'(μ cosβ − sinβ) − Fv·μ   (→ 0 kun tanβ = μ)
export function anchorCapacityFriction(Wsub, Fv, mu, slopeDeg = 0) {
  const b = slopeDeg * Math.PI / 180;
  return Math.max(0, Wsub * (mu * Math.cos(b) - Math.sin(b)) - Fv * mu);
}

// Koheesiomalli (NCEL, PNNL 2009 liite A-1): Fh = Su_z·A + (2·Su_a·z + ½·γb·z²)·B
// Su_z [kPa] leikkauslujuus ankkurin pohjan tasolla, Su_a keskiarvo 0…z, A pohjan ala [m²],
// B leveys kuormaa vastaan [m], z upotus [m], γb maan tehokas tilavuuspaino [kN/m³]
export function anchorCapacityCohesive({ Su_z, Su_a, A, B, z, gammaB }) {
  return Su_z * A + (2 * Su_a * z + 0.5 * gammaB * z * z) * B;
}

export function requiredAnchorMassFriction(Th, Fv, mu, FoS, rhoConcrete = 2400, rhoWater = 1025, slopeDeg = 0) {
  const b = slopeDeg * Math.PI / 180;
  const eff = mu * Math.cos(b) - Math.sin(b);
  if (eff <= 0) return Infinity;
  const Wreq = (FoS * Th + Fv * mu) / eff;            // kN (vedenalainen)
  return Wreq * 1000 / G / (1 - rhoWater / rhoConcrete); // kg kuivapaino
}

// ---------------------------------------------------------------------------
// 7. Koko tarkastus
// ---------------------------------------------------------------------------
export const DEFAULTS = {
  FoS_chain: 3.0,       // ks. spec 6.3
  FoS_anchor: 1.5,      // ks. spec 6.3 (API RP 2SK offshore: 1.8)
  unevenFactor: 1.0,
  rhoConcrete: 2400,
  waterDensity: 1025,
};

// input = { pontoon, berths, env, legs:[{id, dirDeg, chain:{d_mm,kgPerM,MBL_kN,length_m}, anchor:{massDryKg, seabed, slopeDeg, cohesive?}, h_LW, h_HW}], opts }
export function checkAnchoring(input) {
  const o = { ...DEFAULTS, ...(input.opts || {}) };
  const loads = environmentalLoads(input.pontoon, input.berths, input.env, input.opts);
  const warnings = [...loads.warnings];
  const results = input.legs.map((leg) => ({ id: leg.id, governing: null, cases: [] }));

  for (const c of loads.cases) {
    const dist = distributeToLegs(c.F_uls, c.dir, input.legs, o.unevenFactor);
    if (!dist.ok) { warnings.push(`${c.id}: ${dist.error}`); continue; }
    input.legs.forEach((leg, i) => {
      const Th = dist.Th[i];
      if (Th <= 0) return;
      const cw = chainWeight(leg.chain, o.waterDensity);
      for (const [wl, h] of [['LW', leg.h_LW], ['HW', leg.h_HW]]) {
        const cat = catenary(Th, cw.w_kNperM, h, leg.chain.length_m);
        if (!cat.ok) { warnings.push(`${leg.id} ${c.id} ${wl}: ${cat.error}`); continue; }
        const Wsub = submergedWeight_kN(leg.anchor.massDryKg, o.rhoConcrete, o.waterDensity);
        const sb = SEABED_FRICTION[leg.anchor.seabed];
        let cap;
        if (leg.anchor.cohesive) cap = anchorCapacityCohesive(leg.anchor.cohesive);
        else if (sb?.mu) cap = anchorCapacityFriction(Wsub, cat.Vanchor, sb.mu, leg.anchor.slopeDeg ?? 0);
        else { cap = NaN; warnings.push(`${leg.id}: pohjatyypille "${leg.anchor.seabed}" ei ole kitkamallia – anna koheesioparametrit.`); }
        // Upotus/imu/koevetotulos: käyttäjän dokumentoima kerroin (oletus 1.0 = pelkkä kitka, alaraja-arvio)
        const cf = leg.anchor.capacityFactor ?? 1.0;
        if (cf !== 1.0 && !leg.anchor.capacityFactorSource) warnings.push(`${leg.id}: capacityFactor ${cf} ilman perustetta (capacityFactorSource).`);
        cap *= cf;
        const r = {
          case: c.id, waterLevel: wl, Th, ...cat,
          chainFoS: leg.chain.MBL_kN / Math.max(cat.Tfair, cat.Tanchor),
          anchorCapacity: cap, anchorFoS: cap / Th,
          anchorMassReq: sb?.mu ? requiredAnchorMassFriction(Th, cat.Vanchor, sb.mu, o.FoS_anchor, o.rhoConcrete, o.waterDensity, leg.anchor.slopeDeg ?? 0) : NaN,
        };
        r.chainOK = r.chainFoS >= o.FoS_chain;
        r.anchorOK = r.anchorFoS >= o.FoS_anchor;
        results[i].cases.push(r);
      }
    });
  }
  for (const res of results) {
    res.governing = res.cases.reduce((g, r) => (!g || r.anchorFoS < g.anchorFoS ? r : g), null);
  }
  return { loads, results, warnings: [...warnings, ...ruleChecks(input)] };
}

// ---------------------------------------------------------------------------
// 8. Käytännön minimisäännöt (varoituksia, ei laskentaa)
// ---------------------------------------------------------------------------
export function ruleChecks(input, preset = input.opts?.preset) {
  const w = [];
  const legs = input.legs;
  for (const leg of legs) {
    const ratio = leg.chain.length_m / leg.h_HW;
    if (ratio < 4) w.push(`${leg.id}: ketju ${ratio.toFixed(1)} × syvyys (HW) < 4 (SF Marina alkuoletus ≈ 4 × syvyys HAT).`);
    else if (ratio < 5) w.push(`${leg.id}: ketju ${ratio.toFixed(1)} × syvyys (HW) < 5 (FCG 2022 / Top Marine: ≥ 5 × syvyys).`);
  }
  if (legs.length < 4) w.push(`Ankkurointipisteitä ${legs.length} < 4 / ponttoni (FCG 2022).`);
  if (preset === 'FCG_wave_attenuator') {
    const totalMass = legs.reduce((s, l) => s + l.anchor.massDryKg, 0);
    const perM = totalMass / input.pontoon.length;
    if (perM < 850) w.push(`Ankkuripainoa ${perM.toFixed(0)} kg/m < 850 kg/m (FCG 2022 aallonvaimennin; kuiva/vedenalainen ei määritelty lähteessä).`);
    for (const leg of legs) {
      if (leg.chain.d_mm < 28 || leg.chain.MBL_kN < 300) w.push(`${leg.id}: ketju < Ø28 mm / 300 kN (FCG 2022 aallonvaimennin).`);
    }
  }
  if (input.env?.winterInWater) {
    w.push('Talvikäyttö: sijoita laituri rannan jäänmurtumislinjan ulkopuolelle; kevytponttonit nostetaan talveksi (Båtunionen Hamnhandboken 2016). Jääkuormat erikseen (RIL 201-3-2013).');
  }
  return w;
}
```

---

## Liite B – hyväksymistestit

Kaikki arvot on laskettu liitteen A koodilla (Node 22). Toleranssi on ±1 %.

**Yhteiset syötteet:** ponttoni `length 20, width 2.4, freeboard 0.5, draft 0.4`. Kummallakin puolella 5 × `{loa:10, type:'motor'}`. `env = {windSpeed:25, waveLineLoad:0, currentSpeed:0, waterDensity:1025}`. Oletusasetukset.

**Testi 1 – kuormat** (`environmentalLoads`)
| Tapaus | wind kN | wave kN | F_ULS kN |
|---|---|---|---|
| qz | 0.375 kPa | | |
| perp± | 24.83 | 40.00 | 84.83 |
| par± | 44.46 | 4.80 | 51.66 |

**Testi 2 – ketjukäyrä** (`catenary`, ketju d = 22 mm ilman kg/m-arvoa → 10.60 kg/m kuiva, w = 0.09040 kN/m, h = 6 m)
| Th kN | L m | Tila | pohjassa m | X m | T_fair kN | Fv kN | kulma ° |
|---|---|---|---|---|---|---|---|
| 2 | 30 | pohjassa | 12.64 | 28.58 | 2.54 | 0 | 0 |
| 5 | 30 | pohjassa | 3.55 | 29.08 | 5.54 | 0 | 0 |
| 10 | 30 | riippuu | 0 | 29.31 | 10.57 | 0.70 | 4.02 |
| 26.39 | 30 | riippuu | 0 | 29.38 | 27.24 | 4.04 | 8.70 |
| 26.39 | 18 | riippuu | 0 | 16.97 | 28.27 | 8.52 | 17.89 |
| 26.39 | 40 | riippuu | 0 | 39.52 | 27.02 | 2.20 | 4.78 |

**Testi 3 – ankkurin vaadittu kuivapaino** (`requiredAnchorMassFriction`, Th = 26.39 kN, Fv = 0, FoS = 1.5, ρc = 2400, ρw = 1025)
| Pohja | μ | m_dry,req kg |
|---|---|---|
| mediumClay | 0.30 | 23 477 |
| fineMediumSand | 0.45 | 15 652 |
| gravelCoarseSand | 0.55 | 12 806 |

Lisäksi `submergedWeight_kN(10000)` = 56.20 kN.

**Testi 4 – koko tarkastus, 4 kulmalinjaa** (`checkAnchoring`)
- Linjat: `A1 dirDeg 60, A2 120, B1 −60, B2 −120` (30° kohtisuorasta kohti päätyä).
- Ketju: `{d_mm:22, MBL_kN:300, length_m:30}`. Ankkuri: `{massDryKg:10000, seabed:'fineMediumSand'}`. `h_LW 5.5, h_HW 7.0`.
- Odotettu tulos jokaiselle linjalle: mitoittava tapaus `par±` HW, Th = 51.66, T_fair = 53.46, Fv = 11.04, ketjun varmuus = 5.61, kapasiteetti = 20.32 kN, ankkurin varmuus = 0.39 (punainen), m_req = 32 604 kg.
- Varoitukset: 4 × "ketju 4.3 × syvyys (HW) < 5".
- **Tulkinta:** pitkittäistapaus on mitoittava, koska 30° levitys antaa vain vähän pitkittäistä jäykkyyttä. Ohjelman pitää ehdottaa pitkittäisiä linjoja.

**Testi 5 – lisätään pitkittäiset linjat** (`C1 dirDeg 0, C2 180`, kaikki ketjut 35 m, muuten kuten testi 4)
| Linja | Mitoittava | Th | T_fair | Fv | Ketjun FoS | Kapasiteetti | Ankkurin FoS | m_req kg |
|---|---|---|---|---|---|---|---|---|
| A1, A2 | perp− HW | 48.97 | 50.33 | 8.42 | 5.96 | 21.50 | 0.44 | 30 544 |
| B1, B2 | perp+ HW | 48.97 | 50.33 | 8.42 | 5.96 | 21.50 | 0.44 | 30 544 |
| C1, C2 | par∓ HW | 25.83 | 26.73 | 3.70 | 11.22 | 23.63 | 0.91 | 15 978 |

`distributeToLegs(84.83, [0,1], legs)` → `[0, 0, 48.98, 48.98, 0, 0]`
`distributeToLegs(51.66, [1,0], legs)` → `[0, 25.83, 0, 25.83, 0, 25.83]`

**Huomio testituloksista (näytetään käyttäjälle dokumentaatiossa):** 10 tonnin ankkureilla ankkurin varmuus jää alle 1, kun käytetään pelkkää kitkaa ja AS 3962:n aallon vähimmäiskuormaa (2 kN/m). Käytännön hankkeissa (esim. Parainen) käytetään 10 t ankkureita, koska ne nojaavat upotukseen ja paikalliseen kokemukseen. Ohjelma ei saa piilottaa tätä eroa. Siksi luvun 5.5 varoitukset ovat pakollisia, ja `capacityFactor` sallitaan vain dokumentoidulla perusteella.
