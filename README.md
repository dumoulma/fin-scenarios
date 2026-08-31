# fin-scenarios

A financial-life modeling tool: build a 10+ year Scenario (income, spending,
policies like "max the 401(k) first, then the mortgage"), run it through a
monthly-tick calculation engine, and see the resulting net worth trajectory.

## Layout

- **`core/`** — the domain model and calculation engine (plain TypeScript, no
  UI dependency). `Scenario`/`Trajectory`, `Policy` priority-ordered
  reconciliation, Asset Type behaviors (equity, cash, real estate, Whole Life
  insurance), and a Kubera portfolio importer for building a real Initial
  State from a real account.
- **`ui/`** — a React timeline editor wired to the engine (drag to resize a
  Scenario, insert/delete, compare Trajectories).
- **`docs/`** — design docs. Start with `docs/architecture.md` (the
  architectural vision) and `docs/domain/CONTEXT.md` (authoritative domain
  terminology — Asset, Asset Type, Holding Context, Policy, Scenario,
  Trajectory). The rest are point-in-time design/review docs and work orders
  from earlier phases of the project.
- **`prototypes/`** — early throwaway explorations that predate `core/` and
  `ui/`. Superseded; kept for history, not maintained.

## Getting started

```sh
cd core
npm install
npm test          # vitest run
npx tsc --noEmit  # type check
```

```sh
cd ui
npm install
npm run dev        # local dev server
```

## Conventions

- TDD in `core/`: a new engine behavior gets a failing test before the
  implementation.
- No hardcoded personal/account-specific knowledge in `core/src/kubera/` —
  corrections for a real, otherwise-unrecognizable account go in
  caller-supplied `MappingOverrides`, not in the importer itself.
