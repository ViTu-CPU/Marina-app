# PROJECT: MARINA LAYOUT PLANNER — v1 (simple, browser-only)

## 0. How to read this prompt

- This prompt covers **one deliverable: a working v1 (Phase 1)**. Sections marked *Roadmap* are for architecture awareness only — do **not** implement them now.
- When this prompt conflicts with your own preference, follow this prompt. When something is ambiguous, choose the simplest option that keeps the architecture extendable, and record the decision in `docs/DECISIONS.md`.
- Work in small steps: after each step, run the app, the type checker and the tests, and fix errors before moving on.
- Stop when the Definition of Done (section 10) is met and report back. Do not start Phase 2 on your own.

---

## 1. Goal

A browser-based tool for **preliminary (feasibility-level) marina layout studies**. The user draws a water area, shoreline and obstacles, sets boat and dock parameters, and the tool **computes** several alternative pontoon layouts, counts berths, checks constraints and compares the alternatives.

Primary question the tool answers: *"Roughly how many berths of which sizes fit here, with how many metres of pontoon, and what limits the layout?"*

It is **not** a design or compliance tool. Every output must carry the note: *"Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer."*

---

## 2. Technical constraints (fixed)

- **Frontend only, no backend, no database.** Runs with `npm install && npm run dev`, deployable as static files.
- React + TypeScript (strict) + Vite. Tailwind CSS for styling.
- Canvas: **Konva / react-konva**.
- State: a single store (e.g. Zustand) with **undo/redo** via immutable snapshots.
- Geometry: a **planar (Cartesian) geometry library**, e.g. JSTS (JTS port: buffer, intersection, difference, contains) or flatten-js. **Do not use Turf.js for measurements or clearance checks** — Turf assumes WGS84 lon/lat coordinates, and all calculations here are in local metres.
- Tests: Vitest.
- Persistence: browser localStorage + **JSON project file export/import**.
- Localization: put all UI strings in `src/i18n/en.ts` and `src/i18n/fi.ts` from the start (simple key → string dictionary). English is complete; Finnish may be partial.

### Architecture rule

```
src/
  engine/        # pure TypeScript, NO React, NO DOM. All geometry, generation, validation, scoring.
    model.ts       # data types (section 4)
    geometry.ts    # wrappers around the geometry library
    generate.ts    # layout generator (section 5)
    validate.ts    # constraint checks (section 6)
    score.ts       # statistics and objectives (section 7)
    __tests__/
  state/         # store, undo/redo, persistence
  ui/            # React components (panels, canvas, tools)
  i18n/
docs/
  DECISIONS.md   # design decisions and assumptions
  ALGORITHM.md   # short description of generator + validation
```

The engine must be callable from a test with plain JSON in and plain JSON out. Deterministic: same input → same output (use a seeded RNG if randomness is ever used).

---

## 3. Units and coordinates

- Local Cartesian coordinate system, **metres**, x = east, y = north. Angles in degrees, clockwise from north in the UI, radians internally.
- Display: lengths in m (1 decimal), areas in m² (integer), counts as integers.
- Site input options in v1:
  1. Draw directly on an empty metric grid.
  2. **Background image** (aerial photo or map screenshot) with **two-point scale calibration** (user clicks two points and enters the real distance in metres) and optional rotation.
  3. *Optional if quick:* GeoJSON import in a **projected metric CRS** (e.g. EPSG:3879 ETRS-GK25, EPSG:3067 ETRS-TM35FIN). Translate coordinates to a local origin; store the original CRS code and offset in the project for later.
- Never compute distances or areas from lat/lon.

---

## 4. Data model (implement in `engine/model.ts`)

Use these as a starting point; extend if needed and document changes.

```ts
type Vec2 = { x: number; y: number };
type Polygon = Vec2[];          // closed ring, counter-clockwise, no repeated end point
type Polyline = Vec2[];

interface Site {
  water: Polygon;                // permitted planning water area
  shoreline: Polyline;           // where piers may connect to land
  entrance: { a: Vec2; b: Vec2 } // line segment where boats enter/leave the marina
  obstacles: Obstacle[];
  zones: RestrictedZone[];
}
interface Obstacle { id: string; kind: 'pier' | 'rock' | 'island' | 'structure' | 'other'; shape: Polygon; }
interface RestrictedZone { id: string; kind: 'noStructures' | 'noNavigation' | 'protected'; shape: Polygon; }

interface BoatClass { id: string; name: string; length: number; beam: number; color: string; share: number; } // share = target fraction 0..1

interface Params {
  mainPierWidth: number;         // default 3.0
  fingerWidth: number;           // default 0.8
  fingerLengthRatio: number;     // finger length = ratio × boat length, default 0.8 (assumption)
  boatsPerBay: 1 | 2;            // 1 = finger between every boat, 2 = two boats share a bay
  beamClearance: number;         // total extra width per boat in a berth, default 0.5
  lengthClearance: number;       // extra length per berth, default 0.5
  fairwayFactor: number;         // fairway width = factor × longest adjacent boat length, default 1.5
  fairwayMin: number;            // absolute minimum fairway width, default 8.0
  obstacleClearance: number;     // min distance structures/boats ↔ obstacles, default 2.0
  maxMainPierLength: number;     // default 150
  orientation: 'auto' | number;  // pier direction; 'auto' = generator searches
}

interface MainPier { id: string; start: Vec2; end: Vec2; width: number; locked: boolean; origin: 'generated' | 'manual'; }
interface Finger   { id: string; pierId: string; shape: Polygon; }
interface Berth    { id: string; pierId: string; side: 'left' | 'right'; boatClassId: string;
                     slot: Polygon;      // the water rectangle reserved for the boat (incl. clearances)
                     boat: Polygon;      // simplified top-view boat rectangle inside the slot
                     removed: boolean; issues: Issue[]; }
interface Fairway  { id: string; shape: Polygon; requiredWidth: number; }

interface Issue { severity: 'error' | 'warning'; code: string; message: string; elementId?: string; }

type Feasibility = 'geometricFail' | 'geometricOK' | 'operationalOK';

interface Layout {
  id: string; name: string; strategy: string;
  piers: MainPier[]; fingers: Finger[]; berths: Berth[]; fairways: Fairway[];
  feasibility: Feasibility; issues: Issue[]; stats: Stats; score: number;
  modified: boolean;              // true once the user edits it manually
}
```

**Berth geometry (finger pier type, v1):**
along each side of a main pier, bays repeat as `finger | slot | (slot) | finger | …`.
- Slot width = boat beam + beamClearance. Bay width = boatsPerBay × slot width.
- Slot length = boat length + lengthClearance, measured perpendicular to the main pier.
- Finger length = fingerLengthRatio × boat length of the adjacent boats (use the longer one).
- The boat rectangle is centred in the slot, touching the pier side minus a small gap.

Design the berth code behind an interface (`BerthPattern`) so that other mooring types can be added later without touching the generator: **side-to berths (kylkipaikka)**, **Y-boom berths (aisapaikka)** and **bow-to with stern buoy (peräpoiju)** — the last two are common in Finnish marinas.

---

## 5. Layout generator (systematic, not random)

Implement a **deterministic parametric search** in `engine/generate.ts`:

1. **Feasible region** = `water` − (obstacles buffered by `obstacleClearance`) − `noStructures` zones.
2. **Candidate orientations**: if `orientation = 'auto'`, test angles perpendicular to the main shoreline direction, parallel to the longest water-boundary edges, and a sweep in 5° steps (0–175°). Otherwise use the given angle.
3. For each orientation, conceptually rotate the site so piers run along the y-axis. The repeating cross-section is
   `fairway | berths | main pier | berths | fairway | berths | main pier | berths | …`
   with **pier pitch** = mainPierWidth + 2 × slot length + fairway width (fairway width = max(fairwayMin, fairwayFactor × longest boat in the adjacent rows)).
4. **Sweep the lateral offset** of the first pier across one pitch in 1 m steps. For each offset, intersect each pier centreline with the feasible region; keep the segment that **touches the shoreline** (shore-connected), clipped to `maxMainPierLength`. Skip piers shorter than one bay.
5. **Fill both sides** of each pier with bays from the shore end outwards. Assign boat classes to meet the target `share` mix as closely as possible; put larger boats at the outer (fairway/entrance) end. Keep a bay only if its slot and fingers pass the checks in section 6; otherwise try a smaller boat class; otherwise leave it empty.
6. **Build fairways** as the water strips between facing berth rows and around pier heads, and check them (section 6).
7. **Strategies** — produce at least these layout families, each with its own best offset/orientation:
   - A: piers perpendicular to shore, max count of piers
   - B: piers perpendicular to shore, fewer and longer piers (every other pitch)
   - C: best orientation found by the angle sweep
   - D: single shore-parallel main pier with fingers on the water side (for narrow sites)
8. Return the **top N (default 5) layouts** ranked by the selected objective, removing near-duplicates (same berth count and pier count within 2 %).

If time allows, add a simple **local refinement** (coordinate descent over angle ±2°, offset ±0.5 m) on the top candidates. Document anything not implemented.

If no layout with ≥ 1 berth can be produced, return an empty result with a **diagnostic message**, e.g. "Water area narrower than one pier module (needs X m, available Y m)", "No pier can reach the shoreline", "All candidate berths intersect obstacles".

---

## 6. Validation (`engine/validate.ts`)

Run on every generated layout **and after every manual edit**. Each check produces `Issue`s linked to element ids.

Geometric (→ `geometricFail` if any error):
- All piers, fingers and boat slots lie inside `water`.
- No structure intersects an obstacle buffer or a `noStructures`/`protected` zone.
- No overlaps between piers, fingers, slots (tolerance 1 cm).
- Each boat rectangle lies inside its slot.

Operational (→ `operationalOK` only if all pass; otherwise `geometricOK` with warnings):
- Every slot borders a fairway of the required width.
- Fairways do not overlap `noNavigation` zones or obstacle buffers.
- **Fairway network is connected to the entrance segment** (union of fairway polygons + free water touching the entrance contains a path to every berth row).
- Every main pier connects to the shoreline.

Never label anything "safe" or "compliant". `operationalOK` means only "meets the constraints configured by the user".

---

## 7. Statistics and objectives (`engine/score.ts`)

Stats per layout: total berths; berths per boat class; main pier length; finger length; total pontoon length; pontoon deck area (m²); water area occupied by marina (berths + fairways, m²); remaining free water (m²); berths per 1,000 m² water; pontoon metres per berth; number of issues by severity.

Objectives (user selects one; implement each as a pure function `Layout → number`):
- **Max capacity**: total berths.
- **Space efficiency**: berths per 1,000 m² of water area.
- **Min infrastructure**: pontoon metres per berth, subject to berths ≥ user target (otherwise heavily penalised).
- **Balanced**: weighted sum of normalised capacity, inverse pontoon length and free fairway area; weights editable in the UI, default equal.

Layouts with `geometricFail` are never ranked above valid ones.

---

## 8. User interface (v1)

Layout: left sidebar (inputs), central canvas, right sidebar (results), top toolbar.

- **Toolbar**: New, Open (JSON), Save (JSON), Undo, Redo, Generate, Export (PNG, CSV), language toggle EN/FI.
- **Left sidebar**: project name; site tools (draw water polygon, draw shoreline, set entrance, draw obstacle, draw restricted zone, load/calibrate background image); boat classes table (add/edit/delete, length, beam, target share %, colour); dock parameters; fairway parameters; objective selector.
- **Canvas**: pan (drag / space+drag), zoom (wheel, to cursor), snap to vertices, metric grid and scale bar, vertex editing for polygons, a **measure tool** (distance between two clicks). Layer toggles: water, shoreline, obstacles, zones, piers, fingers, slots, boats, fairways, issues.
  - Styles: piers dark grey, fingers lighter grey, slots outlined, boats filled with the class colour, fairways light blue hatched, obstacles dark, restricted zones red hatched, issues drawn as red outlines with an icon.
- **Right sidebar**: list of alternatives (name, berths, pontoon m, feasibility badge); a **comparison table** of all stats side by side with the best value per row highlighted; issue list for the selected layout (click → zoom to element); "Mark as preferred".
- **Selection & minimal editing in v1**: click a pier or berth to see its properties; **remove/restore individual berths**; **lock a pier** and **drag a pier** along its axis or laterally, with immediate re-validation and stats update. Edited layouts get `modified = true` and a "Manually edited" badge.
- Results update immediately after any parameter change that does not require regeneration; parameters that do require it show a "Regenerate" hint.

---

## 9. Built-in demo projects

Ship two demo projects that load from a "Load example" menu, so the tool can be tried without drawing:
1. **Rectangular basin**, 220 m × 140 m, shoreline along the south edge, entrance at the north-east corner, one rock obstacle (circle Ø 12 m approximated as a polygon).
2. **Irregular bay**, an L-shaped or concave water polygon with an existing pier as obstacle and one `noNavigation` zone.

Default boat mix: 5.0×2.0 m (30 %), 7.0×2.5 m (35 %), 9.0×3.0 m (25 %), 12.0×3.5 m (10 %).

---

## 10. Definition of Done for v1

- [ ] `npm install`, `npm run dev`, `npm run build`, `npm test` and `tsc --noEmit` all succeed without errors.
- [ ] Both demo projects generate **at least 3 distinct alternatives** in under 2 seconds on a normal laptop.
- [ ] A user can draw a new site from scratch, generate layouts, compare them, remove berths, move a pier, see issues update, save to JSON, reload it, and export PNG and CSV.
- [ ] Engine tests include:
  - at least 5 cases with **hand-calculated expected berth counts** (e.g. a single straight pier in a rectangle; document the calculation in the test);
  - property checks on demo projects: no overlaps, everything inside water, every boat inside its slot;
  - a case where nothing fits, asserting the diagnostic message;
  - determinism: running the generator twice gives identical JSON.
- [ ] `README.md` with: how to run, feature list, assumptions behind default parameters (marked as assumptions, not standards), known limitations, and next steps.
- [ ] The disclaimer from section 1 is visible in the UI and included in exports.

---

## 11. Out of scope for v1 (*Roadmap*, design for it but do not build)

- Phase 2: more berth patterns (side-to, Y-boom, stern buoy), rotate/resize piers manually, add/remove fingers, T- and L-shaped pier heads, turning basin check, better optimisation (e.g. simulated annealing over pier positions), DXF export.
- Phase 3: PDF report, full Finnish localisation, project versioning.
- Phase 4: bathymetry (depth vs. draught per boat class), real geographic coordinates and map tiles, wind/wave exposure, environmental restrictions, cost estimation, manufacturer-specific pontoon modules, backend (e.g. Python/Shapely) if computation outgrows the browser.

---

## 12. Final report

When done, report: how to run, what works, what was simplified and why (link to `docs/DECISIONS.md`), known limitations, test results, and recommended next steps.
