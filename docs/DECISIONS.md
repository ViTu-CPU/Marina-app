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
