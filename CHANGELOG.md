# Changelog

Notable changes to Marina Layout Planner. Decisions and assumptions behind each change are in
[docs/DECISIONS.md](docs/DECISIONS.md); earlier changes are in the git history and in DECISIONS.

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
