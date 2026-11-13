# Design decisions and assumptions

Each entry: what was decided, why, and who decided it. "Owner" = decided by the project
owner; "Default" = chosen by the implementer under SPEC §0 (simplest extendable option).

## Decided by the owner (2026-11-13)

| # | Decision | Notes |
|---|---|---|
| D1 | Display: lengths in m with 1 decimal; areas (m²) and counts as integers. | Follows SPEC §3. `CLAUDE.md` updated to match. |
| D2 | **Uniform pier pitch per layout**, derived from the longest boat class with `share > 0`. | SPEC §5.3 makes the pitch depend on the longest boat in the adjacent rows, which is only known after filling. Per-pier size zoning (variable pitch) is postponed to a later strategy. Known cost: wastes water when the mix contains few large boats. |
| D3 | `BoatClass.share` is the target fraction of the **berth count**. It is a target, not a hard constraint; the deviation from the target mix is reported in the stats. | An objective such as "Max capacity" must not fill everything with the smallest class. |
| D4 | Strategy D (shore-parallel pier): the main pier runs **along the shoreline, touching it**, with fingers and berths on the water side only. | Satisfies the "every main pier connects to the shoreline" check (SPEC §6) without modelling a gangway. |
| D5 | New parameter `Params.shoreOffset` (m, default 0): distance from the shore end of a pier to the first finger/berth. | Extension of the SPEC §4 data model. |
| D6 | GeoJSON import (SPEC §3.3) and local refinement (SPEC §5) are **not** part of the first working version. | To be revisited once the Definition of Done is met. |
| D7 | `CLAUDE.md` lives in the repository root. | |
| D8 | Static build uses relative asset paths (`base: './'`). | Hosting target not yet chosen. |
| D9 | Work is committed task by task directly to `main`. | |

## Defaults chosen by the implementer

| # | Decision | Why |
|---|---|---|
| I1 | Geometry library: **JSTS**, imported only inside `src/engine/geometryOps.ts` (buffer, union, difference, intersection). `src/engine/geometry.ts` holds the pure vector/polygon maths and predicates with no library dependency. | SPEC §5.1/§6 need polygon buffering. `@flatten-js/core` 1.6.15 has no buffer/offset operation (it is a separate package last published 2023-08). JSTS's bundled type declarations do not cover the operations we use, so the wrapper carries its own narrow typings. |
| I2 | Undo/redo is a hand-written snapshot history (past / present / future) over the project document only. | View state (pan, zoom, active tool) must not be undoable; keeps dependencies small. |
| I3 | No ESLint for now. Gates are `tsc --noEmit` (strict) and the test suite. | `typescript-eslint` declares peer support for TypeScript `<6.1.0` only (checked on npm 2026-11-13); SPEC does not require a linter. |
| I4 | **Pier head clearance**: a pier ends at least one fairway width before the end of the buildable water on its line, so boats can pass around the head. | Fairways between shore-connected piers are dead ends at the shore; the only way out is around the heads. Conservative when the water limit is only an administrative boundary. |
| I5 | A pier is shore-connected when its shore end is within **0.5 m** of the shoreline (tested at the centre and both corners of the pier end). | Covers drawing inaccuracy and shore edges that are not square to the pier. |
| I6 | Two regions: **structure region** = water − obstacle buffers − `noStructures` − `protected` (piers, fingers); **navigable region** = water − obstacle buffers − `noNavigation` − `protected` (berth slots, fairways). | SPEC §5.1 defines only the first. Boats may lie in a `noStructures` zone, structures may stand in a `noNavigation` zone, nothing may be in a `protected` zone. |
| I7 | **Class mix rule**: each new berth goes to the class that is furthest behind its target share (counts are tracked over the whole layout). Each contiguous run of bays is then re-ordered by boat length, shortest at the shore. | Deterministic; keeps every class within about one berth of its target; satisfies "larger boats at the outer end" (SPEC §5.5). |
| I8 | **Berth corridor**: a bay is kept only if the water from the pier edge out to `row depth + fairway width` is navigable over the bay's full width. Row depth and fairway width are those of the longest active class (D2). | Implements "every slot borders a fairway of the required width" (SPEC §6) inside the generator. |
| I9 | When no bay fits at the current position, the row cursor advances by **0.5 m** and tries again; fallbacks are tried in the order: mix-driven choice → smaller classes → fewer boats in the bay. | SPEC §5.5: "try a smaller boat class; otherwise leave it empty". |
| I10 | A row always ends with a closing finger. The boat rectangle sits at most 0.2 m off the pier edge. | Drawing assumptions; the second does not affect counts. |
| I11 | Round obstacles are approximated by a polygon that contains the circle (never smaller than the object). Buffers use 8 segments per quarter circle. | Errs on the side of keeping clear. |
