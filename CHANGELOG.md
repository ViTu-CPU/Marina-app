# Changelog

Notable changes to Marina Layout Planner. Decisions and assumptions behind each change are in
[docs/DECISIONS.md](docs/DECISIONS.md); earlier changes are in the git history and in DECISIONS.

## 2026-11-24 — Piers in more than one direction (D67)

### Added
- **Strategy F – Mixed directions:** where the shore turns (an L-shaped bay, a corner), the layout
  can have groups of piers in different directions, each square to its own stretch of shore. The
  groups share fairways and every berth must be reachable from the entrance; F is ranked with the
  other alternatives. In the L-shaped example: 260 berths against 223 for one direction.

## 2026-11-24 — Anchors never on land (D66)

### Changed
- An anchor is never placed on land (beyond the shoreline or on an island): the chain is fixed to the
  shore wall where it meets it, or, by choice, goes to a concrete block at the foot of the wall on a
  shorter chain. Anchors beyond other edges of the water area get a warning to draw the shoreline.

## 2026-11-24 — Start map (U36)

### Changed
- A new project opens on **OpenStreetMap at the centre of Helsinki** (Senate Square); draw the site
  straight on it. Loading a background image replaces the map.

## 2026-11-24 — Wave point clicked on the map (U35)

### Added
- Waves, step 1: **"Pick on the map"** sets the point of the wave screening with a click on the map;
  the point shows as a cross-hair and in the position field.

## 2026-11-23 — Easier UI; City of Helsinki maps and detailed plans (U30–U34)

### Added
- **City of Helsinki open map data (U34):** guide map, base map or aerial photo as the background,
  the up-to-date detailed plan over it, and "Pick a detailed plan area": a click on the map finds
  the plan in force there and makes its water the site (plan area ∩ OpenStreetMap water, islands as
  obstacles, a suggested shoreline), or the whole plan area. CC BY 4.0, attribution on the map.
- An empty project asks: marina layout or wave conditions only (U32).
- A checklist of what the generator needs in the Site section (U31).

### Changed
- **Waves** is a panel beside the map instead of a window over it; its steps are numbered from the
  position on, the result comes first, method texts are folded (U30, U32). "Show on the map" puts a
  map under a typed position.
- The four exports are one **Export** menu (U31).
- The results are in three tabs: Alternatives, Compare, Anchoring & cost; map-layer presets
  (Layout, Anchoring, Waves, All) follow the tab and the wave panel; the app starts with the
  Layout preset (U33).
- The amber status reads "Geometry OK, warnings", and each status explains itself (U31).

## 2026-11-23 — Wave screening report from the Waves window (U29)

### Added
- **"Print" in the Waves window**: a printable wave screening report of its own (choose "Save as PDF"),
  also **without a water area or a layout**, so the tool serves a wave-climate study alone. It has the
  position, the result in one line, a fetch figure by direction (with the map rays), the sources of the
  fetches and depths, the sector table, criteria, advice and floating breakwater, the wind rose with the
  extreme winds by direction and the FMI station beside ERA5, and the disclaimer on every page.

### Changed
- The layout report and the wave report share the wave screening section, the print styles and the
  page frame (`src/ui/export/htmlDoc.ts`, `src/ui/export/waveReport.ts`); the layout report itself is unchanged.

## 2026-11-19 — Mooring sizing after the owner's specification; site depth; harbour equipment (D63–D65)

### Changed
- **The anchoring is sized after the owner's specification**
  ([docs/ANKKUROINTI_MITOITUS_SPEC.md](docs/ANKKUROINTI_MITOITUS_SPEC.md), D64): AS 3962:2020 loads
  in four directions, equal tension on the legs anchored against the load, the catenary at low and high
  water, chains with factor of safety 3.0, concrete anchors by friction (NAVFAC μ by seabed, FoS 1.5)
  or the optional cohesive model; the practical rules as warnings. Its Appendix B tests pass.
- **Concrete anchors of at most 5 t, one per line, else a pile anchor** at the end of the chain (D63).
  Screw anchors, rock bolts, drag anchors and the concrete wedge are gone. The demos' lines now all take
  pile anchors (18–48 t needed by friction on medium clay); the pile anchors are unpriced unless the
  price list has one.
- **Access pontoon**: held again by the piers attached to it (owner's D28) together with its shore
  chains; it no longer has chains of its own running into the berths when piers start from it (I122).
  The load table lists what the piers carry for it.
- Seabeds are the specification's eight NAVFAC types (old files: clay → medium clay, sand → fine/medium
  sand). The breakwater shelter and estimated wave heights of the first D63 step are replaced by the
  specification's minimum wave load.

### Added
- The specification's inputs (slope, cohesive model, capacity factor with its basis, 30 s design wind,
  wave line load and minimum, current, draught, extra static load, ice reported only, winter use, uneven
  factor, boat type) and results: its disclaimer, the status, the smallest factors of safety in colour,
  the load table, the governing case of every line, and a JSON data package for the manufacturer of an
  elastic mooring. The workbook gets a Loads sheet and the governing case per line.
- **Design depth from the mean depth around the site position** (I121): EMODnet at sea, SYKE lake depth
  zones, eight 200 m rays; runs by itself when a position is known; a depth typed in turns it off.
- **Rescue ladders, safety equipment posts and power and water pedestals** (D65): ladders every 40 m
  and posts every 80 m (Top Marine), pedestals one socket per berth and four per pedestal (assumption);
  drawn on their own layer, in the bill of materials, the DXF and the report. Price-list parameters
  `ladder_spacing_m`, `safety_post_spacing_m`, `berths_per_power_pedestal` (now 4) and category
  `safety_post` with Top Marine's post (1 265 € incl. VAT).
- Price-list ESTIMATE rows for 4 000 and 5 000 kg concrete anchors (Savorak's price per kg).

### Removed
- `ladders_per_pier` (replaced by `ladder_spacing_m`); the UFC wind model, the Hm0 wave loads and the
  wedge anchors of the anchoring.

## 2026-11-18 — Anchor sizing no longer multiplies weights (D62)

A test project exported 1 828 concrete weights of 3 000 kg (11–12 per line on the main piers,
about 5 500 t and 44 % of the subtotal): the required mass of a line was split into
⌈mass / 3 000 kg⌉ pieces. Now:

### Changed
- **At most one anchor per line** (`maxAnchorsPerLine`, default 1; 2 only as the user's tandem
  choice, with a warning). The required mass is never split over more anchors, and the line
  spacing is not changed to make blocks fit.
- A line that no anchor of the price list holds is **INFEASIBLE**, with its reason (e.g.
  "block: needs 33 922 kg, max product 3 000 kg"). Its anchor point is not priced; the bill of
  materials gets one row "Anchor point – type and size by geotechnical/mooring design" without
  a price. Its chain and hardware are still priced.
- Diving and work-boat time scale with **anchor pieces**: price-list parameters
  `diver_h_per_anchor`, `diver_h_per_tonne`, `anchors_per_boat_day` and `work_boat_max_lift_kg`
  replace `diver_h_per_anchor_line` and `boat_days_per_10_anchor_lines` (older lists still read,
  with a note). All new parameters are Assumptions.
- A gangway narrower than AS 3962 Table 3.3 asks for is no longer priced with a narrower
  product; it is listed as unpriced with the width it needs.
- "Lines without a price (not in the totals)" counts **every unpriced item** (breakwaters,
  INFEASIBLE anchor points, products missing from the price list, work without a rate), and the
  summary lists them by name. With unpriced items the total rows read
  "Total VAT 0 % (excludes N unpriced items, see list)".
- Breakwaters appear in the bill of materials as rows without a price.

### Added
- Price-list columns `anchor_type` (block | screw | pile | rock_bolt | drag),
  `capacity_horizontal_kn`, `capacity_uplift_kn`, `capacity_basis` (friction_model | published),
  `seabed` and `installed_unit_price_eur`. Blocks are sized by the friction model; other kinds
  only by a published capacity with source URL and date, never automatically without one.
  Schema: [docs/PRICE_LIST.md](docs/PRICE_LIST.md).
- Anchoring parameter "Safety factor on published capacities" (`capacitySafetyFactor`,
  default 1: published figures taken as working loads, Assumption).
- Summary row "Anchoring status: X lines OK, Y lines INFEASIBLE"; anchor-lines sheet columns
  `anchor_type`, `status`, `status_note`.
- Friction sensitivity table (μ 0.2 / 0.3 / 0.5) in the bill-of-materials workbook and the
  report, with the note "Gravity block capacity in soft clay is highly uncertain; requires
  geotechnical data."
- Regression test on a stand-in of the reported project.

### Unchanged
- Wind, wave and line loads (`horizontal_kn`, `uplift_kn`) and the prices and sources of the
  existing price-list rows.

### Note
- With the default clay friction 0.3, every line of the two demo projects needs 3.4–9.1 t and is
  now INFEASIBLE with the built-in price list (heaviest block allowed 3 000 kg).
