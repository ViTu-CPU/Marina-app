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
| **AS 3962:2020** *Marina design* (supersedes AS 3962-2001 *Guidelines for design of marinas*) | Australian standard for marinas for vessels up to 50 m: fixed berths, floating pontoon systems, wave attenuators. | **Paid, not available** ([Standards Australia](https://store.standards.org.au/product/as-3962-2020)). Copies of the 2001 and 2020 editions circulate on file-sharing and personal sites; they carry licence headers and appear to be unauthorised, so they were **not used**. |
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
(steel or aluminium); boat booms "4.5–8 m long". Module lengths and prices are not
published. The six Marinetek catalogue PDFs on NauticExpo returned HTTP 403.

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
Part of the price list page was only available as a machine summary; rows marked
*unverified* in the catalogue come from that part.

- Heavy pontoons (pontoon price without the 717 € gangway, € incl. VAT): MDP 2,4×9 m
  7 813 (8,3 t capacity, 9,4 t weight, deck 0,4 m); MDP 2,4×12 m 10 037; HD 2,4×12 m 12 120
  (15,0 t / 15,0 t / 0,54 m); HD 2,4×15 m 14 886 (19,8 t / 17,9 t / 0,56 m). HD: allowed wave
  height 0,5 m, current 1 m/s, boats up to 24 m; MD: wave 0,3 m.
  *"Jäätyminen on sallittua, jään liikkuminen ei"* (freezing allowed, moving ice not).
  Anchoring for HD: chain 20–22 mm, concrete anchors 2000–3000 kg.
- Finger booms ("venepuomit", height above water 0,5 m): 4 m 595; 5 m 628; 6 m 665; 7 m 730;
  8 m 1 125; 9 m 1 202; 10 m 1 436 (with walking deck 874–2 297). Walkable booms 0,7 m
  wide, 1,0 kN/m²: 6 m 2 492; 7 m 2 691; 8 m 3 298; 9 m 3 484; 10,5 m 5 921; 12 m 6 428.
- Anchoring packages: 2 × 1000 kg + 16 mm chain 20 m + 4 × 20 mm shackles = 870 €
  (components 542 + 300 + 28); 2 × 2000 kg + 20 mm 30 m + 4 × 25 mm = 1 574 €;
  2 × 3000 kg + 20 mm 40 m = 2 070 €.
- Gangway 1,2 × 5 m 717 €; shore abutments (maatuki) 487–828 €; power pedestals
  1 416–1 717 € (*unverified*); ladders 301–766 € (*unverified*).
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
These are used for stern-buoy berths (later phase), not for pontoon anchoring.

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
3. **Anchor lines**: pairs of chains crossed under the pier at a spacing along it
   (**assumption**, editable; the crossing practice is described by suppliers but no
   spacing rule was found). Each line carries `H = F / (number of lines resisting that
   direction)`.
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
9. **Comparison with practice.** Suppliers' standard packages: 2 × 1 000 kg and 16 mm chain
   per 8–12 m concrete pontoon, 2 × 2 000–3 000 kg and 20 mm chain for heavy pontoons (Top
   Marine); SF Marina's drawings: 2, 3, 6 and 10 t anchors, most often 2–3 t (Chalmers 2026
   §7.6, 174 anchor legs). With the first defaults (I47) the demo layouts needed about 21 t
   per lateral line on clay (4.5 t of anchors per metre of pier); with the UFC wind geometry
   and the sourced defaults (I54–I56) about 5.6 t per lateral line on clay and 3.0 t on sand
   (1.8 t/m and 1.2 t/m). What remains is mainly the anchor model: a plain block holding by
   friction versus embedded or wedge-shaped anchors (§9.5, DECISIONS I49).
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
  Fig. 4: typical SF Marina layout, four chains from the pontoon corners, splayed outwards by
  an angle θ (12° in the reference case).
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

### 9.6 Vaasa 2020

See §3 (733 €/jm, about 50 000 € per pier, 2 900 € per berth at Gerby 2014).

### 9.7 Savorak (savorak.fi)

Concrete weights (*"Raudoitettu. Päällä nostokahvat ja pohjassa urat."*), € as listed, VAT
status not stated on the product page: 300 kg 126; 600 kg 205; 800 kg 270; 1 000 kg 310
(1 190 × 1 190 × 320 mm); 1 500 kg 435; 2 000 kg 550; 2 400 kg 660; 3 000 kg 790
(1 190 × 2 390 × 460 mm). Chain *"DIN 763 (5685C)"* hot-dip galvanised, breaking strength
10 mm n. 4 t … 22 mm n. 19 t (same figures as Laatulaituri), sold in 7.5/15/30 m lengths
(e.g. 20 mm 30 m 1 200 €). Packages up to *"koneasennus 2 x 2000 kg"*. Not yet in the price
list ([anchoring](https://savorak.fi/tuoteosasto/ankkurointi/),
[weights](https://savorak.fi/tuotteet/betonipaino-300kg/),
[chain](https://savorak.fi/tuotteet/kettinki-20mm-kuumasinkitty/)).

### 9.8 Still not readable

www.theseus.fi answers with a Cloudflare browser check; the NAVFAC handbook on apps.dtic.mil
is refused by the server ("The request is blocked."); shipmin.gov.in was not tried again.
