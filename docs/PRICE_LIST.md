# Price list (`data/hinnasto.xlsx`)

The bill of materials and the cost estimate read every price, product property, labour
output and percentage from one Excel workbook (DECISIONS D19, D24). The built-in copy is
`data/hinnasto.xlsx`; an edited copy can be imported in the app (Cost estimate → Import
price list). The workbook has three sheets:

- **Instructions** — this schema in short, in English and Finnish (written by the app, never read).
- **Products** — one row per product, labour rate or plant rate.
- **Parameters** — cost and labour parameters.

The first row of Products and Parameters holds the column keys; their order does not matter
and unknown columns are ignored. The import names the sheet, row and column of every problem.

Rules that apply to every row (D18, D19):

- Enter the price **exactly as the source publishes it** and say whether it includes VAT;
  the tool converts it to VAT 0 % with `vat_pct` and adds VAT to the total only.
- Keep `source_url` and `source_date` (YYYY-MM-DD) with every row. A row without a public
  source says so in `note` with **ESTIMATE** or **Assumption**.
- Never invent a price or a capacity: leave the cell empty. An empty price makes the item
  **unpriced** — listed by name and left out of the totals (D62, I117).

## Products

| Column | Type | Meaning |
|---|---|---|
| `id` (required) | text | Unique key of the row; keep it when editing. |
| `category` (required) | text | `pontoon`, `finger`, `gangway`, `chain`, `anchor`, `wall_fixing`, `buoy`, `shackle`, `spring`, `anode`, `cleat`, `ladder`, `power`, `labour`, `plant`, `transport`, `other`. |
| `supplier` | text | Supplier or source. |
| `series` | text | Products of one series are size alternatives (one pontoon width, one boom type). |
| `name` (required) | text | Product name as published. |
| `code` | text | Product code. |
| `unit` (required) | text | `pcs`, `m`, `kg`, `h`, `day`, `lump`. |
| `price_eur` | number | Price per unit as published, €. Empty = no price known. |
| `price_includes_vat` | TRUE/FALSE | Whether the published price includes VAT. |
| `margin_pct` | number | Extra quantity ordered on top of the calculated one (waste, cutting), %. |
| `length_m`, `width_m` | number | Length and width, m (pontoons, fingers, booms, gangways). A gangway's width is taken as its clear width (I109). |
| `weight_kg` | number | Weight, kg. |
| `capacity_kg` | number | Load capacity (buoyancy) as published, kg (pontoons, buoy floats). |
| `freeboard_m` | number | Deck height above water, m. |
| `chain_diameter_mm`, `chain_grade` | number, text | Chain wire diameter and grade. |
| `breaking_load_kn` | number | Minimum breaking load as published, kN. Chains without it are never chosen. |
| `mass_kg_per_m` | number | Chain mass, kg/m. |
| `anchor_mass_kg` | number | Mass of a concrete anchor in air, kg. |
| `anchor_type` | text | **D62.** Anchors only: `block` (concrete weight), `screw`, `pile`, `rock_bolt`, `drag`. Empty = `block`. |
| `capacity_horizontal_kn` | number | **D62.** Anchors other than blocks: holding capacity of **one piece** against horizontal pull as published, kN. Empty = not known: the product is never chosen by itself. |
| `capacity_uplift_kn` | number | **D62.** Anchors other than blocks: holding capacity of one piece against uplift as published, kN. Needed for lines whose chain lifts the anchor. |
| `capacity_basis` | text | **D62.** `friction_model` (blocks: computed from the mass) or `published` (the supplier's figure; then `source_url` and `source_date` are required). |
| `seabed` | text | **D62.** Seabeds the anchor suits, separated by commas: `clay`, `sand`, `rock`. Empty: a block suits any seabed; any other kind is not chosen. |
| `installed_unit_price_eur` | number | **D62.** Price of one piece **installed** (supply and installation), €, with the VAT status of `price_includes_vat`. Empty = `price_eur` is the supply price and the installation is estimated from the parameters below. |
| `shackle_mm` | number | Nominal shackle size, mm. |
| `source_url`, `source_date` | text | Where the price and data come from, and when it was read. |
| `note` | text | What the price includes, unverified data, assumptions. |

The workbook written by the app adds a last column `price_vat0_eur (calculated, not read)`.

### Anchors (D62)

How the anchoring plan uses the anchor rows (docs/ALGORITHM.md, DECISIONS I114–I115):

- **Blocks** are sized by the friction model: the line needs a mass
  m = SF · (H / μ + V) / (g (1 − ρw/ρc)); a block of the list counts when it is no heavier than
  the largest piece to be handled (`maxAnchorMass`) and ⌈m / mass⌉ ≤ `maxAnchorsPerLine`
  (default 1). Their `capacity_*` columns must stay empty.
- **Other kinds** count only with `capacity_basis` = `published`, a horizontal capacity, a
  price and the project's seabed in `seabed`; pieces = ⌈SF · H / capacity_horizontal⌉, and for
  a lifting line also ⌈SF · V / capacity_uplift⌉, at most `maxAnchorsPerLine`. SF is the project
  parameter "Safety factor on published capacities" (`capacitySafetyFactor`, default 1: the
  published figure is taken as a working load — Assumption).
- Per line the **cheapest** that holds is chosen: pieces × (installed price, else supply price
  + the installation estimated from the parameters below).
- When none holds, the line is **INFEASIBLE**: its anchor point is not priced and appears as
  "Anchor point – type and size by geotechnical/mooring design" without a price.

The built-in list has only concrete weights (`block`, `friction_model`). To let the tool
choose a screw anchor or a pile, add a row with the supplier's published capacity, its source
URL and date, the seabeds and a price or quote.

## Parameters

| Key | Default | Meaning | Source |
|---|---|---|---|
| `vat_pct` | 25.5 % | VAT added to the total; converts VAT-inclusive prices. | Finnish general rate. |
| `site_overhead_pct` | 10 % | Site overheads on the subtotal. | Assumption. |
| `contingency_pct` | 15 % | Reserve on the subtotal with overheads. | Assumption. |
| `range_low_pct`, `range_high_pct` | −30 %, +50 % | Range shown around the total. | Assumption (AACE Class 4 as quoted by secondary sources). |
| `gangway_length_m` | 6 m | Gangway length wanted from the shore. | Assumption. |
| `cleats_per_berth`, `ladders_per_pier`, `berths_per_power_pedestal` | 2, 1, 0 | Fittings. | Assumption. |
| `shackles_per_anchor_line`, `springs_per_anchor_line`, `anodes_per_anchor_line` | 2, 1, 1 | Hardware per anchor line. | Assumption / supplier kits. |
| `shackles_per_buoy_line` | 1 | Shackles per stern buoy. | Top Marine buoy packages. |
| `crane_h_per_pontoon`, `transport_h_per_pontoon` | 1 h, 2 h | Crane hours per pontoon module. | Assumption. |
| `crew_h_per_pontoon`, `crew_h_per_finger`, `crew_h_per_gangway`, `crew_h_per_small_item` | 4, 1.5, 3, 0.25 h | Installer hours. | Assumption. |
| `diver_h_per_anchor` | 1 h | **D62.** Diving-team hours per anchor piece and per wall fixing of a shore chain. | Assumption. |
| `diver_h_per_tonne` | 0 h/t | **D62.** Extra diving-team hours per tonne of anchor placed; 0 = not used. | Assumption. |
| `anchors_per_boat_day` | 10 | **D62.** Anchors the work boat carries and lowers in a day; boat days = ⌈anchors ÷ this⌉. | Assumption. |
| `work_boat_max_lift_kg` | 3 000 kg | **D62.** Heaviest single anchor the work boat lifts; heavier anchors are flagged and a crane barge is listed as unpriced. | Assumption. |

`diver_h_per_anchor_line` and `boat_days_per_10_anchor_lines` of older lists are still read
(per anchor) when the new keys are missing, with a note in the estimate.
