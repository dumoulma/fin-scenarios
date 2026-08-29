# Work Order: Domain / Engine Convergence Pass

## Objective

Review the current implementation after the calculation-engine and Kubera prototypes, tighten the domain model based on what implementation actually taught us, then exercise the resulting changes through the existing progressive test ladder.

Do not redesign from theory. Do not refactor for its own sake. This is a convergence pass: identify concrete discrepancies or friction, define the smallest domain/engine changes justified by evidence, add black-box tests that prove them, implement them, and run the full ladder again.

## Baseline

Use the current `worktree-kubera-import` implementation, with the Kubera work completed at commit `42d0785` as the baseline reference.

Read:
- `docs/domain/CONTEXT.md`
- architecture documentation under `docs/`
- relevant ADRs under `docs/adr/`
- the existing progressive domain test suite
- the current calculation engine
- the Kubera importer
- the Whole Life implementation
- the Policy implementation

## Current domain refinements

The latest model is:

- Initial State is the dated starting Financial State.
- Financial State contains Assets and Liabilities.
- Trajectory is a contiguous sequence of Scenarios.
- Scenario has start/end time and contains Events, Scenario Parameters, and Policies.
- Scenario Parameters include economic parameters and Spending.
- Calculation proceeds in monthly time ticks.
- At each tick, active Events and Asset behaviors produce income/flows; the engine transforms the Financial State at the start of the tick into the Financial State at the end.
- Income is calculated as the sum of applicable income sources rather than entered as one Scenario number.
- Spending is simply a Scenario Parameter; detailed budgeting is out of scope.
- Policies determine what happens to the resulting surplus or deficit, in explicit priority order.
- Event Type owns reusable behavior; Event supplies the facts of the particular occurrence.
- Asset Type owns reusable behavior; an Asset instance/position supplies the facts needed for that particular holding.
- Asset Types may be coarse or detailed. A user can model all equities as one Equity position or create multiple Equity positions with different expected returns/distributions.
- Every Asset has a country and currency.
- Asset-specific attributes such as basis depend on Asset Type; do not force irrelevant attributes onto every Asset.
- Holding Context represents the tax/account wrapper independently of Asset Type. The same Asset Type can exist in multiple Holding Contexts.
- Whole Life is specialized Asset Type behavior, including cash value, dividends, PUA, policy fees, loans, and withdrawals.
- Kubera is an external adapter and must not leak Kubera concepts into the domain or engine.

## Required process

### 1. Review the implementation

Compare the code against the model above. Identify where the implementation:

- matches the model cleanly;
- forced a more precise definition;
- contains accidental special cases;
- has shallow modules with poor locality;
- couples Asset Type to Holding Context;
- couples Event Type to Scenario mechanics;
- puts Policy behavior in the wrong place;
- leaks external/Kubera concepts into the domain;
- makes the monthly Financial State transition harder to understand than necessary.

Use the `codebase-design` vocabulary: module, interface, depth, seam, adapter, leverage, locality. Apply the deletion test where useful.

### 2. Explicitly assess the Asset model

Verify that the implementation can express:

- one Equity position with a simple expected return and distribution rate;
- multiple Equity positions with different expected return/distribution assumptions;
- the same Asset Type in different Holding Contexts;
- different Asset Types in the same Holding Context;
- Asset-specific facts such as basis only where meaningful;
- country and currency on every Asset.

Do not introduce unnecessary security/ticker-level modeling.

### 3. Explicitly assess currency

The Kubera prototype revealed non-reporting-currency holdings while the engine currently lacks currency behavior.

Determine the minimum correct domain shape. Do not silently convert, discard, or invent values. If the product needs a reporting currency plus asset currency, define that clearly. If deeper FX behavior is not yet justified, keep it out of scope while preserving the information needed for future work.

### 4. Define changes before implementing them

For every proposed change, document:

- evidence from the implementation;
- the domain rule it clarifies;
- the smallest implementation change needed;
- which existing test rung should prove it;
- whether it creates or strengthens a seam.

Do not implement speculative architecture.

### 5. Add tests first or alongside each change

The project strongly prefers black-box integration tests with real collaborators.

Prefer:

```text
Initial State
  -> Trajectory
  -> Scenarios
  -> Events / Assets / Policies
  -> calculation
  -> Financial State
```

Avoid mocks and interaction-based tests. Do not introduce an interface merely to make something mockable. Use realistic fixtures for external data such as Kubera.

Use isolated tests only when the behavior is genuinely pure and the test provides meaningful additional confidence.

### 6. Exercise the existing test ladder

Map every change to one or more existing test rungs. Add new rungs only if the existing progression cannot express an important newly discovered behavior.

After implementing the changes:

1. run the new/affected tests;
2. run all existing domain-engine tests;
3. run the complete progressive test ladder;
4. run Kubera importer tests;
5. run the engine-independence test;
6. verify there are no regressions.

The goal is not merely green tests. The goal is that the tests demonstrate the refined domain model through realistic end-to-end calculations.

## Testing principles

- Black-box first.
- Integration over mock-heavy unit testing.
- Real collaborators whenever practical.
- Pure functions are naturally testable without mocks.
- Test outcomes and Financial State, not internal call sequences.
- Do not create abstractions solely for testing.
- Fixtures should represent realistic domain inputs.

## Output

Create `docs/domain-engine-convergence-review.md` containing:

1. Executive summary
2. What implementation validated
3. What implementation changed our understanding of the domain
4. Concrete architecture/domain friction
5. Proposed changes and rationale
6. Test rung for each proposed change
7. Currency decision/recommendation
8. Testing assessment
9. Explicit non-changes: things deliberately left alone
10. Final test results
11. Remaining questions before UI work

The review must distinguish evidence, interpretation, and recommendation.

## Acceptance criteria

- The implementation is reviewed against the current domain model.
- Asset Type remains the source of asset-specific behavior and attributes.
- Country and currency are explicit on Assets.
- Holding Context remains independent of Asset Type.
- Asset-specific facts such as basis are not forced onto unrelated Asset Types.
- Currency is explicitly addressed rather than silently ignored.
- Events and Policies remain behaviorally clean.
- Kubera remains isolated behind its adapter.
- Tests are predominantly black-box/integration tests with real collaborators and no unnecessary mocks.
- Every production change is exercised by an appropriate test rung.
- The full test ladder passes after implementation.
- A review document records what was learned.
