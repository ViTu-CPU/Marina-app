# Marina Layout Planner

Browser-only tool for **preliminary (feasibility-level) marina layout studies**. Draw a
water area, shoreline and obstacles, set boat and dock parameters, and the tool computes
several alternative pontoon layouts, counts berths, checks the constraints you set and
compares the alternatives.

> **Preliminary geometric study. Not an engineering design. Requires verification by a
> qualified marina engineer.**
>
> The tool checks geometry against the parameters you enter. "Constraints met" means only
> that. It says nothing about safety or compliance with any standard or regulation.

- Specification: [docs/SPEC.md](docs/SPEC.md)
- How the generator and the checks work: [docs/ALGORITHM.md](docs/ALGORITHM.md)
- Decisions, assumptions and simplifications: [docs/DECISIONS.md](docs/DECISIONS.md)

## Run

Requires Node.js 22.12 or newer. No backend, no database.

```bash
npm install
```

```bash
npm run dev
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run build` | type-check and build static files into `dist/` |
| `npm run preview` | serve the built `dist/` locally |
| `npm run e2e` | build, then run the browser test `e2e/smoke.cjs` (see below) |

`dist/` uses relative paths and can be hosted from any directory of a static web server.

### Publishing to GitHub Pages

`.github/workflows/pages.yml` tests, builds and publishes `dist/` on every push to `main`.
It needs a one-time setting in the repository: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. Until then the workflow only tests and builds, and says so in a
warning. The site is then served at `https://<owner>.github.io/<repository>/`.

Two things to know before switching it on: a GitHub Pages site is **public** even when the
repository is private, and on the GitHub Free plan Pages is available for public
repositories only
([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)).

The browser test needs [Playwright](https://playwright.dev), which is deliberately not a
dependency of this project. To run it, install Playwright and a Chromium separately:

```bash
npm install --no-save playwright
```

```bash
npx playwright install chromium
```

## Features (v1)

**Site**
- Draw the water area, shoreline, entrance, obstacles and restricted zones on a metric
  grid; snapping to vertices and to the water boundary.
- Edit points: move, insert, delete. Measure tool.
- Map background from OpenStreetMap: type coordinates or paste a map link, no file and no
  calibration needed.
- In Helsinki: the City of Helsinki guide map, base map or aerial photo as the background, the
  up-to-date detailed plan (asemakaava) over it, and **"Pick a detailed plan area"**: click a
  plan on the map and use the water within it (plan area ∩ OpenStreetMap water, islands as
  obstacles, a suggested shoreline) or the whole plan area as the water area. Data ja kartat ©
  Helsingin kaupunki, kaupunkimittauspalvelut, CC BY 4.0.
- A checklist of the steps the generator needs (water area, shoreline, entrance, generate); an
  empty project asks whether to study a marina layout or wave conditions only.
- Background image (aerial photo or map screenshot) with two-point scale calibration,
  rotation and opacity.
- Berth types: finger piers (two boats per finger), Y-boom berths (one boat between light
  booms, fingers for boats too long for a boom) or stern-buoy berths (bow to the pier, buoy
  at boat length + factor × water depth), as the project default and per pier side.
- Access pontoons: empty pontoon metres, e.g. in front of a high quay wall; main piers
  start from their edges.
- Two built-in examples: a rectangular basin and an irregular bay.
- Wave screening ("Waves"): wind waves from the longest fetch, its direction, the depth and
  extreme winds (USACE Coastal Engineering Manual II-2), checked against the small craft harbour
  criteria of UFC 4-152-07, with advice on a floating attenuator or a fixed breakwater; wind rose
  and extreme winds by direction from Open-Meteo (ERA5), non-commercial use (preliminary;
  docs/DECISIONS.md D40, D41).

**Inputs**
- Boat classes: length, beam, colour, and either a target share or a target number of
  berths per class (the generator places at most that many; the shortfall is shown).
- Dock parameters: pier and finger widths, finger length ratio, one or two boats per bay,
  clearances, distance of the first berth from the shore, maximum pier length, pier
  direction (automatic or fixed).
- Fairway parameters: width factor, minimum width, obstacle clearance.
- Objective: max capacity, space efficiency, min infrastructure (with a berth target),
  or balanced (with weights).

**Layouts**
- Deterministic generator with five strategies: piers square to the shore (A), every
  other pier (B), other pier directions from a 5° sweep (C), one pier along the shore (D),
  and piers sized by boat class (E), where every row and fairway is as deep and wide as
  its own boats need.
- Berths that cannot be reached from the entrance are left out; the number is shown and
  the layout is marked with a warning instead of "Constraints met".
- Up to five alternatives, ranked by the objective, near-duplicates removed.
- If nothing fits, a message says why.

**Checks** — geometric (errors) and operational (warnings), re-run after every edit:
inside the water, clear of obstacle buffers and zones, no overlaps, boat fits its slot;
fairway in front of every berth, connection to the entrance, pier connected to the shore.

**Results**
- List of alternatives with berth count, pontoon metres and a status badge.
- Comparison table of all statistics, best value per row highlighted.
- Issue list; clicking an issue zooms to the element.
- Select a pier or berth; remove/restore berths; lock a pier; drag a pier along its axis
  or sideways. Edited layouts are marked "Manually edited".
- Fill one side of a pier with one boat class or with the mix, leaving empty metres at the
  shore end; change a berth's boat class; change a pier's length; delete a pier; draw a new
  pier and fill it. Fills never take the fairway that existing berths need.

**Anchoring and cost (preliminary)**
- Piers built from pontoon modules (default Marinetek Premier 2700: 19,90 / 16,05 / 12,20 m, at
  most two shorter modules per pier), 4 m off the shore with a 6 m gangway; berth types finger
  pier, Y-boom, mixed (booms for small boats, fingers for large) and stern buoy.
- Anchoring plan sized after the owner's mooring specification
  ([docs/ANKKUROINTI_MITOITUS_SPEC.md](docs/ANKKUROINTI_MITOITUS_SPEC.md)), shown as a map layer:
  chains from every pontoon joint in an X pattern (towards the head and the shore on both sides),
  two crossed shore chains under each pier's gangway, a crossed pair at the head of main piers of
  10 m or more; AS 3962:2020 loads in four directions (30 s design wind, Table 4.4 windage, minimum
  wave load 2 kN/m, current), the catenary at low and high water, chains with factor of safety 3 and
  concrete anchors by friction (NAVFAC, by seabed) or an optional cohesive model. Concrete anchors of
  **at most 5 t, one per line**; a line that needs more takes a **pile anchor** (length and section by
  geotechnical design, unpriced unless the price list has one). The result view shows the
  specification's disclaimer, the load table, the governing case of every line with its factors of
  safety in colour, and exports a data package for the manufacturer of an elastic mooring.
- Design depth from the mean depth around the site position (EMODnet at sea, SYKE lake depth zones)
  when a position is known, else as entered (default 4 m).
- An access pontoon in front of the shore is held by the piers attached to it and by two shore chains
  at each of its gangways (placed by the user, or one at its middle); without piers it has chains of
  its own on the water side. Fingers longer than 12 m get an end pile (Marinetek; not priced). Each
  stern buoy gets its own sinker, chain and float from Svenska Båtunionen's table by boat weight (or
  Top Marine's, or factor × boat weight), chain at a 1:1 slope. All factors are editable; a
  preliminary sizing, not a mooring design.
- Rescue ladders every 40 m, safety equipment posts every 80 m (Top Marine) and power and water
  pedestals (one socket per berth, four per pedestal, an assumption) on every pier and access
  pontoon: drawn, counted and priced.
- Bill of materials and cost estimate: pontoon modules, fingers, gangways, anchoring
  hardware, fittings, labour and plant, with site overheads, contingency, VAT 25.5 % on the
  total and a range. Every line shows its basis and source. Everything the estimate needs but
  cannot price is listed by name, and the totals then read "excludes N unpriced items". The
  export adds a friction sensitivity table for the block masses. Export as Excel.
- Price list `data/hinnasto.xlsx` (A-Laiturit, Top Marine incl. buoys, Suomen Laatulaituri,
  Savorak, Marinetek estimate, labour and plant rates), editable in Excel; import an edited copy in the app or
  replace the file and rebuild. Columns and parameters: [docs/PRICE_LIST.md](docs/PRICE_LIST.md);
  sources: [docs/RESEARCH.md](docs/RESEARCH.md).

**Site conditions (preliminary, "Waves" window and anchoring parameters)**
- Wave screening by eight direction sectors (N … NW), each with its own fetch (0 = no open
  water), depth and winds; CEM growth, AS 3962-2001 Table 4.2 criteria (head, oblique and beam
  seas; UFC 4-152-07 selectable); every direction that exceeds the criteria is listed.
- Fetches measured from OpenStreetMap water areas (VersaTiles vector tiles), rays every 5° drawn on the
  map; wind climate from ERA5 (Open-Meteo), per sector.
- Proposal of a Marinetek floating breakwater (3300, 3300K, 3800, 4300K, 5300K) from the
  brochures' attenuation diagrams, or "none fits".
- "Print" in the Waves window: a wave screening report of its own (PDF through the browser), also
  without a site or layout drawn — the tool can be used for a wave-climate study alone.
- Water levels from the nearest gauge: FMI mareographs (sea, 1991–2020) or SYKE stations
  (lakes and rivers, last 30 years), extremes and the normal range.
- Advisory checks against AS 3962-2001 (walkways, fingers, berth width, fairway, entrance,
  gangway width and slope, depth at the berths, ladders).

**Files**
- Autosave in the browser; project file export/import (JSON).
- Report of the selected alternative ("Report (PDF)"): map, comparison, inputs, anchoring
  plan, cost estimate and bill of materials, cost parameters and product sources, with the
  disclaimer on every page. It opens the browser's print dialog; choose "Save as PDF".
- DXF export (R12) of the selected alternative: every product as a block, the layout built of block
  inserts and the whole product library beside the drawing (DECISIONS I111).
- PNG export of the canvas and CSV export of the comparison and the berth list. Both
  carry the disclaimer.
- Undo/redo. English and Finnish UI.

## Assumptions behind the default parameters

These defaults are **assumptions for a first study, not values taken from any standard**;
only the fairway factor follows a published guideline (California DBW 2005, a US guideline,
not a Finnish rule). Replace them with values appropriate for the site and the applicable
rules.

| Parameter | Default | Meaning |
|---|---|---|
| Main pier width | 3.0 m | |
| Finger width | 0.8 m | |
| Finger length ÷ boat length | 0.8 | finger length = 0.8 × length of the longer boat beside it, rounded up to a standard length |
| Standard finger lengths | 5, 6, 7, 8, 10, 12 m | Marinetek's standard booms and mooring fingers (docs/DECISIONS.md D29, I70); empty = exact 0.8 × boat length |
| Boats per bay | 2 | two boats between a pair of fingers |
| Beam clearance | 0.5 m | total extra width per boat; owner's choice (D39). Svenska Båtunionen's Hamnhandboken 2016 gives 0.7–0.8 m, 0.2 m less in a sheltered, cramped harbour |
| Length clearance | 0.5 m | extra slot length |
| Fairway width ÷ boat length | 1.75 | fairway = max(minimum, 1.75 × longest boat); 1.75 L<sub>b</sub> is the minimum fairway width without side-ties in California DBW 2005 Table B-2, where L<sub>b</sub> is the longest berth (docs/DECISIONS.md D27) |
| Minimum fairway width | 8.0 m | |
| Fairway at stern buoys | 2.5 × boat length, at least 20 m | between rows of stern buoys, after Svenska Båtunionen's Hamnhandboken 2016 §2.32 (docs/DECISIONS.md D38) |
| Obstacle clearance | 2.0 m | structures and boats keep this far from obstacles |
| Max main pier length | 150 m | |
| First berth from shore | 0 m | |
| Default boat mix | 5.0×2.0 m 30 %, 7.0×2.5 m 35 %, 9.0×3.0 m 25 %, 12.0×3.5 m 10 % | |

Further modelling assumptions (pier head clearance, shore connection tolerance, how the
class mix is followed, and others) are listed in [docs/DECISIONS.md](docs/DECISIONS.md).

## Known limitations

- Strategies A–D use **one pier module for the whole layout**, sized by the longest boat
  class. Strategy E sizes each row for its own boats, but only for piers square to the
  shore; with the shore gap it can miss a pier against a side wall (docs/DECISIONS.md I98).
- No **side-to berths** (finger piers, Y-boom and stern-buoy berths are implemented; the
  engine has an interface for more).
- Stern buoys follow the Swedish boating union's marina handbook (Hamnhandboken 2016) by default;
  published rules of thumb differ by a factor of up to 25 (docs/RESEARCH.md §9.14). Boat weights
  should be entered, otherwise they are estimated from the length.
- Piers are straight, start at the shoreline and keep one fairway width clear at the head.
  No T- or L-heads, no piers from two banks on the same line, strategy D places one pier.
- The search uses fixed steps (5° and 1 m) and no local refinement, so it finds good
  layouts, not provably optimal ones.
- Fairway width is a single rule (factor × boat length, with a minimum). There is no
  turning-basin check.
- One design water depth per project (the mean of open depth data around the position, or entered;
  no soundings). The anchoring plan follows the owner's specification: no wave dynamics, berthing
  loads or ice design (ice loads are reported only), no structural check of pontoons, joints or wall
  fixings, no moment or stiffness distribution between the legs. With the specification's minimum wave
  load and friction-only concrete anchors, the demos' lines need 18–48 t each, so every line takes a
  pile anchor (docs/DECISIONS.md D64): the specification does not hide this difference from practice.
  Only a wave analysis, soil data for the cohesive model or a documented capacity factor brings them
  down. The 30 s design wind has to be entered for the site (the conversion is an open TODO). Nothing
  is checked against RIL 201-3-2013; AS 3962-2001 is used for advisory checks only. The equipment
  spacings are a supplier's recommendation, not a requirement checked by the tool.
- The automatic fetch and the water-level lookups need the VersaTiles tile server, FMI and SYKE
  services in the browser. The fetch is measured from OpenStreetMap water polygons in vector
  tiles (tiles.versatiles.org, a free demo server without guarantees); the position must be in
  the water (I113).
- Costs come from public list prices and stated assumptions (labour output, work-boat
  rate, Marinetek prices); they are a feasibility-stage estimate, not a quote.
- No environmental constraints.
- The water area is one simple polygon. Islands are entered as obstacles.
- Coordinates are local metres. The OpenStreetMap background is a drawn map, not an aerial
  photo, needs an internet connection, and has no place-name search. Its tiles come from
  the OpenStreetMap Foundation's servers, whose
  [usage policy](https://operations.osmfoundation.org/policies/tiles/) allows light use
  only; a widely used deployment would need another tile source. There is no GeoJSON import.
- The Helsinki maps and plans cover the City of Helsinki only and need kartta.hel.fi online. A
  plan area's water comes from OpenStreetMap, not from the plan's own water areas (only in the
  plan image); the plan map is for orientation, the legally binding plan is the plan document.
- Issue messages and a few notices are in English also in the Finnish UI.
- Layout generation runs in a Web Worker (about one second for the examples in the test
  environment); the page stays responsive and the run can be cancelled, but there is no
  progress percentage.
- Browser storage is small. A large background image is not autosaved; it is kept in
  saved project files.
- Made for desktop browsers with a mouse. Touch input is not supported.
- The JavaScript is about 1.06 MB (about 0.31 MB gzipped), split into the app and the
  libraries (React, Konva, JSTS), plus a 0.32 MB worker loaded at the first generation. The
  geometry library is needed on the main thread too (validation after edits), so it is not
  loaded lazily.

## Tests

- Engine: hand-calculated berth counts (finger pier geometry, single piers, a small basin
  end to end), statistics, validation codes, property checks on both examples (inside the
  water, no overlaps, boat inside slot), a nothing-fits case with its diagnostic,
  determinism and a 2 s time limit.
- State: undo/redo, the Regenerate hint, project file round trip and rejection of bad
  files, storage quota fallback, layout edits.
- UI: formatting, view transform, snapping, comparison table, CSV, calibration, and the
  app frame in jsdom.
- `e2e/smoke.cjs`: the Definition of Done in a real browser — draw a site from scratch,
  generate, compare, remove a berth, drag a pier, save, reload, open, export PNG and CSV.

## Project structure

```
src/
  engine/   pure TypeScript, no React, no DOM: model, geometry, generator, validation, scoring
  state/    store, undo/redo, project file, autosave, view transform
  ui/       React components: canvas, tools, panels, exports
  i18n/     en.ts (complete), fi.ts
docs/       SPEC.md, DECISIONS.md, ALGORITHM.md
e2e/        browser smoke test
```

The engine takes plain JSON and returns plain JSON, and is deterministic.

## Next steps

Not started; listed in the specification as later phases.

- More berth patterns: side-to (Y-boom and stern-buoy berths are done).
- Manual editing: rotate and resize piers, add and remove fingers, T- and L-heads.
- Turning-basin check; better optimisation; local refinement of angle and offset.
- GeoJSON import in a projected metric CRS; DXF export.
- Full Finnish localisation, including issue messages.
- Bathymetry and draught per boat class; exposure. See docs/HANDOFF.md for the current list.
