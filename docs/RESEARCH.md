# Research: products, prices, anchoring and cost estimation

Background research for the product catalogue, the bill of materials (BOM), the anchoring
layer and the cost estimate. Collected 2026-11-14 from **public sources only** (owner
decision D15); the sources that could not be read in the first session were read in the
second session the same day (§9). Every number below is copied from the source named next to it; where a
value is an assumption of this project and not from a source, it says so.

> This research does not make the tool a design tool. Outputs stay a *preliminary
> geometric study* (SPEC §1). Nothing here is, or replaces, a check against RIL 201-3-2013,
> AS 3962 or any other standard.

---

## 1. Standards and guidelines

| Document | What it is | Availability to this project |
|---|---|---|
| **RIL 201-3-2013** *Suunnitteluperusteet ja rakenteiden kuormat. Vesirakenteet* | Finnish Association of Civil Engineers' guideline on design bases and loads for water structures; 75 pages, Finnish. Part of the Eurocode-based RIL 201 series. | **Paid, not available.** 70 € in RIL's 2026 price list ([RIL hinnasto 2026](https://ril.fi/wp-content/uploads/2026/01/Hinnasto_2026_-numerojarjestys.pdf); [Ellibs record](https://www.ellibslibrary.com/en/book/9789517585798)). No public summary of its numeric content was found. |
| **AS 3962:2020** *Marina design* (supersedes AS 3962-2001 *Guidelines for design of marinas*) | Australian standard for marinas for vessels up to 50 m: fixed berths, floating pontoon systems, wave attenuators. | **Paid, not available** ([Standards Australia](https://store.standards.org.au/product/as-3962-2020)). Copies of the 2001 and 2020 editions circulate on file-sharing and personal sites; they carry licence headers and appear to be unauthorised, so they were **not used** at first. On 2026-11-15 the owner supplied a copy of the 2001 edition and asked that it be used (DECISIONS D42); see §11. |
| Indian Ministry of Ports, Shipping and Waterways, *Guidelines for Floating Jetties / Platforms for Marinas* | Public government guideline that refers to AS 3962:2020. | Public PDF ([shipmin.gov.in](https://shipmin.gov.in/sites/default/files/finalversinGuidelines.pdf)); only search excerpts could be read from this session (see §8). |
| UFC 4-152-07 *Design: Small Craft Berthing Facilities* (US DoD, 2009, Change 1 2012) | Public-domain design criteria for small-craft marinas incl. floating docks. | **Read** (Change 1, [WBDG file](https://www.wbdg.org/api/documents/media/b60e64cd-d255-4e98-9463-9658a772eabe/file), 2026-11-14), §9.1. WBDG lists a revision dated 2026-09-30 that moves the load calculation to a separate UFS 4-152-07 (not read; per WBDG's change summary). |
| UFC 4-159-03 *Moorings* (US DoD, 2020) | Mooring design criteria (ships and fleet moorings). | **Read** ([WBDG file](https://www.wbdg.org/api/documents/media/83e8fe52-bb53-46af-9fde-fdb51092c4c0/file), 2026-11-14), §9.2. |
| California DBW *Layout and Design Guidelines for Marina Berthing Facilities* (2005) | Public US marina layout and design guideline. | **Read** ([parks.ca.gov](https://demo2.parks.ca.gov/pages/28702/files/Guide05.pdf), 2026-11-14), §9.3. |
| Chalmers bachelor's thesis (2026), *Development of a Mooring Calculation Model for Pontoons: Preliminary Dimensioning of Mooring Chains and Concrete Anchors* (Aliprantis, Jarlgren; for SF Marina) | Open-access thesis that builds exactly the kind of preliminary chain/anchor sizing model needed here. | **Read** ([record](https://odr.chalmers.se/items/45ca2ffd-b68f-4e8e-ae23-56df9091c482/full), [PDF](https://odr.chalmers.se/server/api/core/bitstreams/8823a8b8-5646-4f38-a096-53286caf0a8b/content), 2026-11-14), §9.4. A bachelor's thesis: practice figures are SF Marina staff's statements quoted in it. |
| Sound & Sea Technology, *Advanced Anchoring and Mooring Study* (2009, for Oregon Wave Energy Trust) | Public study with design procedures for deadweight, drag, pile and plate anchors (Appendix A). | **Read** ([Tethys/PNNL](https://tethys.pnnl.gov/sites/default/files/publications/Advanced-Anchor-and-Mooring-Study.pdf), 2026-11-14), §9.5. |
| NAVFAC *Handbook for Marine Geotechnical Engineering* (SP-2209-OCN, 2012) | Referred to by UFC 4-159-03 for deadweight anchors ("Use carefully … Section 4.6"). | Not read: the DTIC server ([ADA556807](https://apps.dtic.mil/sti/pdfs/ADA556807.pdf)) answered "The request is blocked." |
| Finnish wind-load national choices for SFS-EN 1991-1-4 (YM decree 7/16) | National annex values (basic wind velocity). | [Finlex](https://www.finlex.fi/fi/viranomaiset/maarayskokoelmat/ymparistoministerio/2016/42812); only the predecessor's value was seen in a search excerpt: *"Merialueet: avomeri, harva ulkosaaristo v<sub>b,0</sub> = 22 m/s"* ([YM 2007 eurokoodiasetus](https://ym.fi/documents/1410903/155128351/eurokoodiasetus+15102007.pdf)). |

**What the public material does say about the method** (search excerpts, to be confirmed
against the full documents):

- AS 3962-2001 based wind loads on boats and marinas on a *steady* wind (30-second
  duration), not gusts; AS 3962:2020 uses a 1-in-50-year return period for strength
  limit-state wind, wave, surge and flood loads (as quoted by the Indian guideline).
- UFC 4-152-07: wind load is a steady velocity pressure on the above-water profile of the
  berthed boats and the dock; for the dock as a whole, **full load on the windward
  (unshielded) boats and 20 % of it on the leeward boats**; individual fingers for the full
  load; anchor loads of floating docks are usually governed by horizontal loads; current
  over 3 ft/s (1 m/s) needs a rational analysis; minimum freeboard 10 in (25 cm) under dead
  plus live load.
- Indian guideline: chain moorings are preferred where there are waves (the catenary
  absorbs the forces without snatching), but need adjustment from time to time; flotation
  factor at least 1.5.

**Consequence for the tool.** The anchoring layer uses a transparent textbook method
(§5) whose every factor is a visible, editable parameter, labelled either with its public
source or as *assumption*. The tool lists which items need verification against
RIL 201-3-2013 / AS 3962 by a qualified engineer. It never states compliance.

---

## 2. Suppliers and products

Prices are copied as published. **VAT:** A-Laiturit and Top Marine state that prices
include VAT (A-Laiturit: 25.5 %); the catalogue converts them to VAT 0 % by dividing by
1.255 (owner decision D18). Suomen Laatulaituri does not state VAT status; its prices are
treated as VAT-inclusive (assumption, flagged in the catalogue).

### 2.1 Marinetek (Helsinki) — concrete pontoons, no public prices

Source: [marinetek.net/products](https://marinetek.net/products/), read 2026-11-14.
"Width" = width with fenders / concrete width.

| Model | Width (m) | Height (m) | Weight | Net capacity | Freeboard (m) | Joint |
|---|---|---|---|---|---|---|
| 2400AC (All-Concrete) | 2.4 / 2.2 | 0.85 | 0.79 t/m | 4.7 kN/m² | 0.47 | 2×180 kN |
| 2600AC | 2.6 / 2.4 | 0.85 | 0.84 t/m | 4.7 kN/m² | 0.47 | 2×180 kN |
| 3000AC | 3.0 / 2.8 | 0.85 | 0.91 t/m | 5.0 kN/m² | 0.50 | 2×180 kN |
| 2700HD (Heavy Duty) | 2.7 / 2.4 | 0.85 | 0.90 t/m | 4.7 kN/m² | 0.47 | 2×322 kN |
| 3300HD | 3.3 / 3.0 | 0.85 | 1.02 t/m | 5.0 kN/m² | 0.50 | 2×322 kN |
| 4300HD | 4.3 / 4.0 | 0.85 | 1.30 t/m | 5.0 kN/m² | 0.50 | 2×322 kN |
| 3300BR (Breakwater) | 3.3 / 3.0 | 1.0 | 1.29 t/m | 5.5 kN/m² | 0.55 | 2×703 kN |
| 3800BR | 3.8 / 3.5 | 1.2 | 1.96 t/m | 6.2 kN/m² | 0.62 | 2×812 kN |
| System 241 (timber frame) | 2.5 / 2.4 | 0.86 | 0.25 t/m | 1.00 kN/m² | 0.52 | rubber bolt |
| System 300 | 3.1 / 3.0 | 0.86–0.87 | 0.38 t/m | 1.00 kN/m² | 0.56 | rubber bolt |

Other published facts: All-Concrete and Heavy Duty units "8–20 ton", "50 year design
lifetime"; anchoring by "Seaflex …, chain and pile mooring"; access bridges "4–12 m
lengths and widths of 1.2–1.9 m"; mooring fingers "standard lengths range from 6 to 18 m"
(steel or aluminium); boat booms "4.5–8 m long". Prices are not published. The six
Marinetek catalogue PDFs on NauticExpo returned HTTP 403. **Module lengths, finger and boom
models, sinkers, bridges, fittings and pile guides** are in the brochures on
[marinetek.hr](https://www.marinetek.hr/en/brochures-and-specifications/), read 2026-11-15
(§9.12).

### 2.2 A-Laiturit Oy (Raisio) — full public price list

Source: [a-laiturit.fi](https://www.a-laiturit.fi/), category pages read 2026-11-14.
"Hinnat sisältävät alv 25,5 %". Pontoon base price = "ponttoni ilman lisävarusteita ja
puukantta" (pontoon without accessories or timber deck), 2-year warranty.

Heavy concrete **MX** (made to order) — L × W m, freeboard cm, weight t, capacity t, price € incl. VAT:

| Model | L×W | Freeb. | Weight | Cap. | Price |
|---|---|---|---|---|---|
| MX8-2,4 | 8 × 2.4 | 45 | 9.84 | 8.54 | 10 960 |
| MX8-3 | 8 × 3 | 49 | 11.44 | 11.54 | 12 120 |
| MX10-2,4 | 10 × 2.4 | 49 | 11.62 | 11.55 | 13 080 |
| MX10-3 | 10 × 3 | 53 | 13.48 | 15.49 | 14 400 |
| MX12-2,4 | 12 × 2.4 | 48 | 14.34 | 13.61 | 15 630 |
| MX12-3 | 12 × 3 | 52 | 16.63 | 18.32 | 17 490 |
| MX16-2,4 | 16 × 2.4 | 50 | 19.84 | 18.79 | 21 640 |
| MX16-3 | 16 × 3 | 53 | 22.76 | 25.27 | 24 400 |
| MX20-3 | 20 × 3 | 54 | 27.79 | 32.25 | 29 590 |
| MX20-4 | 20 × 4 | 57 | 34.28 | 45.64 | 38 690 |

(also 3.5 m and 4 m widths; medium **MS**, light **S** and plastic **K** series — all in
the catalogue file.) The light S page: *"eivät ole tarkoitettu kaikkein vaativimpiin
myrsky- ja jääolosuhteisiin"*.

Anchoring items (€ incl. VAT): concrete anchors 400 kg 130,00; 800 kg 193,00; 1600 kg
357,00; 2400 kg 555,00; 3200 kg 781,00. Long-link chain per metre: 8 mm 11,50; 10 mm 14,50;
13 mm 20,90; **16 mm G40 27,80; 20 mm G40 41,00** — 20 mm product page: *"Laatuluokitus
DIN 763 Grade 40 (erityiskova). Kettinki on vetotestattu Suomessa."* and *"Isojen
laitureiden ja poijujen ankkuroinnissa tulisi käyttää vain Grade 40 -kettinkiä"*.
Shackles (graded, KZN): 13 mm 14,20; 16 mm 17,30; 20 mm 20,40; 22 mm locking 49,60.
Steel spring links: 10 mm 60,80; 14 mm 169,00; 18 mm 360,00. Chain zinc anodes 53,80–63,90.
Gangways: 3.5 × 0.8 m 407,00; 4.8 × 1.2 m 649,00; arched 4.8 × 1.2 m 1 220,00. Cleats
5,20–250,00; mooring rings 11,20–36,50. Anchoring kit 099400 (1 420,00 €, "mökkilaitureille"):
*"betoniankkurit 800kg (2kpl), teräsjoustin 10mm (2kpl), kettinki 13mm (2 x 15m + 2 x 7,5m),
sakkeli 16mm (12kpl), ankkurointikorvakesarja"*.

### 2.3 Top Marine Laiturit (topmarinelaiturit.fi) — public price list

Source: [hinnasto](https://topmarinelaiturit.fi/hinnasto/),
[betoniponttonilaiturit](https://topmarinelaiturit.fi/laiturit/betoniponttonilaiturit/),
[raskasponttonilaiturit](https://topmarinelaiturit.fi/laiturit/raskasponttonilaiturit/),
[ankkurointi](https://topmarinelaiturit.fi/laituritarvikkeet/ankkurointi/),
[venepuomit](https://topmarinelaiturit.fi/laituritarvikkeet/venepuomit/),
[käveltävät venepuomit](https://topmarinelaiturit.fi/laituritarvikkeet/kaveltavat-venepuomit/).
*"Kaikki hinnat sisältävät arvonlisäveron"*, *"Hinnat eivät sisällä asennuskuluja."*
Part of the price list page was only available as a machine summary in the first session;
those rows were checked verbatim on the page in the third session (2026-11-14, §9.10).

- Heavy pontoons (pontoon price without the 717 € gangway, € incl. VAT): MDP 2,4×9 m
  7 813 (8,3 t capacity, 9,4 t weight, deck 0,4 m); MDP 2,4×12 m 10 037; MDP 2,4×15 m 12 213
  (16,3 t / 13,9 t / 0,46 m, price list page); HD 2,4×12 m 12 120
  (15,0 t / 15,0 t / 0,54 m); HD 2,4×15 m 14 886 (19,8 t / 17,9 t / 0,56 m). HD: allowed wave
  height 0,5 m, current 1 m/s, boats up to 24 m; MD: wave 0,3 m. HD 3,0 × 9 / 12 / 15 m:
  11 126 / 14 532 / 17 790 € (13,7 / 20,1 / 26,3 t capacity, 13,8 / 17,3 / 20,7 t weight,
  deck 0,53 / 0,57 / 0,6 m).
  *"Jäätyminen on sallittua, jään liikkuminen ei"* (freezing allowed, moving ice not).
  Anchoring for HD: chain 20–22 mm, concrete anchors 2000–3000 kg.
- Finger booms ("venepuomit", height above water 0,5 m): 4 m 595; 5 m 628; 6 m 665; 7 m 730;
  8 m 1 125; 9 m 1 202; 10 m 1 436 (with walking deck 874–2 297). Walkable booms 0,7 m
  wide, 1,0 kN/m²: 6 m 2 492; 7 m 2 691; 8 m 3 298; 9 m 3 484; 10,5 m 5 921; 12 m 6 428.
- Anchoring packages: 2 × 1000 kg + 16 mm chain 20 m + 4 × 20 mm shackles = 870 €
  (components 542 + 300 + 28); 2 × 2000 kg + 20 mm 30 m + 4 × 25 mm = 1 574 €;
  2 × 3000 kg + 20 mm 40 m = 2 070 €.
- Gangway 1,2 × 5 m 717 €; shore abutments (maatuki) 487–828 €; power pedestals
  RM Platinum 2/4/6 × 16 A + water 1 416 / 1 581 / 1 717 €; *"Turvaporras"* 382 €; swimming
  ladders 301–766 € (checked verbatim 2026-11-14).
- The price list page (read 2026-11-14) words the MD package differently from the anchoring
  page used above: *"MD Massiiviponttonilaiturin ankkurointipaketti- betonipaino 2x1000kg,
  kettinki 16mm, sakkeli20 mm. 1574 €"* — the same contents as the 870 € package at a higher
  price, so one of the two pages is probably in error. The catalogue keeps the component
  prices of the anchoring page.
- Rules of thumb on the same site **conflict**: chain length *"viisi kertaa veden syvyyden
  verran"* ([syvyysmittaus](https://topmarinelaiturit.fi/hyodyllista/laiturin-ankkurointi-syvyysmittaus/))
  versus about twice the depth ([ponttonilaituri-tieto](https://topmarinelaiturit.fi/hyodyllista/ponttonilaituri-tieto/)).
  Neither is used as a design rule here.

### 2.4 Suomen Laatulaituri (laatulaituri.fi)

Source: collections [betoniponttonit](https://laatulaituri.fi/collections/betoniponttonit),
[ketjut](https://laatulaituri.fi/collections/ketjut),
[painot](https://laatulaituri.fi/collections/painot),
[käyntisillat](https://laatulaituri.fi/collections/kayntisillat). VAT not stated.

- Chain (*"DIN 763 (5685C) -standardin mukainen kuumasinkitty pitkähahlokettinki"*),
  €/m, breaking strength, kg/m: 10 mm 11,90 / n. 4 t / 1,75; 13 mm 15,90 / n. 6,3 t / 3,1;
  16 mm 18,90 / n. 10 t / 4,5; 20 mm 20,90 / n. 16 t / 7; 22 mm 28,90 / n. 19 t / 8,8.
  (The €/m unit is printed only on the 10 mm item.)
- Concrete weights: 500 kg 195; 800 kg 270; 1000 kg 295; 1200 kg 335; 1500 kg 395;
  2000 kg 485; 2400 kg 550; 3000 kg 729 €.
- Heavy concrete pontoons: 6×2,4 m 4 750; 6×3 m 5 500; 9×2,4 m 6 850; 9×3 m 7 950;
  12×2,4 m 9 800 (6,6 t capacity, n. 8,5 t); 12×3 m 11 200 €.
- Gangways: timber 5×1,2 m 890; 6×1,2 m 1 050; 8×1,2 m 1 550; aluminium 6×1,2 m 2 350;
  8×1,2 m 4 250; 10×1,2 m 5 450 €.

### 2.5 Suomen Laiturikauppa Oy (Turku/Vehmaa)

Source: [suomenlaiturikauppa.fi](https://suomenlaiturikauppa.fi/) and its brochure PDF
(`slk_esite2024_uusi.pdf`). The web shop has no product prices; one offer: *"Medium 6m x
2.4m ovh. 14 500 €, nyt 11 000 €"* (VAT not stated). The brochure lists chains 10–25 mm,
shackles 13–32 mm, concrete anchors 25–10 000 kg, rubber springs, aluminium anodes
(*"Alumiinianodi toimii selvästi paremmin Itämeren murtovedessä kuin ZN-anodi"*, anode
pairs about every 2 m or at both chain ends) and these **buoy** chain rules (p. 47):
*"Peräpoijun ketjunpituus (D) = veden syvyys (C) + 3 m"*, *"Ketjun pituus ahtaassa
satamassa (D) = veden syvyys (C) + 1 m"*, *"Ketjun pituus avomerellä (D) = veden syvyys (C)
x 3"*, *"Asennusetäisyys laiturista (A) = veneen pituus (B) + veden syvyys (C)"*.
The installation distance is used for stern-buoy berths (DECISIONS D35); the chain rules are
kept for comparison with Top Marine's (§9.13, I81): with 5.5 m at high water, depth + 3 m gives
8.5 m, Top Marine's depth × 2 (the owner's choice, D36) 11.0 m.

### 2.6 Savorak / Lip-Lap

Lip-Lap's site now redirects to savorak.fi. Neither could be read from this session
(§8). Retail listings show Savorak 16 mm chain 7,5 m at 194,80 € on offer
([Taloon](https://www.taloon.com/kettinki-savorak-16-mm-7-5-m)) and a 680 kg weight
anchoring kit at 1 090 € ([K-Rauta](https://www.k-rauta.fi/tuote/savorak-painoankkurointipaketti-24-x-25-kg/6438606010163)).
Not used in the catalogue.

### 2.7 Chain grade — what to specify

- The suppliers above sell **hot-dip galvanised long-link chain to DIN 763**; A-Laiturit
  and Axxa sell sizes 16–20 mm as **Grade 40**. A-Laiturit recommends Grade 40 only for
  large piers. Axxa G40 16 mm: breaking strength 166 kN
  ([Netrauta](https://www.netrauta.fi/kettinki-axxa-g40-16mm-5m)). Laatulaituri's DIN 763
  figures are lower (16 mm "n. 10 t"), so **the grade must be part of the product row**:
  the catalogue stores diameter, grade, breaking load and kg/m per chain item, and the
  anchoring calculation chooses the chain by breaking load, not by diameter.
- General-purpose chain (e.g. K-Rauta 4×32×16 mm, 3,49 €/m, *"ei saa käyttää
  nostovälineissä"*) is **not** mooring chain. The catalogue must not contain it.

---

## 3. Labour and plant rates

| Item | Rate | Source |
|---|---|---|
| Commercial diving team (3 persons), equipment included | 180 € / h + VAT, minimum 8 h, plus travel and lodging; surface work 40 € / h | [Keski-Suomen Sukelluspalvelu](https://www.keskisuomensukelluspalvelu.fi/vedenalainen-rakentaminen.html) |
| Truck-mounted crane with operator, weekdays 07–17 | 108,00 € / h VAT 0 % | [Nostolavapalvelu](https://nostolavapalvelu.fi/hinnasto/) |
| Marine service work hour (2024) | 118 € / h incl. VAT 25,5 % (= 94,02 € VAT 0 %) | [Turun Venehuolto](https://tuv.fi/nosto-ja-tyoveloitushinnasto/) |

No public rate was found for a work boat or barge with crane, or for installation output
(hours per pontoon, per anchor). These are **assumptions** in the price file, marked as
such, for the user to replace with quotes.

**Benchmarks for checking the total (not used in the calculation):**
- Vaasa: *"Karkeasti voi arvioida, että yksi laituri maksaa noin 50 000 €. Vuosina 2011 –
  2014 toteutuneiden Vaasan kaupungin venesatamainvestointien aallonmurtajien ja laitureiden
  kustannuksien keskiarvo on 733 € / jm. Vastaavasti laitureiden hävityskustannukset ovat n.
  100 € / jm. (Järvinen 2015)."* And: the Gerby harbour extension of 2014 cost 568 000 €,
  *"siellä on venepaikkoja nyt 195 kpl. Yhden paikan hinnaksi tuli 2 900 €"* (total divided
  by all berths after the extension). VAT status not stated; price level 2011–2014, not
  indexed (the report notes the civil-engineering cost index fell 5.3 % 2015–6/2020)
  ([Vaasan kaupunki, Pienvenesatamatoiminnan selvitys 2020](https://www.vaasa.fi/app/uploads/2020/10/7d1d27ad-vaasan-kaupungin-pienvenesatamatoiminnan-jarjestamista-koskeva-selvitys-2020.pdf.pdf),
  read 2026-11-14). The figure 733 €/jm comes from a VAMK thesis (Petri Järvinen 2015,
  *Vaasan kaupungin pienvenesatamien inventointi ja kehittäminen*) that was not read.
- Helsinki procurements (VAT 0 %): pier renewals 2018, 1 277 500 €
  ([päätös](https://paatokset.hel.fi/fi/asia/hel-2018-010117/765c6ca3-7fb5-4f18-9436-6bfda174539c));
  Pyysaari pontoon renewal 2019, 61 800 €
  ([päätös](https://paatokset.hel.fi/fi/asia/hel-2019-008869/67819e85-e70a-433a-964d-9d4e84aa45cf)).
  Pier lengths were not read, so no €/m was derived.

---

## 4. Cost estimate method

Finnish practice distinguishes estimates by project stage: target-price estimates from
statistics (e.g. €/m or €/berth), building-element estimates (*rakennusosa-arvio*) and
quantity-based estimates (*määrälaskenta × yksikköhinta*, with labour from output rates,
*työmenekki*) ([e.g. Theseus thesis](https://www.theseus.fi/bitstream/handle/10024/34825/Haapalahti_Perttu.pdf?sequence=1)).

The tool already knows every quantity of a layout, so the most accurate method available
to it is a **quantity-based unit-price estimate**:

```
line cost  = quantity × (1 + waste margin of the item) × unit price (VAT 0 %)
labour     = Σ quantity × output rate (h/unit) × hourly rate of the crew/plant
subtotal   = materials + transport + labour + plant
total      = subtotal × (1 + site overheads %) × (1 + contingency %)
VAT        = total × 25,5 %   (shown separately)
```

Each line keeps its source and date so that the user can see how old a price is. Because
the layout is preliminary and several inputs are assumptions, the result is a
**feasibility-stage estimate**; AACE's classification (18R-97) gives such early estimates
wide accuracy ranges (secondary sources quote roughly −20…−50 % / +30…+100 % for Class 5
and −15…−30 % / +20…+50 % for Class 4; the primary document was not read). The tool shows
the estimate as a range and compares it with the €/jm benchmark above.

---

## 5. Anchoring — method used by the tool

The physics below is standard mechanics; the *values* of the factors are parameters. Each
parameter is shown with its source or marked **assumption**.

1. **Wind load on a pier** (UFC 4-152-07 C1 §6-3.4.1 and the sample calculation in its
   Fig. 6-5; DECISIONS I54). The boats of finger berths lie square to the pier, so
   - wind **across** the pier meets them **bow-on**:
     `F = q · C_d · (Σ_windward B·h + 0.2 · Σ_leeward B·h + f · max(0, L − Σ_windward B))`,
     where the last term is the pier face (freeboard f) not hidden by the windward boats
     (DBW 2005, commentary to C2.4.1: the dock face behind an upwind boat is in its "wind
     shadow"; Fig. 6-5 of the UFC leaves the headwalk face out of the perpendicular case);
   - wind **along** the pier meets them **broadside**: per row the first boat in full and
     the others at 20 %, `L_boat · h`, plus the pier's end area (UFC Fig. 6-5: "40' Boats
     Unshielded: 1 each … 40' Boats Shielded: 2 each … 3 PSF … Headwalk").
   - Profile height `h = 0.15 × berth length` (UFC §6-3.4.1.3: "generally taken as 15% of the
     berth length"); the tool uses the boat length of the class (in Fig. 6-5 40 ft boats lie in
     40 ft berths). 100 % occupancy (§6-3.4.1.4).
   - Pressure: `q · C_d = ½ · ρ_air · v² · C_d` with ρ_air = 1.25 kg/m³ and **C_d = 1.6**. UFC
     Fig. 6-4 ("Wind Load on Small Craft") converts the steady wind to pressure; read from the
     figure's vector data it is p = V²/240 psf with V in mph (15.0 psf at 60 mph, 60.0 psf at
     120 mph), i.e. 0.998 Pa per (m/s)², which equals ½ · 1.25 · v² · 1.6. The DBW minimum
     "not less than 15#/ft²" (718 Pa) is the same curve at 60 mph (26.8 m/s).
   - Design wind v: default 22 m/s (Finnish sea areas v<sub>b,0</sub>, YM 2007 search excerpt).
     The UFC asks for a steady wind "neglecting gusts"; Chalmers 2026 likewise used the
     10-minute mean reference wind at 10 m as the design wind. The value itself still needs
     checking against the current national annex.
   - *Earlier version (I47):* boats were loaded broadside by wind across the pier and bow-on by
     wind along it, with profile height 0.25 × length and C_d = 1.2. That overstated the
     across-pier load several times (DECISIONS I54).
2. **Current load** on the hulls: `F = ½ · ρ_w · v_c² · C_d · A_underwater`; default
   v_c = 0 (sheltered marina). UFC: above 1 m/s needs a rational analysis → warning.
3. **Anchor lines** (DECISIONS D25, I60): pairs of chains crossed under the pier at a spacing
   along it (**assumption**, editable; the crossing practice is described by suppliers but no
   spacing rule was found), each splayed by θ from square to the pier so that the chains also
   hold the wind along it. Splayed corner chains are SF Marina's typical layout (Chalmers 2026
   Fig. 4, θ = 12° in its reference case); the default **θ = 45°** is the owner's choice, from
   Savorak's instructions for a cottage-dock kit (*"ristiin pohjapainoihin, 45 asteen kulmassa"*,
   §9.11; weak source). The
   shore half of the pier is splayed towards the head, the head half towards the shore. Across
   the pier the lines of the loaded side share the load, `H = F / pairs / cos θ`; along it the
   lines splayed against the wind share it, `H = F / lines / sin θ`; each line takes the larger
   (both directions checked separately, UFC §6-3.4.1.4). Equal sharing is an **assumption**.
   **Tip anchoring** (D30, D31, I68, I72): two crossed chains at the head of each main pier;
   an **end pile** at the tip of each finger longer than 12 m (*"Longer than 12 m Super Yacht and
   Concrete Fingers are moored with end piles"*, Marinetek 2012, §9.12), sized for half the full
   broadside wind of the boats beside it (UFC 4-152-07 C1 §6-3.4.1.4, *"Individual fingers,
   however, should be designed to accommodate the full wind load on the berthed craft"*), with
   the smallest Marinetek pile guide (20/40/70 kN). DBW 2005 also recommends guide piles *"at the
   ends of all fingerfloats adjacent to channels"* (D2.1).
4. **Chain length and catenary**: chain length `L = max(h + 1 m, k · h)` with
   `h` = depth + high water and **`k = 4`**: "A common initial design assumption used by SF
   Marina is that the chain length is approximately four times the HAT water depth"
   (Chalmers 2026 §3.3, quoting SF Marina). For comparison: Top Marine 2 × and 5 × depth
   (conflicting), Suomen Laiturikauppa 3 × depth for buoys in open water, DBW 5:1 scope as an
   example for buoy moorings (C8.4.1). The catenary equations agree with Chalmers §4.3
   (after Ma et al. 2019).
   With `a = H / w`, `w = m·g·(1 − ρ_w/ρ_steel)`: if `L ≥ √(h² + 2·h·a)` part of the chain
   lies on the bottom and the anchor gets no uplift; otherwise the chain hangs between
   both ends: span `X = 2a · asinh(√(L² − h²) / 2a)`, uplift at the anchor
   `V = H · sinh(atanh(h/L) − X/2a)`, tension at the pontoon `T = √(H² + (V + wL)²)`.
   (A first version required the chain to lie on the bottom at the design load; that gave
   chains of about 80 m for a 30 m pier and was dropped, DECISIONS I48.)
5. **Chain choice**: smallest catalogue chain with breaking load
   `MBL · ((d − c)/d)² ≥ SF · T`. **SF = 3.0** on the new chain's breaking load: UFC 4-159-03
   (2020) Table 3-7, chain "for relatively straight lengths" 3.0 ("around bends" 4.0), "These
   factors of safety are for the new chain break strength". Because the factor is defined on
   the new chain, the corrosion/wear allowance c is **0 mm** by default (was 2 mm,
   assumption); it stays a parameter. Chalmers 2026 found the chain not governing (safety
   factor 7.7 in its reference case) and SF Marina's drawings using chains about 48 % larger
   than strength alone needs, for damping and robustness (§7.6).
6. **Concrete block**: submerged weight `W_sub ≥ SF_slide · (H / μ + V)`, mass
   `M = W_sub / (g · (1 − ρ_w/ρ_c))`, ρ_c = 2 400 kg/m³ ("Concrete weighs about 150 pounds per
   cubic foot out of water, but only about 90 pounds under water", DBW 2005 App. A p. 90;
   150 lb/ft³ = 2 403 kg/m³). μ by seabed: **sand 0.60** = smooth concrete on quartz sand,
   rough concrete 0.69 (Sound & Sea Technology 2009, Table 33; 0.63 was used in
   [Banuelos-Garcia et al. 2022](https://tethys-engineering.pnnl.gov/sites/default/files/publications/Banuelos-Garcia-et-al-2022.pdf));
   clay 0.3 and rock 0.5 remain **assumptions** (see §9.5 for the clay method);
   SF_slide = 1.5 (**assumption**; Sound & Sea Technology's anchor tables use FS = 1.5).
   The cheapest catalogue block with mass ≥ M and not heavier than the largest piece to be
   handled (default **3 000 kg**: "SF Marina commonly prefers anchors with a mass of
   approximately three tonnes or less", Chalmers 2026 §3.8) is chosen, otherwise several of
   that size. Chalmers notes that several anchors on one line do not necessarily hold as much
   as one anchor of the same mass.
   **Wedge anchors** (anchor type "wedge", DECISIONS I59): mass from the working capacities
   of the Enhanced Pearl Harbor anchor (Sound & Sea Technology 2009 Tables 35–36, §9.5),
   `SF_slide · H ≤ 1.5 · capacity(mass, seabed, angle)`; the chain is lengthened until the
   angle at the anchor is within 5° (clay) or 6° (sand). Not for rock.
9. **Comparison with practice.** Suppliers' standard packages: 2 × 1 000 kg and 16 mm chain
   per 8–12 m concrete pontoon, 2 × 2 000–3 000 kg and 20 mm chain for heavy pontoons (Top
   Marine); SF Marina's drawings: 2, 3, 6 and 10 t anchors, most often 2–3 t (Chalmers 2026
   §7.6, 174 anchor legs). With the first defaults (I47) the demo layouts needed about 21 t
   per lateral line on clay (4.5 t of anchors per metre of pier); with the UFC wind geometry
   and the sourced defaults (I54–I56) about 5.6 t per lateral line on clay and 3.0 t on sand
   (1.8 t/m and 1.2 t/m). What remains is mainly the anchor model: a plain block holding by
   friction versus embedded or wedge-shaped anchors (§9.5, DECISIONS I49). With the wedge
   anchor type (I59) the same layouts need about 0.6 t per lateral line on clay and 0.46 t on
   sand (0.23 and 0.18 t of anchors per metre of pier, including the axial lines), with chains
   of about 40 m and 37 m instead of 22 m. The two axial lines per pier head carried the largest
   loads (up to about 45 kN; I58). **With splayed lines (D25, θ = 45°)**, on the top alternative
   of each demo (15 piers, 1 698.5 m of pier): line loads 5.6–17.3 kN (median 8.8 kN, was 6.2 kN
   with up to 46.3 kN on the head lines); median anchor per line 8.3 t as blocks on clay, 4.4 t
   on sand, 0.9 t as wedges on clay and 0.7 t on sand; anchors per metre of pier 1.55, 0.83,
   0.17 and 0.13 t (before: 1.61, 0.86, 0.18, 0.13 t); wedge chains about 44 m (clay) and 40 m
   (sand). The total hardly changes; the peak loads at the heads are spread over all lines.
   **Against the reference drawing (DECISIONS D55, I102, 2026-11-16):** the owner's drawing of the
   Iisalmi breakwater (100 m of 20 m pontoons, 20 chains at about 45°, anchors of 3 200 kg, 22 mm
   Grade 40 chains of 30 m; design data not available, D56) modelled as a 99.5 m pier of five
   19.90 m modules gives the same 20 chains. Largest anchor per chain on clay at an assumed design
   depth of 4 m: plain blocks 3.55 t for wind alone, 29.9 t with the AS 3962 minimum wave load of
   2 kN/m across; wedges 0.39 t and 3.26 t. The drawing's anchors are thus of the order of plain
   blocks under wind alone, or of anchors that dig in under the wave load. The anchoring plan shows
   both anchor types since this step.
   **Wave load from the waves (D59, I104):** with Meri (44 × 20 m, 257 t; owner) the friction model
   with 2 kN/m gives 0.97–1.65 × the installed anchors on the long face, so the model holds for an
   exposed site; the wave load now follows the 50-year Hm0 (none up to 0.3 m, UFC 4-152-07
   6-3.4.7.2; the full 2 kN/m from 0.6 m, AS 3962 Table 4.2 and 4.8.2.3; Hm0² between, assumption).
   The Iisalmi-type case then gives 3.55 t per chain for Hm0 ≤ 0.3 m (1.1 × the drawing) and
   29.9 t from 0.6 m.
10. **Stern buoys (D36, D37, I78–I85).** One sinker per buoy, straight below it, from Svenska
   Båtunionen's table by boat displacement (default; §9.14), Top Marine's table (§9.13) or factor
   × boat weight; one row up in an exposed harbour; chain max(1.41 × design depth, depth at high
   water + 0.8 m), at least the table's size, MBL ≥ SF × top tension under the boat's stern-on
   wind. On the demos (clay, default classes) Båtunionen gives 514–2 057 kg per buoy, Top Marine
   500–1 000 kg, the friction method 963–4 063 kg (short, steep chain) and 3 × boat weight
   3 800–24 700 kg.
7. **Ice**: pontoons that stay in the water over winter (owner decision D17) get a warning:
   ice loads are not calculated. Suppliers allow freezing but not moving ice.
8. **Water level**: high and low water relative to the design depth are parameters. For
   reference, Helsinki's recorded extremes are +151 cm and −93 cm (theoretical mean sea
   level) ([FMI sea records](https://en.ilmatieteenlaitos.fi/sea-records),
   [City of Helsinki 2013](https://www.hel.fi/static/kv/Geo/CasePankki/Aaltoiluselvityksen_tilannekatsaus_2013-05-15.pdf)).

---

## 6. Items that must be verified by a qualified engineer

Every anchoring result is labelled as a preliminary quantity estimate. The tool lists:
design wind and return period, wind areas of boats, shielding, current, waves, ice,
water levels, chain grade and safety factor, corrosion allowance, seabed friction and
anchor safety factor, pontoon capacity and freeboard under load, gangway slope, and the
structural design of all components — all of which RIL 201-3-2013 and AS 3962 address
and this tool does not.

---

## 7. Price file

All products, rates and calculation parameters above are in `data/hinnasto.xlsx` (one
row per item, with supplier, source URL, reading date, original price and VAT status).
Editing that file updates the prices in the tool; see `docs/DECISIONS.md` and the
*Instructions* sheet in the file.

---

## 8. Sources that could not be read in the first session

*Superseded by §9: in the second session (2026-11-14) all of these except shipmin.gov.in,
www.theseus.fi and the NauticExpo files were read.* The first session's network allowlist
blocked: odr.chalmers.se (Chalmers thesis),
demo2.parks.ca.gov (California DBW guide), www.wbdg.org (UFC 4-152-07), shipmin.gov.in,
www.theseus.fi, www.vaasa.fi, savorak.fi, www.nauticexpo.com; pdf.nauticexpo.com returned
HTTP 403. Where a fact above comes from one of these, it was taken from a search-engine
excerpt and is marked "search excerpt" or attributed accordingly. Reading the Chalmers
thesis and UFC 4-152-07 in full is the first recommended follow-up: they would replace
several **assumptions** in §5 with sourced values.

---

## 9. Sources read in the second session (2026-11-14)

All read on 2026-11-14. Quotations are verbatim.

### 9.1 UFC 4-152-07 Change 1 (2012), §6-3.4 Environmental loads

- §6-3.4.1: *"Wind load is based on a wind velocity pressure for steady conditions (neglecting
  gusts) acting on the above water profile of the berthed vessels and dock system"*.
- §6-3.4.1.2 and Fig. 6-4: velocity pressure from a curve; extracted from the PDF's vector
  data: p = V²/240 psf (V in mph) within 1 % from 30 to 120 mph (§5 item 1).
- §6-3.4.1.3: *"Determine the average profile height for the berthed vessels, generally taken
  as 15% of the berth length, but other rational method based on the berthed vessel
  dimensions may be used."*
- §6-3.4.1.4: *"Compute the wind load, checking both parallel and perpendicular directions to
  the main axis of the pier or dock. … Assume 100% berth occupancy. … the full wind load
  applied to the windward (unshielded) vessels, and 20% of the full wind load applied to all
  leeward (shielded) vessels."*
- Fig. 6-5 (sample, design wind load 15 psf, 40 ft boats, profile height 6.0 ft):
  perpendicular wind *"3 Each x 19' Beam x 6.0' Height x 15 PSF = 5,130 Lbs"* (fingers
  computed but not added to the total); parallel wind *"1 Each x 40' x 6.0' Height x 15 PSF =
  3,600 Lbs"* unshielded, *"2 Each x 40' x 6.0' Height x 3 PSF = 1,440 Lbs"* shielded,
  headwalk end *"1 Each x 6' x 1.5' Height x 15 PSF = 135 Lbs"*. This fixes which boat area
  goes with which wind direction (DECISIONS I54).
- *"Individual fingers, however, should be designed to accommodate the full wind load on the
  berthed craft since the presence of a shielding boat cannot be assured."* (Not used: the
  tool does not size fingers.)
- §6-3.4.3: current over 3 ft/s (1 m/s) needs a rational method. §6-3.4.8: *"Anchor loads for
  floating docks are generally determined by the horizontal live loads … Inadequate anchorage
  is probably the most frequent cause of failure in floating dock systems."* No anchor sizing
  rule; refers to ASCE Manual 50.
- §6-3.5.1.1 (berthing, not used): docking weight W = 12 L² lb (L in ft); approach velocity
  0.3 m/s for L < 18 m, 0.2 m/s above.

### 9.2 UFC 4-159-03 Moorings (2020), Table 3-7 *Minimum Quasi-Static Factors of Safety*

Chain 3.0 *"For relatively straight lengths"*, 4.0 *"For chain around bends"*, *"These factors
of safety are for the new chain break strength"*. Deadweight anchors: *"Use carefully (see NCEL
Handbook for Marine Geotechnical Engineering, 1985, Section 4.6)"*; Table 6-1: *"Very low
efficiency. Full-scale tests (NCEL, Fleet Mooring Test Program – Pearl Harbor) show
anchor-holding capacity dramatically decreases after anchor starts dragging … Deadweight
anchors should be used with caution."*

### 9.3 California DBW, *Layout and Design Guidelines for Marina Berthing Facilities* (2005)

- C2.4.1: *"Wind loads (WinL) on the projected vertical surfaces of docks and berthed boats
  should be not less than 15#/ft², applied above the water surface."* Commentary: a dock face
  behind an upwind boat is in its wind shadow; a boat downwind of a dock is shadowed only up
  to the dock's freeboard; profile heights must be estimated per boat type (no number).
- C8.4.1: scope = rode length ÷ depth at maximum high water, *"a mooring with a 5:1 scope"*
  as the example (buoy moorings).
- App. A p. 90: concrete anchor blocks *"are only about 60% effective as dead weight anchor
  blocks. Concrete weighs about 150 pounds per cubic foot out of water, but only about 90
  pounds under water"*; pyramid blocks *"plow into the bottom when dragged"* and *"mud in"*
  with time.
- Layout values for later use (not applied in this step): Table B-2 minimum fairway width
  **1.75 L<sub>b</sub>** (longest berth perpendicular to the fairway) without side-ties,
  1.50 L<sub>bb</sub> with side-ties (the tool's default fairway factor is 1.5, an
  assumption); Table B-1 interior channel at least 75 ft; App. Table App-1 finger length ÷
  width ratios.

### 9.4 Chalmers 2026 (Aliprantis & Jarlgren, for SF Marina)

- Method: quasi-static catenary (Ma et al. 2019), pretension from an allowed displacement
  envelope, chain check `T_max ≤ MBL` with the safety factor as output, anchor capacity of a
  Pearl Harbor type concrete anchor from capacity tables (Lin & Nakamura 1993), validated
  against PLAXIS 2D (6.7 % lower on average). Loads are an input from SF Marina's separate
  load calculation (wind on pontoon, vessels and structures).
- §3.3: chain length about 4 × HAT depth (SF Marina's initial assumption). §3.7: the load
  perpendicular to the pontoon governs; only the anchors on the loaded side are active.
  Fig. 4 (*"Example of typical SF Marina anchor chain layout"*): four chains from the pontoon
  corners, each splayed outwards (away from the pontoon's middle) by the plan angle θ measured
  from square to the pontoon; *"The anchor layout angle … describes the plan-view angle between
  the pontoon and the anchor position."* The model distributes a perpendicular load with
  `T = (H_pre + T_env) / cos θ` (eq. 22); θ = 12° in the reference case (§7.3, Fig. 16). The
  thesis does not treat loads along the pontoon.
- §3.4 and Fig. 2: *"Standard 1.5 tonne SF Marina anchor"* is *"often labelled as a Pearl
  Harbor type deadweight anchor"*, whose geometry makes it dig into the seabed.
- §3.8: anchors of about 3 t or less preferred for small installations (raft installation);
  several smaller anchors rather than one large; penetration *"often as approximately one
  third of the anchor height"* after air jetting, not measured.
- §7.3–7.5 reference case (Sjumansholmen ferry berth): 200 kN berthing load, depth 3.00 m +
  1.45 m high water, 30 mm chain, 3 t anchors; maximum chain tension 108.7 kN; anchor safety
  factor 1.00 at about 0.17 m penetration, 2.00 at about 0.40 m.
- §7.6: 174 anchor legs from five SF Marina projects: same anchor weight in 72.4 % of legs;
  drawings use 2, 3, 6 and 10 t anchors; drawing chains about 48 % larger than the prototype's.
- Soil parameter values of the capacity tables are not printed in the thesis.

### 9.5 Sound & Sea Technology 2009, Appendix A-1 *Deadweight Anchors*

- Cohesionless soil: `F_h = (W − F_v) · tan φ`, Table 33 *Friction Coefficients for Anchor
  Materials on Granular Soils*: quartz sand 0.60 (smooth concrete), 0.69 (rough concrete);
  coralline, oolitic and foram sands 0.58–0.74.
- Cohesive soil: `F_h = S_uz·A + [2·S_ua·z + γ_b·½·z²]·B`, with the anchor settling until
  `S_uz = W / (N_c·A)`, N_c ≈ 5.7, `S_ua = 0.5·S_uz`, `z = S_uz / G_su`, G_su ≈ 12 psf/ft
  (1.9 kPa/m) for sediment whose strength grows from zero at the surface. The first term alone
  is W/5.7 (equivalent friction 0.18). With the published plan sizes of Savorak's 1 000 kg and
  3 000 kg blocks (§9.7) and an *assumed* buoyant unit weight of 4–6 kN/m³ the whole formula
  gives an equivalent friction of about 0.28–0.39, so the tool's clay default 0.3 is of the
  right order for plain blocks on soft clay. Not used directly: it needs block dimensions and
  γ_b.
- Tables 35–36, *Enhanced Pearl Harbor Anchor* (concrete wedge with steel plates), working
  horizontal capacity with FS = 1.5: soft clay/mud 2.0 kips per US ton of weight in air
  (1 t → 2.0 kips … 60 t → 120 kips, *"Keep chain angle less than 5 to 6 degrees"*); sand
  3.87 kips per US ton at 0° up angle, 2.65 at 6°. I.e. a working capacity of about 1.0 × the
  anchor's weight in air in mud, against about 0.12 × for a plain block with μ = 0.3 and
  FS 1.5. This is the main quantified reason for the gap to practice (§5 item 9).
- Re-read 2026-11-16 (A-1.1, A-1.2, Tables 33–36; [Tethys/PNNL](https://tethys.pnnl.gov/sites/default/files/publications/Advanced-Anchor-and-Mooring-Study.pdf)):
  the formulas above are as printed. A-1.2 adds *"keying skirts"*, which *"adds substantially to the
  capacity of a deadweight anchor"* (cohesive: the same formula with the skirt depth z<sub>s</sub>);
  A-1.2 also: *"for a seafloor sloping toward an anchored object, the anchor capacity is reduced,
  reaching zero as the tangent of the slope angle reaches the effective coefficient of friction"*.
  Savorak's 3 000 kg block worked through the cohesive formula: equivalent friction 0.26–0.39
  (DECISIONS I102). The NAVFAC *Handbook for Marine Geotechnical Engineering* (SP-2209-OCN, 2012;
  DTIC ADA556807), on which such procedures rest, could not be read: DTIC answered 403.

### 9.6 Vaasa 2020

See §3 (733 €/jm, about 50 000 € per pier, 2 900 € per berth at Gerby 2014).

### 9.7 Savorak (savorak.fi)

Concrete weights (*"Raudoitettu. Päällä nostokahvat ja pohjassa urat."*), € as listed, VAT
status not stated on the product page: 300 kg 126; 600 kg 205; 800 kg 270; 1 000 kg 310
(1 190 × 1 190 × 320 mm); 1 500 kg 435; 2 000 kg 550; 2 400 kg 660; 3 000 kg 790
(1 190 × 2 390 × 460 mm). Chain *"DIN 763 (5685C)"* hot-dip galvanised, breaking strength
10 mm n. 4 t … 22 mm n. 19 t (same figures as Laatulaituri), sold in 7.5/15/30 m lengths
(e.g. 20 mm 30 m 1 200 €). Packages up to *"koneasennus 2 x 2000 kg"* (3 815 €). In the price
list since the third session (§9.10): the order terms say *"Tuotteiden hinnat sisältävät
arvonlisäveron."* ([toimitusehdot](https://savorak.fi/toimitusehdot/)); chain prices per metre
from the 30 m lengths (10 mm 325 €, 13 mm 510 €, 16 mm 760 €, 20 mm 1 200 €, 22 mm 1 500 € per
30 m; DECISIONS I63) ([anchoring](https://savorak.fi/tuoteosasto/ankkurointi/),
[weights](https://savorak.fi/tuotteet/betonipaino-300kg/),
[chain](https://savorak.fi/tuotteet/kettinki-20mm-kuumasinkitty/)).

### 9.8 K-Rauta: Savorak painoankkurointipaketti 24 × 25 kg (search excerpt; now confirmed on savorak.fi, §9.11)

Retailer's description of a cottage-dock weight anchoring kit (24 weights of 25 kg, 2 × 15 m of
13 mm chain), as returned by a web search on 2026-11-14 (page not opened; k-rauta.fi is not
reachable from this session): the outer end of the dock is anchored with two 15 m chains
*"jotka vedetään pohjapainoihin ristiin noin 45 asteen kulmassa"*
([product page](https://www.k-rauta.fi/tuote/savorak-painoankkurointipaketti-24-x-25-kg/6438606010163)).
Used only as the source of the default splay angle (D25); a light kit, not a marina pier.

### 9.9 Still not readable

www.theseus.fi answers with a Cloudflare browser check; the NAVFAC handbook on apps.dtic.mil
is refused by the server ("The request is blocked."); shipmin.gov.in was not tried again.
In the third session (2026-11-14) theseus.fi still answered HTTP 403.

### 9.10 Third session (2026-11-14): price list checks and the search for real anchoring plans

- **Price list.** Top Marine's HD 3,0 m pontoons, ladders and power pedestals were checked
  verbatim on the [price list page](https://topmarinelaiturit.fi/hinnasto/) (§2.3); MDP
  2,4 × 15 m added. Savorak's weights 300–3 000 kg and chains 10–22 mm added (§9.7). A-Laiturit
  still publishes no breaking load for its 16 and 20 mm G40 chains
  ([20 mm](https://www.a-laiturit.fi/tuote/kettinki-pitkahahlo-20-mm-metritavara-g40-lujuusluokiteltu/)):
  *"Laatuluokitus DIN 763 Grade 40 (erityiskova). Kettinki on vetotestattu Suomessa."* They stay
  out of the anchoring calculation.
- **Real anchoring plans for calibration.** No public Finnish anchoring plan was found (web
  searches for *ankkurointisuunnitelma* and municipal marina tenders). Scottish marine licence
  applications were read: the Easdale pontoon application lists *"Mooring Chains no 20 at 15m, 1
  at 20m, 1 at 50m, 2 at 44m"* for 80 m of aluminium-and-timber and HDPE pontoons (sections
  11.5 × 2.5 m and 15 × 2.5 m), but chain sizes, anchors and loads are not given and the drawings
  are redacted ([application](https://marine.gov.scot/sites/default/files/updated_complete_easdale_pontoon_application_1_redacted.pdf));
  the Aith (Shetland) pontoon drawings show a pile-guided pontoon, not chains
  ([details](https://marine.gov.scot/sites/default/files/pontoon_details_collated.pdf)). Neither
  can calibrate the method.

### 9.11 Savorak: shore chains and wall fixings (read 2026-11-14)

- Kit *"Ankkurointipaketti, käsiasennus, mökkisarja, 24 x 25 kg, rantakettingeillä"*
  ([page](https://savorak.fi/tuotteet/ankkurointipaketti-kasiasennus-mokkisarja-24-x-25-kg/)):
  *"Laiturin kansiosa kiinnitetään rantaan kettingeillä, jotka ankkuroidaan maapenkkaan,
  betoniseen maatukeen tai tukevasti asettuviin rantakiviin. Ranta-ankkurointi kahdella
  kettingillä pitää laiturin paikoillaan mutta sallii sen joustavan liikkeen aallokon mukana."*
  *"Laiturin ulkopää ankkuroidaan kahdella noin 10–15 metrin pituisella kettingillä ristiin
  pohjapainoihin, 45 asteen kulmassa."* Shore part: *"2 kpl 7,5 m 10 mm kettinkiä"*. Winter:
  *"Jos jäät liikkuvat laiturin ympärillä eikä sitä voi nostaa maihin, laituri voidaan siirtää
  talven ajaksi suojaisempaan paikkaan ja ankkuroida uudelleen."* The kit is for a light dock.
- The machine-installed kit 2 × 2 000 kg has *"Ketju 20 mm 45 m, ( 2 kpl 15 m, 2 kpl 7,5 m )"*,
  the same split of anchor and (presumably) shore chains (3 815 €).
- *"Kalliosilmukka 20 mm, HDG"* 18,50 €: *"Kalliosilmukoita voi käyttää käyttää kettinkien tai
  veneiden kiinnityspisteenä kalliossa tai betonissa."* Drilled 22 mm hole with a wedge; no
  capacity published ([page](https://savorak.fi/tuotteet/kalliosilmukka-20-mm-hdg/)). In the price
  list as category `wall_fixing` (DECISIONS I66).
- Top Marine on wall and pile fixings ([anchoring](https://topmarinelaiturit.fi/laituritarvikkeet/ankkurointi/)):
  *"Vinokiinnikkeitä käytetään vähän ja poikkeuksellisissa olosuhteissa, joissa laituri on hyvin
  lähellä rantaa eikä tilaa kettinkikiinnitykselle ole. Syynä on se, että jään aiheuttamien
  vaurioiden riski on olemassa talvella"*; pile guides: *"Pohjoismaissa pilarit on purettava joka
  syksy ja laituri nostettava pois vedestä."* Hence chains, not rails or arms, for pontoons that
  stay in the water over winter (D17).

### 9.12 Marinetek brochures (marinetek.hr, read 2026-11-15)

From [Brochures and specifications](https://www.marinetek.hr/en/brochures-and-specifications/)
(link given by the owner). The single-page brochures carry *"Modification date: 14.11.2014"*;
several are images only and were read as images. No prices.

- **All-Concrete pontoons** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/All-Concrete-pontoons-2400-3000.pdf)):
  M2409AC/M2412AC/M2415AC 8,92/11,92/14,92 × 2,4 m (concrete 2,2 m), 7,0/9,5/11,9 t; M2609AC/M2612AC
  8,92/11,92 × 2,6 m, 7,5/10,0 t; M3009AC/M3012AC/3015AC 8,92/11,92/14,92 × 3,0 m, 7,5/10,9/13,7 t.
  Height 0,85 m; net capacity 4,6 kN/m² (2,4 and 2,6 m) and 5,0 kN/m² (3,0 m); freeboard 0,46 and
  0,50 m; *"Strength of joint (kN) 2x180"*; *"The pontoon can be moored by piles or chain or Seaflex
  through the mooring wells."*
- **Heavy Duty pontoons** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/HD-pontoons-2700-3300-4300.pdf)):
  M2712HD/M2715HD 11,92/14,92 × 2,7 m, 10,7/13,4 t, freeboard 0,46 m; M3312HD/M3315HD × 3,3 m,
  12,2/15,3 t; M4312HD/M4315HD × 4,3 m, 16,4/20,6 t; freeboard 0,50 m; joints 2 × 322 kN; *"fixing
  rails for fingers"*.
- **Premier pontoons** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Premier-pontoons-2700-3300.pdf)):
  12,20/16,05/19,90 m × 2,7 or 3,3 m, height 1,0 m, freeboard 0,56 m, 5,6 kN/m².
- **Steel Mooring Fingers** FN6000/FN8000/FN10000/FN12000 ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Steel-Mooring-Fingers.pdf)):
  length 6,0/8,0/10,0/12,0 m, width 0,7 m, total capacity 520/780/1040/1300 kg, joint bolts
  2×M20/2×M20/4×M20/4×M20; *"Fingers of special lengths and widths are also available."*;
  *"Standard fingers suit best for pontoons with freeboard up to 0,56 m."*
- **Steel Boat Booms** FN500/FN600/FN700 (width 0,35 m) and FN600K/FN700K (decked, 0,4 m)
  ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Steel-Boat-Booms.pdf)): length 5,0/6,0/7,0
  and 6,0/7,0 m, joint bolts 2×M20, *"Booms of special lengths and widths are also available."*
- **Concrete products** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Concrete-products.pdf)):
  chain-mooring sinkers 40, 200, 350, 700, 1 200, 2 000, 2 500, 3 000, 4 000 and 5 000 kg (hot-dip
  galvanised bar 16–32 mm), Seaflex sinkers 5 000–12 500 kg; shore support elements for marina
  pontoons 1 500 × 2 000 × 400 mm, 1 600 kg, for bridges up to 1,8 × 12,0 m.
- **Access bridges** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Access-Bridges.pdf)):
  timber 1,3 × 4,0/5,0/6,0 m and 1,9 × 5,0/6,0 m; steel (2,5 kN/m²) 1,2 or 1,8 × 6,0/8,0/10,0/12,0 m;
  aluminium 6–20 m long, 1,2–2,4 m wide.
- **Fittings** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Fittings.pdf)): *"Anchoring
  eye for rock 20 mm, 22 mm, Hot dip galvanised"*; chain 10–25 mm; shackles 12–28 mm; steel springs
  12 and 16 mm; flexible shore fixing 250/500/1000 kg; cleats and bollards 25–100 kN.
- **Pile guides** G200/G400/G700 ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Pile-Guides.pdf)):
  G200 for timber pontoons, piles 305–356 mm, *"The design pile load is 20 kN"*; G400 for Heavy Duty
  pontoons, piles 406–508 mm, 40 kN; G700 *"the strongest standard product"*, for the biggest Heavy
  Duty pontoons and breakwaters, piles 762–920 mm, 70 kN.
- **Catalogue "Marinas, Pontoons and Floating Solutions" 2012** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Marinas-Pontoons-and-Floating-Solutions-2012.pdf)),
  "Boat Moorings" (p. 26–27): *"Light weight mooring Booms are 4-12 m long"*; *"Longer than 12 m
  Super Yacht and Concrete Fingers are moored with end piles."* (DECISIONS D31.)

### 9.13 Top Marine: stern buoys (read 2026-11-15)

Three pages of topmarinelaiturit.fi, a Finnish pontoon manufacturer (product and marketing
pages: a supplier's rules of thumb, not a design method; weak sources for a marina):

- **Article "Poiju – ankkuripainon mitoitus"** (
  [topmarinelaiturit.fi/hyodyllista/poiju-ankkuripainon-mitoitus/](https://topmarinelaiturit.fi/hyodyllista/poiju-ankkuripainon-mitoitus/)):
  *"Suojaisissa olosuhteissa suositus on 3–5 × veneen paino. Avoimilla alueilla suositus on
  5–10 × veneen paino."*; *"Poijukettingin pituus: normaaliolosuhteet: veden syvyys × 2;
  avomeri: veden syvyys × 3; syvyys yli 8 m: kerroin 1,5"*; floats *"40 l – pienet veneet, 60 l –
  keskikokoiset, 120 l – suuret veneet ja avomeri"*; two sinkers joined by about 1 m of chain on
  rocky bottoms, in very windy places and for large boats; *"Liian ohut kettinki (<10 mm)"* listed
  as a common mistake. (DECISIONS D36.)
- **Product page "Poijut"** ([topmarinelaiturit.fi/laituritarvikkeet/poijut/](https://topmarinelaiturit.fi/laituritarvikkeet/poijut/)):
  the same rule *"suojaisissa olosuhteissa vähintään 3–5 × veneen paino – avoimilla alueilla
  jopa 5–10 × veneen paino"*, but also *"Ankkurointikettingin pituus (E) saadaan laskutoimituksella:
  veden maksimisyvyys + 1 m. Avomerellä … veden syvyys kerrottuna kolmella"* and *"Ketjun
  nimellinen koko valitaan veneen painon mukaan. Sakkelin nimellinen koko on aina suurempi kuin
  kettingin koko"*. Selection table "Millainen venepoiju valita veneelle?" (sailing boats):

  | Length ft / m | Beam m | Weight t | Buoy l | Anchor kg | Chain/shackle mm |
  |---|---|---|---|---|---|
  | 15 / 4,6 | 2,0 | 1,0 | 40 | 500 | 10/13 |
  | 20 / 6,1 | 2,4 | 2,0 | 40 | 500 | 13/16 |
  | 25 / 7,6 | 2,8 | 3,3 | 60 | 500 | 13/16 |
  | 30 / 9,1 | 3,2 | 4,8 | 60 | 1000 | 16/20 |
  | 35 / 10,7 | 3,6 | 6,5 | 120 | 1000 | 16/20 |
  | 40 / 12,2 | 4,0 | 8,5 | 120 | 1000 | 16/20 |
  | 45 / 13,7 | 4,4 | 10,8 | 120 | 2000 | 20/22 |

  Floats (Tekniset tiedot): Poiju 40 l / 60 l / 120 l, codes 111000 / 112000 / 113000, weight 9 /
  12 / 16 kg, *"Kantavuus (kg)"* 31 / 48 / 104, D 440 / 500 / 630 mm. Example packages with
  component prices (*"Hinnat sisältävät arvonlisäveron, mutta eivät asennuskuluja."*): 4,6 m
  boat 309 € = Venepoiju 40 l 168 € + Betonipaino 500 kg 120 € + Kettinki 10 mm 3 m 18 € + Sakkeli
  12 mm 3 €; 7,6 m 363 € = 60 l 198 € + 500 kg 120 € + 13 mm 4 m 40 € + 16 mm 5 €; 12,2 m 596 € =
  120 l 243 € + 1 000 kg 271 € + 16 mm 5 m 75 € + 20 mm 7 €.
- **Price list** ([topmarinelaiturit.fi/hinnasto/](https://topmarinelaiturit.fi/hinnasto/)): the same
  three packages (309 €, 363 €, 596 €) and *"Venepoijun etäisyys laiturista = veneen pituus + kolme
  kertaa veden syvyys"* (DECISIONS I78).

**Contradictions:** the table's anchors are 0.12–0.5 × the boat weight, the rule 3–5 ×; the chain
length is "maximum depth + 1 m" on the product page and "depth × 2" in the article; the package
chains (3, 4, 5 m) are shorter than either rule for most depths. The price list takes the floats and
the 500 kg sinker at their package component prices (rows `buoy-topmarine-40/60/120`,
`anchor-topmarine-500`); Top Marine's chains and shackles are not added because their breaking
loads are not published (the tool chooses chains by breaking load; the existing shackle rows are
load-rated).

### 9.14 Other sources on stern buoys (read 2026-11-15)

The owner asked what other sources say (DECISIONS D37). Read in full:

- **Svenska Båtunionen, *Hamnhandboken* version 1 (2016)**, §2.31–2.33
  ([PDF](https://batunionen.se/wp-content/uploads/2020/01/hamnhandboken-version-1-2016.compressed.pdf)),
  the Swedish boating union's guide *"för planering, projektering, byggande och drift av hamnar för
  fritidsbåtar"*. The 2022 edition (smbf.org) has the same section 2.33 but its link no longer works.
  Quality: a national association's planning handbook for exactly this mooring; no derivation given.
  - §2.31 *Förtöjning mellan brygga och boj*: *"bör undvikas om vattendjupet är större än 5-6 meter.
    Vid större vattendjup blir bojkättingen så lång att båtarnas svängning i sidled blir ett
    svårbemästrat problem."*
  - §2.32: the stern line is taut; *"en sänkning av vattenståndet från 3,0 till 2,5 meter medför att
    bojen kommer ca 0,4 meter närmare bryggan. (Beräknat med lutning av 1:1 på boj-kättingen.)"*;
    *"Avståndet mellan båt och boj bör dock inte överstiga 1,4 gånger båtlängden."*; *"Då skillnaden
    mellan normal högvattenyta och normal lågvattenyta inte överstiger ca 1,3 meter, kan bojkättingen
    ges en lutning av 1:1 (= 45°)"*, otherwise *"beräknas från fall till fall"*; *"Kättingens längd bör
    tillåta att bojen kan lyftas med centrum ca 0,8 meter över normal högvattenyta."*; *"Vid större
    vattendjup bör varje boj förankras i två ankartyngder."*; manoeuvring width between the piers B:
    *"enbart avståndet mellan bojtyngderna räknas som fritt manöverområde … Minimibredden kan sättas
    till ca 2,5 gånger båtlängden men bör vara minst 20 meter."*
  - Tabell 1 (minimum dimensions), A = pier – sinker, m, for boat lengths < 6 / 5–8 / 7–10 / 9–12 m:
    depth 2,0 m: 10,5 / 12,5 / 15,0 / 17,5; each further metre of depth + 1,0 m (6,0 m: 14,5 / 16,5 /
    19,0 / 21,5); B 20 / 20 / 25 / 30 m. So A ≈ the class's longest boat + depth + 0,5–1,5 m.
  - Tabell 2, berth width for every mooring type: beam < 2,5 m → 3,3 m; 2,5–3,0 → 3,3–3,8;
    3,1–3,9 → 3,9–4,6; 4,0–5,0 → 4,7–5,7 m (+ about 10 % where there is room, − 0,2 m in a sheltered,
    cramped harbour). That is 0,7–0,8 m wider than the beam; the tool's default beam clearance is
    0,5 m (an assumption).
  - §2.33 Tabell 3 *Dimensionering av boj, bojkätting och bojtyngd*: *"Båtens deplacement, ton"* 2,0 /
    5,0 / 8,0 / 10,0 → *"Boj, bärförmåga"* 0,45 / 0,70 / 1,00 / 1,20 kN (45 / 70 / 100 / 120 kp),
    *"Bojkätting, godsdiameter mm"* 10 / 13 / 16 / 16 *"(Vid utsatt läge ökas angivna dimensioner ett
    steg)"*, *"Bojtyngdens vikt i vatten, kg"* 300 / 700 / 1000 / 1200, square sinker 0,7 / 0,9 / 1,1 /
    1,1 m, height 0,3 / 0,45 / 0,5 / 0,6 m. *"Bojen är en viktig ryckdämpare. Den skall gott och väl bära
    kättingtyngden men bör inte vara större än att den kan dras under ytan vid kraftig belastning."*
- **M. A. Ranta & P. Ranta, "Poijukiinnitys", *Rakenteiden Mekaniikka* 47 (2), 2014, 80–90**
  ([PDF](https://rmseura.aalto.fi/rmlehti/2014/nro2/RakMek_47_2_2014_4.pdf)), peer-reviewed, Aalto
  University: catenary theory of a swing mooring (the same as step 4 of §5). Sliding condition
  µ₀ [ζMg − H sinh(x₁/a)] ≥ H (no safety factor); concrete ζ = 0,44–0,60; *"poijukettingin pituuden
  tulisi olla vähintään kaksi kertaa veden syvyys eli z ≥ 2"* (for holding: a short chain lifts the
  sinker). Its Taulukko 1, from *Veneilyn Aapinen* (Finnboat): boat 0,5 / 2,0 / 4,0 t → sinker 200 /
  300 / 600 kg. Worked example: a 300 kg sinker (ζ = 0,6, µ₀ = 0,5) with a short chain (8,0 m in 5,2 m of water)
  starts to move at 17,7 m/s (20,7 m/s counting the horizontal pull only) on a boat of 3,36 m² with
  C_D = 0,8.
- **Rockport Harbormaster (Massachusetts), Mooring Regulations**
  ([page](https://www.harbormasters.org/rockport/mooring.shtml)), swing moorings on an exposed coast:
  minimum deadweight (submerged) 10–17 ft 1 000 lb, 18–26 ft 1 500 lb, 27–35 ft 3 000 lb, 36–45 ft
  4 000 lb, 45–55 ft 5 000 lb; *"Concrete = required weight /.55"*. In concrete in air: 825 / 1 237 /
  2 474 / 3 299 kg.
- **OCEL Consultants NZ, *Swing Mooring Design Report* for Waikato and Bay of Plenty Regional
  Councils** ([PDF](https://www.boprc.govt.nz/media/456922/ocel-swing-mooring-design-report-v2.pdf)),
  an engineering report (AS/NZS 1170, AS 3962 windage, 32 m/s 30-s gust at 5 m): concrete blocks 1 t
  (≤ 7 m), 2 t (7,1–12 m), 4 t (12,1–15 m) in air, FS ≥ 2 counting passive earth pressure; *"For a
  2,000 kg concrete weight … the submerged weight is 1,146 kg. The resistance can then be as low as
  2.3 kN"* by friction on a thin soft layer, but embedded in soft silt *"total 34.5 kN"*; chain FS
  MBL/QS ≈ 10.
- **Search results only (not read; snippets):** Newport Beach CA (sinker 500 lb for 20 ft to
  2 000 lb for 45 ft), Fairhaven MA (mushroom weight = length × beam in lb), Barnstable MA (chain
  3 × depth at high tide), Cape Elizabeth ME (heavy chain 1,5 × and light chain 1,0 × maximum depth),
  a Finnish retailer (chain about 2 × depth, at least 13–16 mm). Swedish and German searches found
  no other rule of thumb.

**Comparison, sinker as concrete mass in air (kg):**

| Boat | Båtunionen 2016 | Top Marine table | Ranta & Ranta 2014 | Rockport (swing, by length) | OCEL NZ (swing) | Top Marine 3 × weight |
|---|---|---|---|---|---|---|
| 2 t (≈ 6 m) | 514 | 500 | 300 | 1 237 (18–26 ft) | 1 000 | 6 000 |
| 5 t (≈ 9 m) | 1 200 | 1 000 | – | 2 474 (27–35 ft) | 2 000 | 15 000 |
| 8 t (≈ 12 m) | 1 714 | 1 000 | – | 3 299 (36–45 ft) | 2 000 | 24 000 |

Swing moorings take the whole boat in every direction on one point; a stern buoy shares the boat
with the bow lines on the pier, in a harbour. **3–5 × the boat weight is an outlier by a factor of
about 10–25**; Båtunionen and Top Marine's own table agree within a factor of 2.

**Chain length and buoy distance:** Båtunionen 1:1 (√2 × depth) with the buoy at A ≈ length + depth
+ 0,5–1,5 m; Suomen Laiturikauppa depth + 3 m (+ 1 m in a cramped harbour) with A = length + depth;
Top Marine 2 × depth (or maximum depth + 1 m) with length + 3 × depth. The geometry has to match: a
taut chain of length c·h lets the buoy move √(c² − 1)·h towards the pier (1:1 → h; 2 × depth →
1,73 h). Longer chains (Ranta & Ranta's ≥ 2 × depth) are a holding argument for swing moorings.

### 9.15 Finnish anchoring references (2026-11-16)

- **Meri, Vaasa** (owner's information, D57, D59): floating sauna restaurant in Vaasa's inner harbour
  on 11 pontoons of 20 × 4 × 1.4 m side by side (44 × 20 m), anchored with about 45 × 5 000 kg and
  8 × 4 000 kg anchors (257 t); *"todella altis aallolle ja tuulelle"*. Public traces found by search
  but **not read** (hosts not reachable from the development environment): Yle 3-11988210 (building
  permit for Bluet's restaurant and sauna building with a pool in the inner harbour) and Yle 3-12607181
  (the raft, *"yli tuhannen neliömetrin"* according to the search excerpt, towed from Vaskiluoto);
  Bluet's reference list on nauticexpo (*"Floating Sauna-Restaurant, Vaasa, Finland"*, *"overall floating
  area 1 850m2"* in the search excerpt; the page answered 403). The excerpts' areas (over 1 000 m²,
  1 850 m²) are larger than 11 × 80 m² = 880 m²; the difference is not explained.
- **Iisalmi** (owner's drawing, D46): see DECISIONS I96, I102, I104.
- **Suppliers** (search excerpt of A-Marinas' product page on nauticexpo, not read): *"most frequently
  used are 20-22 mm DIN 763 HDG chains and 800-2400 kg concrete anchors"*.
- **UFC 4-152-07 C1** 6-3.4.7.2 (read 2026-11-16, wbdg.org): *"Generally, when the design wave height
  exceeds 1 foot, it could be a significant factor in design and a rational method should be used to
  determine the wave forces"*; 6-3.4.7.3: *"for floating docks … the horizontal loads are greatest when
  the wave approach is perpendicular to the long axis"*. Used for the lower end of the wave load (I104).
- **Not readable from the development environment** (DNS refused, or the session's permission check
  stopped the request): permit and municipal documents found by search — ESAVI 236/2023 Rasila boat
  harbour, Ruokolahti (ruokolahti.fi); the City of Oulu's technical guide for the floating houses of
  Vaakunakylänranta, which says the pontoons are anchored *"meren pohjaan asennettavien, teräsbetonisten
  ankkuripainojen ja kettinkien avulla"* (search excerpt, ouka.fi); Pyhtää, Kustavi and Naantali meeting
  and notice documents; a Danish marina consultation (kyst.dk) whose excerpt lists concrete anchors of
  2 000 and 3 000 kg with 20 and 22 mm chain for boats up to 24 m. The NAVFAC handbook on DTIC answered
  403 (§9.5). These can be read in a browser and attached to a later session.

## 10. Wind waves and wave protection (read 2026-11-15)

- **USACE, Coastal Engineering Manual EM 1110-2-1100, Part II, Chapter 2 "Meteorology and Wave
  Climate" (Change 1, 31 July 2003)** ([PDF copy](https://pdhonline.com/courses/c772/Part-II-Chap_2entire.pdf);
  HTML mirror coastalengineeringmanual.tpub.com). §II-2-2.b(1)(b): *"The equations governing wave
  growth with fetch are"* g Hm0/u*² = 4.13 × 10⁻² (gX/u*²)^½ and g Tp/u* = 0.651 (gX/u*²)^⅓ (II-2-36),
  C_D = u*²/U10² = 0.001 (1.1 + 0.035 U10); fully developed g Hm0/u*² = 2.115 × 10², g Tp/u* =
  2.398 × 10² (II-2-37); duration as equivalent fetch gX/u*² = 5.23 × 10⁻³ (gt/u*)^1.5 (II-2-38);
  time to become fetch-limited t = 77.23 X^0.67 / (u^0.34 g^0.33) (II-2-35). (c): *"it is recommended
  that the straightline fetch be used"*. (d)/(3): *"deepwater wave growth formulae be used for all
  depths"* with Tp ≤ 9.78 (d/g)^½ (II-2-39); if limited, *"The wave height may be found by noting the
  dimensionless fetch associated with the limiting wave period"*; *"If wave height exceeds 0.6 times
  the depth, wave height should be limited to 0.6 times the depth."* Winds (§II-2-1.a, i): small
  basins respond to 1- to 5-min winds, large ones to 15- to 30-min averages; extreme winds are
  converted between averaging times with Figure II-2-1 (5 min / 1 h ≈ 1.09, 100 s ≈ 1.2; above 1 h
  U_t/U_3600 = −0.15 log10 t + 1.5334, Example II-2-2); overland winds × 1.2 for fetches under 16 km;
  unknown stability → R_T = 1.1 for fetches over 16 km. Example II-2-7 (15 m/s, 10 km, 3 m): Tp ≈ 2.7 s,
  Hm0 ≈ 1.0 m read from the nomograms (the equations: 2.6 s, 0.80 m). Example II-2-8 (25 m/s, 50 km,
  1.6 m): limit 4.0 s, equivalent fetch 20 km, 2.1 m, *"so the final answer should be 0.8 m"* (0.6 ×
  1.6 = 0.96 m; the printed value does not follow the stated rule). The SPM 1984 expression
  1.277 + 0.296 tanh(0.9 log10(45/t)) for durations under 1 h was not read; it reproduces the two
  CEM values.
- **UFC 4-152-07 Change 1 (2012), §4-1.2.3 and Figure 4-1** ([wbdg.org](https://www.wbdg.org/)):
  *"The berthing area should meet the wave climate criteria shown in Figure 4-1 adapted from Design
  Wave Climate in Small Craft Harbors"*: significant wave height for 50-year / 1-year exceedance —
  head seas < 2 s: not likely / < 1 ft; head seas > 2 s: < 2 ft / < 1 ft; beam seas < 2 s: not likely /
  < 0.5 ft; beam seas > 2 s: < 0.8 ft / < 0.5 ft; *"Criteria for an 'excellent' wave climate multiply
  wave height by 0.75, and for moderate wave climate multiply wave height by 1.25."* §4-3.5:
  *"Wave attenuators … may be used to help protect areas from short period waves (wind waves with a
  limited fetch, or ship wake). … It is imperative that a competent coastal engineer perform a wind
  wave analysis study"*. §4-1.1.2: wind frequency by direction and speed should be determined.
- **Marinetek, Breakwater Pontoons 3300, 3800** (brochure, modification date 14.11.2014, §9.12):
  *"The Marinetek Breakwaters without keels work best when the sea wave length is less than 18 m."*
  A diagram "Wave attenuation capacity, sheltered sea conditions" gives the attenuation against Hs
  and wavelength (with wind 10–20 m/s and effective fetch 1–5 km scales); not digitised.
- **California DBW (2005)** (§9.3): concrete pontoons *"probably should not be considered for marinas
  in open water locations subject to wave heights over 12-14 inches unless designed and built to also
  act as a wave attenuator"*. **Top Marine** (§2.3): HD pontoons allowed wave height 0,5 m, MD 0,3 m.
- **Open-Meteo** (read 2026-11-15): [terms](https://open-meteo.com/en/terms) *"Less than 10'000 API
  calls per day, 5'000 per hour and 600 per minute. You may only use the free API services for
  non-commercial purposes. You accept to the CC-BY 4.0 licence"*; [pricing](https://open-meteo.com/en/pricing)
  *"Requests for data covering more than 10 weather variables or extending over a period of more
  than 2 weeks for a single location are considered multiple API calls … 4 weeks of data equals 3.0
  API calls"*; [Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api): ERA5
  (0.25°, from 1940), ERA5-Land (0.1°, from 1950), *"Select "ERA5" or "ERA5-Land" for consistent data
  over multiple decades"*; `cell_selection`: *"land finds a suitable grid-cell on land with similar
  elevation … sea prefers grid-cells on sea"*; `wind_speed_10m` "Instant"; `timeformat=unixtime`;
  citations Zippenfenig (2023) and Hersbach et al. (2023), ERA5, doi:10.24381/cds.adbb2d47. A test
  request returned `access-control-allow-origin: *` (browser use works). Rate limits are per IP:
  from this development environment's shared address the daily limit was already used up, so the
  tests use a mocked answer.
- **Live test (2026-11-16)** of the tool's own `fetchWindHistory` + `windClimate` from the
  development environment, 1996–2025, `models=era5`, `cell_selection=sea`: six 5-year requests per site,
  about 2 s; **262 992 hours, no missing values** at both sites.
  - Helsinki (60.155, 24.956): cell 60.0 / 25.0 (`nearest` gives 60.25 / 25.0, so `sea` did pick
    another cell); hours < 4 m/s 21.5 %; largest hourly wind 20.9 m/s; once-a-year 12.2–16.1 m/s and
    50-year 16.4–20.8 m/s by sector, strongest SW–W.
  - Iisalmi (63.558, 27.19): cell 63.5 / 27.25 for `sea`, `nearest` **and** `land` alike, i.e. there is
    no sea cell near an inland lake and the nearest (land) cell is used; hours < 4 m/s **74.5 %**;
    largest hourly wind in 30 years **10.2 m/s**; once-a-year 6.2–7.6 m/s, 50-year 8.1–10.3 m/s.
  - The Iisalmi winds are those of a 0.25° cell that is mostly forest; the wind over the open lake is
    not known from this. Checking against FMI observations (handoff item 6) is needed before
    ERA5 winds are used for lakes.


---

### 10.1 FMI weather observations (read 2026-11-16)

- **Service:** FMI open data WFS, stored query `fmi::observations::weather::hourly::multipointcoverage`
  (*"Hourly weather observations from weather stations. Default set contains … wind speed average,
  minumum (10 minute average) and maximum (10 minute average), wind direction average, wind gust speed
  maximum (3 second average) …"*; describeStoredQueries, 2026-11-16). Parameters used: `WS_PT1H_MAX`,
  `WD_PT1H_AVG`. A request longer than a month is refused: *"Too long time interval requested! No more
  than 744.000000 hours allowed."* The answer carries `access-control-allow-origin: *`.
- **Limits** ([FMI Open data WFS services](https://en.ilmatieteenlaitos.fi/open-data-manual-fmi-wfs-services)):
  *"Download Service has limit of 20000 requests per day … Download and View Services have combined limit
  of 600 requests per 5 minutes"*. 30 years = 360 requests per station.
- **Stations found** (2026-11-16): within 60 km of Iisalmi Vieremä Kaarakkala (31.6 km) and Kuopio
  Maaninka (46.6 km); of Helsinki 16 stations from Kaisaniemi (2.3 km) and Harmaja (5.7 km) to Inkoo
  Bågaskär (58.0 km).
- **Comparison with ERA5** (DECISIONS I108): Vieremä Kaarakkala 2001–2025, largest hourly maximum
  13.4 m/s, 50-year 10.2–14.6 m/s; Helsinki Harmaja 1997–2025, 23.5 m/s, 17.5–24.6 m/s; Helsinki
  Kaisaniemi 2016–2025, 16.0 m/s. ERA5 (1 h): Iisalmi 10.2 m/s and 8.1–10.3 m/s, Helsinki sea cell
  20.9 m/s and 16.4–20.8 m/s.

### 10.2 Open depth data for the fetches (read 2026-11-16)

- **EMODnet Bathymetry REST** ([EMODnet web services](https://emodnet.ec.europa.eu/en/emodnet-web-service-documentation)):
  `https://rest.emodnet-bathymetry.eu/depth_sample?geom=POINT(lon lat)` answers e.g.
  `{"min":-19.27,"max":-19.27,"avg":-19.27, … "reference":{"identifier":"FINCHART","type":"DTM"}}` off
  Helsinki; `depth_profile?geom=LINESTRING(…)` answers 1 000 values along the line. Negative = depth,
  positive = land (inland at Iisalmi `"avg":92.63`): the model covers the sea only. CORS: the answer
  echoes the page's origin.
- **SYKE INSPIRE elevation WFS** `https://paikkatiedot.ymparisto.fi/geoserver/inspire_el/wfs` (listed by
  SYKE among its WFS services; dataset "Järvien ja jokien luotauspisteet",
  [ckan.ymparisto.fi](https://ckan.ymparisto.fi/en/dataset/jarvien-ja-jokien-luotauspisteet), CC BY 4.0):
  feature types `EL.Syvyysalue`, `EL.ContourLine`, `EL.SpotElevation`. `EL.Syvyysalue` has `syvyysvali_m`
  ("0-1,5", "1,5-3", "3-6", "6-10", "10-15", "15-20"; "Saari" for islands), the survey area and lake codes
  and `geom` (MultiSurface, EPSG:3067). Near Iisalmi: Kilpijärvi, Tismiö, Viitaanjärvi, Ylemmäinen (not
  Porovesi). `Access-Control-Allow-Origin: *`. SYKE's page asks applications to request an identifier from
  its GIS support for the WFS; not done (open question).
- **Traficom open WFS** `https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs`: layers include
  `avoin:d_alueet` and harbour structures (`Pontoon_A`, `Berths_L`); not used (EMODnet's Finnish data is
  FINCHART). Licence CC BY 4.0 with Traficom's attribution
  ([bathymetric data](https://traficom.fi/en/hydrography/hydrographic-data-services/bathymetric-data)).

## 11. AS 3962-2001 *Guidelines for design of marinas* (read 2026-11-15)

The owner supplied a copy of AS 3962-2001 and asked that it be used to check and update the
tool (DECISIONS D42). It is superseded by AS 3962:2020, which was not available. The copy is not
stored in the repository; below are clause numbers, the values the tool can use, and short
phrases only. Clause 1.1, Note 1: *"This document is intended for use as a guideline and should not
be used as a design specification."* The tool does not claim compliance with it.

| Clause | What AS 3962-2001 says | The tool before this session | Done |
|---|---|---|---|
| 1.3.32–1.3.34 | Head sea: waves *"up to 22.5° from the centre-line"*; beam sea: *"within 22.5° from abeam"*; oblique: everything else. | Head/beam split at 45° (I86, assumption). | Wave criteria use the three AS headings (D47). |
| 2.3.2.2 | The wave climate needs *"water areas and fetch lengths in all directions"* and *"average depths along each of the major fetch directions"*. | One longest fetch and its direction (D40). | Fetch and depth per direction sector (D47). |
| 2.3.2.1 | Hindcasting needs a longer-duration mean wind, *"The mean one-hourly, three-hourly or six-hourly wind speed is usually appropriate"*; directional wind data. | ERA5 hourly winds by sector (D41). | Unchanged. |
| 3.1.1 | Entrance channel minimum the greatest of 20 m, L + 2 m and 5 B; preferred 30 m or 6 B, whichever is the minimum; a short narrowing at breakwaters at least max(15 m, 3 B). | Entrance segment drawn by the user, width not checked. | Proposed as a later check (HANDOFF). |
| 3.1.2 | Interior channel minimum max(20 m, 1.5 L), preferred max(25 m, 1.75 L); **fairway minimum 1.5 L, preferred 1.75 L**; wider where currents exceed 0.5 m/s. | Fairway 1.75 × longest boat (D27, from DBW 2005). | Same as the AS preferred width; recorded. |
| 3.2.1, 3.2.3, Table 3.1 | Depth at berths: draught (Table 3.1, e.g. 10 m yacht 1.8 m, power boat 1.0 m) + at least ½ Hs + under-keel clearance max(0.3 m, 10 % of draught) on soft beds or 0.5 m on hard beds, at the lowest tide. | Not checked (one design depth, D16). | Proposed as a later check (HANDOFF). |
| 3.3.2, Table 3.2 | Clear berth width between fingers: **single berth beam + 1 m, double berth 2 × beam + 1 m** (boats up to 20 m; + 1.5 m above); Table 3.2 gives design beams by length (e.g. 6 m 2.8 m, 10 m 4.0 m, 12 m 4.4 m). For alongside berths 0.2 L up to 3.0 m between boats. | 0.5 m per boat (owner D39). | Owner kept 0.5 m, user may enter more (D43). With two boats per bay the tool's 2 × (beam + 0.5) equals the AS double berth exactly; for single berths (Y-booms) AS gives + 1.0 m. |
| 3.3.3, 4.8.2.1 | Mooring piles between the boats of a double berth may be needed where waves or wake exceed 300 mm; consider them where the 50-year head sea exceeds 0.4 m. | — | Shown in the wave screening (D47). |
| 3.5 | Walkways at least 1.5 m wide; 1.8 m when longer than 100 m, 2.4 m when longer than 200 m; clear width not less than the gangway's. **Fingers at least 0.8 L unless a pile is at the end**; finger width 900 mm uniform or tapered to at least 600 mm; at least three mooring points along each side of a floating berth. | Finger length ratio 0.8 (SPEC assumption); width 0.8 m. | Ratio now sourced; walkway width checked (step 11). Marinetek's steel fingers are 0.7 m wide (§9.12), between the two AS widths. |
| 3.6, Table 3.3 | Clear gangway width by berths served: ≤ 2: 0.7 m, ≤ 10: 0.9 m, ≤ 60: 1.2 m, ≤ 120: 1.5 m, more: 1.8 m. Slope at most **1:3.5** (1:3 for private pontoons), taken *"at a water level of CD"* (the lowest); handrails on both sides for unrestricted access. | Gangway count only (I51). | Width and slope checks with the shore gangways (D49, step 8). |
| 4.1 | Strength limit-state loads for a **1 in 50 year** return period for wind, wave, surge and flooding. | 50-year waves in the screening; design wind 22 m/s (basic wind, 50-year). | Consistent. |
| 4.2 | Suggested combination for the marina: wind + 1.5 × current + 1.5 × wave + 1.5 × vertical wave effect (limit states). | Service loads with safety factors on chains and anchors (UFC 4-159-03, I55). | The tool keeps service loads; the AS load factors are not applied (D45). |
| 4.7, Table 4.1, 4.12 | Floating live load 3.0 kPa; flotation 3.0 kPa (unrestricted) with 50 mm reserve buoyancy; stability load 2.0 kPa; minimum freeboard 50 mm under the worst combination. | Product data (net capacity 5.6 kN/m² for Premier). | Not computed (product property). |
| 4.8.2.1, Table 4.2 | 'Good' wave climate, Hs: head seas > 2 s 50-year < 0.6 m, 1-year < 0.3 m; **oblique seas > 2 s < 0.4 m / < 0.3 m**; beam seas > 2 s < 0.25 m / < 0.15 m; head and beam seas < 2 s: 1-year < 0.3 m. Excellent × 0.75, moderate × 1.25; *"For vessels of less than 20 m in length, the most severe wave climate should satisfy moderate conditions."* | UFC 4-152-07 Fig. 4-1 (head/beam only, 1 ft, 2 ft, 0.5 ft, 0.8 ft). | AS Table 4.2 is the default criteria set, UFC selectable (D47). |
| 4.8.2.3 | *"In the absence of more specific analysis, all elements of a marina should be designed for a minimum horizontal force of 2 kN/m for the wave criteria given in Table 4.2."* | Anchoring from wind only. | Applied where the screening finds waves (owner D45, step 10). |
| 4.8.2.4 | Waves load the whole length of a structure at once *"when the wave front is parallel to the axis of the structure"*. | — | Used for the direction of the wave load (step 10). |
| 4.8.3 | Steady 30-s wind; q<sub>z</sub> = 0.0006 V² kPa; F = C<sub>D</sub> A q<sub>z</sub>; vessels C<sub>D</sub> bow 0.7–0.9, stern 0.9–1.1, beam 0.9–1.1; Table 4.4 vessel areas (e.g. 10 m yacht head 5 m², beam 15 m²; 10 m motor vessel 7 / 22 m²); full wind on the windward boat, 20 % on the leeward boats. | UFC: p = 1.0 Pa × v² (C<sub>d</sub> 1.6 with ρ 1.25) on the 10-min wind; profile height 0.15 L; leeward 20 %. | **Checked, no change:** with the 30-s wind = 1.26 × the 10-min wind (CEM Figure II-2-1 ratio as coded in `windDurationRatio`, 1.3235 / 1.0501), AS gives 0.6 × 1.26² × 1.0 = 0.95 Pa × v₁₀² beam-on (UFC 1.0) and 0.76 bow-on. The tool's areas equal AS Table 4.4 for yachts (10 m: 15 m² beam, 5 m² head for a 3.3 m beam) but are about 30 % below it for motor vessels (proposed: a boat-type column). |
| 4.8.4 | Currents: in estuaries a minimum design velocity of 1.0 m/s; debris 10 kN/m where flood debris can occur; C<sub>D</sub> hull beam-on 0.6, keel 1.2. | Current 0 by default (sheltered basin). | Recorded; river sites need a current (HANDOFF). |
| 4.9–4.11 | Berthing at ≥ 0.3 m/s; anchorage elasticity; gangway loads from lateral displacement of the pontoon. | Not computed. | Listed as not computed. |
| 5.1.1 (c), (d) | The pontoon system's ability to withstand the wave climate and the need for and type of attenuator. | — | Breakwater proposal (D48). |
| 5.1.2 | *"The marina should allow access from the water without assistance if the freeboard is more than 500 mm."* | Ladders per pier in the BOM (I51). | Premier freeboard 0.56 m > 0.5 m: ladders needed; recorded. |

## 12. Marinetek floating breakwaters (read 2026-11-15)

Brochures on [marinetek.hr](https://www.marinetek.hr/en/brochures-and-specifications/) (modification
date 14.11.2014), read for the breakwater proposal (DECISIONS D48):

- **Breakwater Pontoons 3300, 3800** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Breakwater-3300-3800.pdf)):
  M3316BR / M3320BR 16,05 / 19,90 × 3,3 m (concrete 3,0 m), height 1,0 m, 20,9 / 26,0 t, freeboard 0,55 m,
  joints 2 × 703 kN; M3816BR / M3820BR 16,05 / 19,90 × 3,8 m (3,5 m), height 1,2 m, 31,5 / 39,2 t, freeboard
  0,61 m, joints 2 × 812 kN (*"3800 -series pontoons have middle rubber in joints"*). *"The Marinetek
  Breakwaters without keels work best when the sea wave length is less than 18 m."* *"Mooring with chains
  or Seaflex."*
- **K-series Breakwater 3300K, 4300K, 5300K** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Breakwater-K-3300-4300-5300.pdf)):
  3312BRK / 3316BRK 12,20 / 16,05 × 3,3 m, height 1,8 m, 20,9 / 28,0 t, freeboard 0,55 m; 4320BRK 19,90 × 4,3 m,
  41,1 t; 5320BRK 19,90 × 5,3 m, 52,4 t (freeboard 0,60 m; *"also available with 16,05 m lengths"*); joints
  2 × 812 kN. *"The Marinetek Breakwaters with keels work best when the sea wave lengths is less than 26 m."*
- Both have a diagram **"Wave attenuation capacity, Sheltered sea conditions"**: Ac (%) against Hs (m) and
  L (m) on one shared horizontal axis, with scales for wind 10–20 m/s and effective fetch 1–5 km. The curves
  were digitised for the tool from the brochures' vector drawings rendered at 400 dpi (pixel tracing of
  each curve, axis gridlines located from the drawing; table in `src/engine/breakwater.ts`). Examples: 3300 at
  Hs 0.32 m / L 4.8 m 74 %, at 0.69 m / 12 m 57 %, curve ends at 0.97 m / 17.8 m (25 %); 3800 ends at 1.14 m /
  21.9 m (20 %); 3300K from 77 % (0.30 m) to 23 % (1.07 m / 20.5 m); 4300K from 87 % to 20 % (1.26 m / 26.2 m);
  5300K from 90 % to 29 % (1.29 m / 27.4 m). The brochures do not define Ac; it is read as the reduction of
  the wave height (DECISIONS I93).
- **Premier Pontoons 2700, 3300** ([PDF](https://www.marinetek.hr/wp-content/uploads/2021/07/Premier-pontoons-2700-3300.pdf)):
  M2712PE / M2716PE / M2720PE 12,20 / 16,05 / 19,90 × 2,7 m (concrete 2,4 m), 12,5 / 16,5 / 20,6 t; M3312PE /
  M3316PE / M3320PE × 3,3 m (3,0 m), 15,6 / 20,7 / 25,7 t; height 1,0 m, net capacity 5,6 kN/m², freeboard 0,56 m,
  joints 2 × 322 kN, joint gap 35 mm; *"Premier pontoons can be moored by piles, chain or Seaflex."* (DECISIONS D44.)

## 13. OpenStreetMap shorelines through the Overpass API (2026-11-15)

- **Overpass API** ([overpass-api.de](https://overpass-api.de/), documentation
  [dev.overpass-api.de/overpass-doc](https://dev.overpass-api.de/overpass-doc/en/)): read-only query
  service for OpenStreetMap data. Query language used: `way(around:r, lat1,lon1, lat2,lon2, …)` (elements
  within r metres of a polyline), `rel(bw.set)` (relations having ways of a set as members),
  `way.set(r.rels)` (member ways of relations, limited to a set), `out geom` (ways with coordinates) and
  `out skel` (relations with their member lists). Water is tagged `natural=water` (lakes, ponds, rivers
  with `water=*`), older river areas `waterway=riverbank`, reservoirs `landuse=reservoir`; large lakes are
  multipolygon relations whose islands are inner members; the sea is the land side of `natural=coastline`
  ways (OSM wiki: Tag:natural=water, Tag:natural=coastline, Relation:multipolygon).
- Usage: the main instance is free for moderate use; its guidance is about 10 000 queries and 1 GB of
  data a day per user (OSM wiki "Overpass API", section on public instances). The tool sends one query
  per lookup.
- Licence: OpenStreetMap data © OpenStreetMap contributors, Open Database Licence (ODbL); the tool shows
  the attribution with the lookup.
- From this development environment the main instance reset the TLS connection, so the query is tested
  with mocked answers only (unit tests and the end-to-end test), as Open-Meteo was (§10).
- 2026-11-16: the main instance still resets the connection from the development environment (also a
  plain `HEAD /`). The other public instances listed on the OSM wiki page "Overpass API" (read
  2026-11-16) were not in the environment's allowed hosts; `overpass.private.coffee` (*"Previously known
  as overpass.kumi.systems. Feel free to use our service in any project, there is no rate limit in
  place"*) was added to the environment for a live test, which was not run in this session (the
  session's permission check stopped the request). The tool itself still asks only the main instance.

## 14. Water levels: FMI and SYKE open data (read 2026-11-15)

- **FMI open data** ([opendata.fmi.fi](https://opendata.fmi.fi/wfs), WFS 2.0, CC BY 4.0). Stored query
  `fmi::observations::mareograph::yearly::30year::simple`: *"Yearly water level observations of 30-year normal
  period 1991 - 2020."* Parameters for each mareograph (13 stations from Kemi to Hamina): `WLEVP1YAVG_P30Y_AVG`,
  `_MIN`, `_MAX` (annual means), `WLEVP1YMAX_P30Y_AVG` / `_MAX` (annual maxima), `WLEVP1YMIN_P30Y_AVG` / `_MIN`
  (annual minima), in mm from the theoretical mean water, the same in N2000 (`WLEVN2K…`), and percentiles of the
  hourly levels (`WLEVP1H_P30Y_P001` … `P999`). Example, Helsinki Kaivopuisto: 20 / 977 / 1512 / −594 / −927 mm
  (MW, MHW, HW, MNW, NW); the highest 1 512 mm matches FMI's record of +151 cm (§5 item 8). The `latlon`,
  `bbox` and `maxlocations` parameters did not limit the answer; all stations come back and the nearest is
  chosen. Station names from the same query in `timevaluepair` format (`gml:Point` with `gml:name` and
  `gml:pos`). Answers carry `access-control-allow-origin: *`.
- **SYKE Hydrologiarajapinta 1.1** ([rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.1/odata](https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.1/odata/),
  OData v3, CC BY 4.0): `Suure` 1 = *"Vedenkorkeus"* (cm); `Paikka` = stations (1 754 water-level stations,
  `Tila_Id` 1 *"Jatkuva"*, 2 *"Lopetettu"*), with ETRS-TM35FIN coordinates `KoordErTmPohj` / `KoordErTmIta`,
  lake name `JarviNimi`; `Vedenkorkeus` = daily values (`Aika`, `Arvo`), 500 rows a page with `odata.nextLink`.
  Example: *Porovesi, Iisalmi* (0406100) daily from 1916-08-16 to 1995-12-31 (ended); the new *Paloisjärvi*
  station (4015) has data from 2026 only. Answers carry `access-control-allow-origin: *`.
- **Characteristic levels** HW, MHW, MW, MNW, NW: the Finnish hydrological convention used by SYKE (highest,
  mean high, mean, mean low, lowest water). The tool's reading of them for the anchoring plan is in DECISIONS I95.
