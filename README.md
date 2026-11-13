# Marina Layout Planner

Browser-only tool for preliminary (feasibility-level) marina layout studies.
Specification: [docs/SPEC.md](docs/SPEC.md). Decisions and assumptions: [docs/DECISIONS.md](docs/DECISIONS.md).

> Preliminary geometric study. Not an engineering design. Requires verification by a qualified marina engineer.

**Status:** work in progress (v1 / Phase 1).

## Run

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev        # development server
npm test           # unit tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run build      # type-check + static build into dist/
```
