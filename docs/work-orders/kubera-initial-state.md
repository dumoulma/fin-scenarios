# Work Order: Kubera → Initial State

## Objective

Build the smallest useful Kubera import path that converts the user's current Kubera portfolio into our domain's `Initial State`, then proves that the resulting state can be consumed directly by the existing calculation engine.

This is a prototype/de-risking exercise, not a production-grade Kubera integration.

## Context

The calculation engine is already working across the progressive domain test suite. The current domain model establishes:

- `Initial State` is the dated starting Financial State.
- `Financial State` contains assets and liabilities.
- `Asset Type` owns reusable asset calculation behavior.
- `Holding Context` represents account/tax-wrapper context such as taxable brokerage, 401(k), IRA, Roth and HSA.
- `Trajectory` begins with an Initial State and one or more contiguous Scenarios.
- The domain must not depend on Kubera concepts.

Kubera is therefore an external input source/adapter. It must map into the domain and then disappear.

## Success criterion

Given the current Kubera portfolio, produce a valid Initial State that:

1. is dated at import time;
2. contains the relevant assets and liabilities;
3. maps assets to useful Asset Types;
4. maps account/container context to Holding Context where available;
5. does not double-count parent and child Kubera rows;
6. does not invent detail that Kubera does not provide;
7. can be passed directly to the existing calculation engine;
8. produces a valid Financial State for a simple Scenario.

The key architectural test is:

> The calculation engine must have no dependency on Kubera-specific concepts.

## Scope

### In scope

- Fetch the current Kubera portfolio through the available Kubera integration.
- Inspect the actual returned structure rather than designing around a hypothetical schema.
- Define the minimum mapping needed from Kubera data to Initial State.
- Map broad financial categories into our Asset Types.
- Map account/tax-wrapper context into Holding Context where it can be determined.
- Preserve amounts accurately.
- Represent liabilities separately.
- Handle parent/child rows and other aggregation artifacts without double counting.
- Surface ambiguous/unmapped classifications explicitly.
- Create deterministic automated tests using representative Kubera-shaped fixtures.
- Prove the imported Initial State can run through the existing engine.

### Out of scope

Do not build:

- historical Kubera imports;
- continuous synchronization;
- individual security reconciliation beyond what is useful for the prototype;
- a complete Kubera data model;
- Kubera-specific concepts in the domain package;
- tax-law inference beyond the existing domain model;
- production authentication/UI for connecting Kubera;
- stochastic assumptions;
- a full portfolio-management system.

## Mapping philosophy

Prefer loss of detail over fabricated detail.

Examples:

- If a holding is clearly Equity but the exact regional classification is unavailable, map it to `Equity` rather than guessing `US Equity`.
- If a parent row aggregates child positions, represent the children or the parent, but never both.
- If account context is known, preserve it as Holding Context.
- If account context is unknown, use the least-assumptive representation supported by the domain rather than inventing a wrapper.
- Individual tickers are optional. The Initial State should remain useful when positions are represented at broad Asset Type level.

## Expected flow

```text
Kubera
  │
  ▼
Kubera adapter/import mapping
  │
  ▼
Initial State
  │
  ▼
existing Trajectory / Scenario
  │
  ▼
existing calculation engine
  │
  ▼
Financial State[]
```

The adapter is the only place that should understand Kubera's representation.

## Domain output

The importer should construct the existing domain types rather than introducing parallel import-specific financial types.

Conceptually:

```text
Initial State
├── date
├── assets
│   └── Asset Position
│       ├── amount
│       ├── Asset Type
│       └── Holding Context (optional/when known)
└── liabilities
    └── Liability
```

Do not add domain concepts merely to make Kubera easier to represent.

## Initial Asset Type mapping

Use the existing domain vocabulary and keep the mapping conservative. At minimum support the categories needed by the real portfolio, such as:

- Cash
- Equity
- Fixed Income
- Real Estate / Property
- Insurance / Whole Life
- other existing Asset Types if the actual Kubera data requires them

Crypto or other assets should only receive a distinct Asset Type if the existing domain already supports it or the implementation demonstrates that a genuinely reusable domain concept is required. Do not create a one-off Kubera category just to preserve a label.

## Holding Context mapping

Use existing Holding Context concepts where the Kubera data gives enough information:

- Taxable Brokerage
- 401(k)
- Traditional IRA
- Roth 401(k)
- Roth IRA
- HSA

Cash in ordinary banking accounts may be represented as Cash with the appropriate context. Cash inside investment accounts does not need to be modeled separately unless the actual Kubera data or engine requires it.

## Tests

At minimum, implement tests for:

1. A simple Kubera asset becomes one Asset Position.
2. Multiple child positions aggregate without including their parent twice.
3. A taxable brokerage maps to the correct Holding Context.
4. A retirement account maps to the correct Holding Context.
5. Equity is mapped conservatively when regional/ticker detail is unavailable.
6. Property is mapped as Real Estate / Property.
7. Whole Life is mapped as Insurance / Whole Life.
8. Liabilities are not treated as negative assets.
9. Import date becomes Initial State date.
10. Empty/irrelevant Kubera rows do not create financial state.
11. Ambiguous classifications are surfaced rather than silently guessed.
12. Imported totals reconcile to the intended Kubera portfolio totals within the mapping rules.
13. Imported Initial State can initialize a Trajectory.
14. A simple Scenario can be calculated from the imported Initial State.
15. The engine test imports only domain objects and does not import Kubera types/modules.

Add additional edge cases discovered from the actual Kubera response.

## Acceptance check

The prototype is complete when a test can effectively demonstrate:

```text
realistic Kubera fixture
        ↓
      import
        ↓
   Initial State
        ↓
   simple Scenario
        ↓
 calculation engine
        ↓
 valid Financial State
```

And when Kubera-specific knowledge can be deleted from the engine without changing its behavior.

## Implementation guidance

Keep this prototype boring.

Do not prematurely design a generalized provider framework. We have one real external source right now. The useful seam is simply the separation between Kubera representation and the domain's Initial State.

Use the existing domain and calculation abstractions wherever possible. If implementation friction reveals that an existing domain concept is insufficient, stop and document the finding rather than introducing a speculative abstraction.

## Deliverable

Code + automated tests only where needed, with a concise implementation note describing:

- what Kubera data was actually encountered;
- what was mapped;
- what detail was intentionally discarded;
- any ambiguities or unresolved classifications;
- any domain-model changes discovered necessary during implementation.

The implementation should leave the repository in a state where the next step can be wiring the import into an eventual user-facing "Connect Kubera → create Initial State → calculate first Trajectory" flow.
