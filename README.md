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
- Background image (aerial photo or map screenshot) with two-point scale calibration,
  rotation and opacity.
- Two built-in examples: a rectangular basin and an irregular bay.

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

**Files**
- Autosave in the browser; project file export/import (JSON).
- PNG export of the canvas and CSV export of the comparison and the berth list. Both
  carry the disclaimer.
- Undo/redo. English and Finnish UI.

## Assumptions behind the default parameters

These defaults are **assumptions for a first study, not values taken from any standard or
guideline**. Replace them with values appropriate for the site and the applicable rules.

| Parameter | Default | Meaning |
|---|---|---|
| Main pier width | 3.0 m | |
| Finger width | 0.8 m | |
| Finger length ÷ boat length | 0.8 | finger length = 0.8 × length of the longer boat beside it |
| Boats per bay | 2 | two boats between a pair of fingers |
| Beam clearance | 0.5 m | total extra width per boat |
| Length clearance | 0.5 m | extra slot length |
| Fairway width ÷ boat length | 1.5 | fairway = max(minimum, 1.5 × longest boat) |
| Minimum fairway width | 8.0 m | |
| Obstacle clearance | 2.0 m | structures and boats keep this far from obstacles |
| Max main pier length | 150 m | |
| First berth from shore | 0 m | |
| Default boat mix | 5.0×2.0 m 30 %, 7.0×2.5 m 35 %, 9.0×3.0 m 25 %, 12.0×3.5 m 10 % | |

Further modelling assumptions (pier head clearance, shore connection tolerance, how the
class mix is followed, and others) are listed in [docs/DECISIONS.md](docs/DECISIONS.md).

## Known limitations

- Strategies A–D use **one pier module for the whole layout**, sized by the longest boat
  class. Strategy E sizes each row for its own boats, but only for piers square to the
  shore, and its search over start positions is coarser (2 m) than that of A–C (1 m).
- Only **finger-pier berths**. Side-to, Y-boom and stern-buoy berths are not implemented
  (the engine has an interface for them).
- Piers are straight, start at the shoreline and keep one fairway width clear at the head.
  No T- or L-heads, no piers from two banks on the same line, strategy D places one pier.
- The search uses fixed steps (5° and 1 m) and no local refinement, so it finds good
  layouts, not provably optimal ones.
- Fairway width is a single rule (factor × boat length, with a minimum). There is no
  turning-basin check.
- **No depth data**, wind, waves, currents, ice, mooring loads, costs or environmental
  constraints.
- The water area is one simple polygon. Islands are entered as obstacles.
- Coordinates are local metres. The OpenStreetMap background is a drawn map, not an aerial
  photo, needs an internet connection, and has no place-name search. Its tiles come from
  the OpenStreetMap Foundation's servers, whose
  [usage policy](https://operations.osmfoundation.org/policies/tiles/) allows light use
  only; a widely used deployment would need another tile source. There is no GeoJSON import.
- Issue messages and a few notices are in English also in the Finnish UI.
- Layout generation runs on the main thread; the page is unresponsive while it runs
  (about one second for the examples in the test environment).
- Browser storage is small. A large background image is not autosaved; it is kept in
  saved project files.
- Made for desktop browsers with a mouse. Touch input is not supported.
- The JavaScript bundle is about 0.9 MB (0.27 MB gzipped), mostly the geometry library.

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

- More berth patterns: side-to, Y-boom, bow-to with stern buoy.
- Manual editing: rotate and resize piers, add and remove fingers, T- and L-heads.
- Turning-basin check; better optimisation; local refinement of angle and offset.
- GeoJSON import in a projected metric CRS; DXF export; PDF report.
- Full Finnish localisation, including issue messages.
- Bathymetry and draught per boat class; map tiles; exposure; cost estimation.
