# Research: products, prices, anchoring and cost estimation

Background research for the product catalogue, the bill of materials (BOM), the anchoring
layer and the cost estimate. Collected 2026-11-14 from **public sources only** (owner
decision D15). Every number below is copied from the source named next to it; where a
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
| UFC 4-152-07 *Design: Small Craft Berthing Facilities* (US DoD, 2009, Change 1 2012) | Public-domain design criteria for small-craft marinas incl. floating docks. | Public ([WBDG](https://www.wbdg.org/api/documents/media/b9ae892c-c693-4b3e-b059-461b381480dd/file)); only search excerpts could be read (see §8). |
| California DBW *Layout and Design Guidelines for Marina Berthing Facilities* (2005) | Public US marina layout and design guideline. | Public ([parks.ca.gov](https://demo2.parks.ca.gov/pages/28702/files/Guide05.pdf)); could not be read from this session (§8). |
| Chalmers bachelor's thesis (2026), *Development of a Mooring Calculation Model for Pontoons: Preliminary Dimensioning of Mooring Chains and Concrete Anchors* (Aliprantis, Jarlgren; for SF Marina) | Open-access thesis that builds exactly the kind of preliminary chain/anchor sizing model needed here. | [odr.chalmers.se](https://odr.chalmers.se/items/45ca2ffd-b68f-4e8e-ae23-56df9091c482/full); could not be read from this session (§8). |
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
- Vaasa: average cost of breakwaters and piers in harbour investments 2011–2014
  **733 € / jm**; one pier roughly 50 000 €; removing piers about 100 € / jm
  ([Vaasan kaupunki, Pienvenesatamatoiminnan selvitys 2020](https://www.vaasa.fi/app/uploads/2020/10/7d1d27ad-vaasan-kaupungin-pienvenesatamatoiminnan-jarjestamista-koskeva-selvitys-2020.pdf.pdf);
  search excerpt, the PDF itself could not be read — §8). Price level 2011–2014, not
  indexed.
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

1. **Wind load on a pier** (perpendicular to its axis):
   `F = q · C_d · (A_windward + 0.2 · A_leeward + A_pontoon)`,
   `q = ½ · ρ_air · v²`, ρ_air = 1.25 kg/m³ (recommended value in EN 1991-1-4 §4.5;
   not re-read in this session).
   The 0.2 shielding factor for the leeward row is from UFC 4-152-07 (above).
   Boat lateral area = length × windage height of the class (**assumption**, editable per
   class). C_d = 1.2 (**assumption**). Design wind v: default 22 m/s (Finnish sea areas
   v<sub>b,0</sub>, YM 2007; **assumption** that it applies as the steady design wind).
2. **Current load** on the hulls: `F = ½ · ρ_w · v_c² · C_d · A_underwater`; default
   v_c = 0 (sheltered marina). UFC: above 1 m/s needs a rational analysis → warning.
3. **Anchor lines**: pairs of chains crossed under the pier at a spacing along it
   (**assumption**, editable; the crossing practice is described by suppliers but no
   spacing rule was found). Each line carries `H = F / (number of lines resisting that
   direction)`.
4. **Chain catenary** (chain lying tangent to the bottom at touchdown):
   suspended length `s = √(h² + 2·h·a)`, `a = H / w`, horizontal span
   `x = a · acosh(1 + h / a)`, top tension `T = H + w · h`, with
   `w = m·g·(1 − ρ_w/ρ_steel)` and `h` = depth + high-water level + freeboard to the
   fixing point. Total chain = s + bottom length on the seabed (**assumption**, default
   20 % of s, minimum 2 m) so the pull at the block stays horizontal. The length is
   checked again at low water so the chain does not lift the block.
5. **Chain choice**: smallest catalogue chain with breaking load
   `MBL · ((d − c)/d)² ≥ SF · T`, where c = corrosion/wear allowance on the diameter
   (**assumption**, default 2 mm) and SF = 3.0 (**assumption**; offshore class rules use
   1.67 intact, a vendor quotes 2.0 for recreational marinas — neither is a marina
   standard, so a conservative value is the default).
6. **Concrete block**: submerged weight `W_sub ≥ SF_slide · H / μ`, mass
   `M = W_sub / (g · (1 − ρ_w/ρ_c))`, ρ_c = 2 400 kg/m³ (**assumption**, normal-weight
   reinforced concrete). μ by seabed (**assumptions**, with the only public values found):
   sand 0.6 (0.63 used in [Banuelos-Garcia et al. 2022](https://tethys-engineering.pnnl.gov/sites/default/files/publications/Banuelos-Garcia-et-al-2022.pdf)),
   clay 0.3, rock 0.5; SF_slide = 1.5. The smallest catalogue block with mass ≥ M is chosen.
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

## 8. Sources that could not be read in this session

The session's network allowlist blocked: odr.chalmers.se (Chalmers thesis),
demo2.parks.ca.gov (California DBW guide), www.wbdg.org (UFC 4-152-07), shipmin.gov.in,
www.theseus.fi, www.vaasa.fi, savorak.fi, www.nauticexpo.com; pdf.nauticexpo.com returned
HTTP 403. Where a fact above comes from one of these, it was taken from a search-engine
excerpt and is marked "search excerpt" or attributed accordingly. Reading the Chalmers
thesis and UFC 4-152-07 in full is the first recommended follow-up: they would replace
several **assumptions** in §5 with sourced values.
