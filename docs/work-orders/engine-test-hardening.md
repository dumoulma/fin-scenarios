# Work Order: Engine Test Hardening

## Objective

Now that the domain model and calculation engine have survived the first substantial implementation pass, harden the engine with a second, adversarial test layer.

The goal is not to accumulate more hand-written examples for their own sake. The goal is to discover violations of domain invariants and unexpected interactions that the existing progressive scenario ladder may not anticipate.

Use **black-box tests through the public calculation/domain interface** wherever possible. Prefer real collaborators and realistic fixtures. Do not introduce mocks merely to make tests easier to isolate.

## Baseline

Use the current `main` branch as the implementation baseline. Read the current domain and architecture documentation before changing tests.

The existing progressive test ladder remains the primary behavioral specification. Do not replace it with property-based tests; add a hardening layer alongside it.

## Testing philosophy

The project strongly prefers:

- black-box integration tests;
- real domain objects and collaborators;
- deterministic, reproducible fixtures;
- pure functional behavior where possible;
- tests through the public calculation interface;
- minimal mocking.

Avoid:

- interaction-based tests;
- mocking internal collaborators;
- tests coupled to implementation details;
- generating random examples without asserting meaningful domain properties;
- splitting pure functions into artificial modules solely for testability.

If a property can be tested against the full engine, prefer that over testing an internal function.

## Phase 1 — Establish the property-testing harness

Choose an appropriate TypeScript property-based testing library already compatible with the repository, or add the smallest sensible dependency if none exists.

Build generators for valid domain inputs, starting conservatively:

- Initial States;
- Asset Positions;
- supported Asset Types;
- Holding Contexts;
- Events and Event Types;
- Scenario Parameters / economic parameters;
- Policies;
- Scenarios;
- contiguous Trajectories.

Generated values should primarily be realistic and domain-valid. Include edge cases deliberately rather than relying entirely on unconstrained random numbers.

Every failing property must be reproducible from its seed/counterexample.

## Phase 2 — Core invariants

Add black-box properties for the following.

### Financial State conservation

For a monthly calculation, all changes in Financial State must be explainable by the modeled inputs and behavior for that tick.

There must be no unexplained creation or disappearance of money.

Test positive and negative cash flow cases and combinations of Events, Asset behavior, and Policies.

### Trajectory continuity

For every generated valid Trajectory:

- Scenario periods are contiguous;
- there are no gaps;
- there are no overlaps;
- the first Scenario begins at the Initial State date;
- the Trajectory ends exactly at the end of its final Scenario.

### Monthly tick consistency

A multi-month Scenario should produce one Financial State transition per month and every tick should use the Financial State from the preceding tick as its input.

### Scenario partition equivalence

Where a Scenario is split into two contiguous Scenarios with identical Events, Scenario Parameters, and Policies, the resulting Financial State should be equivalent to the unsplit Scenario.

This property is especially important because Scenarios are the periods in which alternative life circumstances are expressed.

### Trajectory copy equivalence

A copied Trajectory with no modifications must produce the same Financial States as its source.

This protects the intended Master Trajectory / alternative Trajectory model.

### Trajectory extension locality

Appending a new Scenario to an existing Trajectory must not alter Financial States before the original Trajectory endpoint.

### Same-month Event ordering

For Events whose domain behavior is commutative, changing their ordering must not change the result.

If ordering is intentionally load-bearing for a particular Event Type, document and test that explicitly instead of treating it as accidental behavior.

## Phase 3 — Policy hardening

Generate arbitrary but valid Policy priority lists and cash-flow situations.

Verify properties such as:

- higher-priority Policies consume available surplus before lower-priority Policies;
- lower-priority Policies receive only remaining surplus;
- the same surplus is not allocated twice;
- deficits follow the defined Policy behavior;
- changing Policy priority produces only the changes implied by the changed priority;
- Policy reconciliation never creates unexplained assets or removes unexplained assets.

Include combinations involving:

- investment contributions;
- debt repayment;
- cash reserves;
- Whole Life funding;
- positive surplus;
- negative surplus;
- zero surplus.

## Phase 4 — Asset hardening

Generate multiple instances of the same Asset Type with different instance facts and behavior inputs.

Verify that:

- instances remain independent;
- combining equivalent positions produces an equivalent result where the Asset Type behavior permits it;
- splitting one position into equivalent positions does not change aggregate Financial State where behavior is linear;
- Asset Type behavior is not accidentally coupled to Holding Context;
- Holding Context affects taxation/account behavior without changing the underlying asset growth semantics unless explicitly defined by the domain.

Explicitly exercise:

- Cash;
- Equity;
- Fixed Income;
- Property;
- Whole Life;
- multiple Holding Contexts;
- country and currency on Assets.

### Basis

Where an Asset Type has basis, generate basis values and verify that basis is preserved and transformed according to that Asset Type's behavior.

Do not impose basis semantics on Asset Types for which basis is not meaningful.

## Phase 5 — Event hardening

Generate both point-in-time and duration-based Events.

Verify:

- point-in-time Events affect only their intended tick;
- duration Events affect every tick in their active period;
- an Event ending at a Scenario boundary behaves correctly;
- an Event starting at a Scenario boundary behaves correctly;
- duration Events may span Scenario boundaries where the domain permits it;
- Events do not implicitly mutate Scenario Policies or Scenario Parameters.

Include combinations such as employment + investment income + inheritance + property transaction + retirement/termination events.

## Phase 6 — Scenario Parameters / economic parameters

Generate valid combinations of:

- spending;
- inflation;
- return assumptions where applicable;
- tax assumptions;
- other currently supported economic parameters.

Verify that Scenario-specific parameters affect only the Scenario(s) in which they are defined.

Where two adjacent Scenarios have identical parameters, splitting them should preserve the equivalent result.

## Phase 7 — Whole Life adversarial testing

Whole Life has more specialized behavior than ordinary assets and should receive disproportionate hardening.

Generate combinations of:

- premium payments;
- dividends;
- PUA;
- policy charges;
- policy loans;
- loan repayment;
- withdrawals;
- strong investment years;
- poor investment years;
- years with insufficient external surplus.

Assert the domain invariants already established by the implementation, particularly around cash value, available cash, policy-loan liabilities, and withdrawals.

Include sequences in which multiple Whole Life operations happen in the same month.

Do not infer new Whole Life rules solely from intuitive financial expectations. Use the current domain specification and existing tests as the source of truth; flag contradictions for review.

## Phase 8 — Currency hardening

The Kubera prototype exposed multi-currency data while the engine currently has limited currency semantics.

Property-test that:

- every generated Asset has country and currency;
- supported same-currency calculations remain unchanged;
- non-reporting-currency Assets are not silently converted when no conversion behavior exists;
- unsupported currency situations are surfaced deterministically;
- currency metadata cannot disappear during a Financial State transition.

Do not invent FX behavior. If the current architecture cannot correctly calculate a case, the property should expose that fact rather than adding an implicit conversion rule.

## Phase 9 — Composition / combinatorial hardening

Once the basic properties are stable, generate complete small financial lives:

```text
Initial State
    +
Trajectory
    +
1–5 Scenarios
    +
0–N Events per Scenario
    +
0–N Assets
    +
0–N Policies
    +
Scenario Parameters
        ↓
Calculation Engine
        ↓
Financial State sequence
```

Keep generated trajectories small enough to shrink effectively.

Bias generation toward interactions rather than enormous random datasets.

Examples of useful combinations:

- employment + property + mortgage + investment policy;
- unemployment + portfolio drawdown + Whole Life loan;
- inheritance + policy allocation + taxable brokerage;
- property sale + relocation + currency mismatch;
- multiple simultaneous income sources;
- multiple asset instances with different return/distribution assumptions;
- three adjacent Scenarios with materially different policies and economic parameters.

## Phase 10 — Metamorphic tests

Add transformations where the expected relationship between outputs is known.

Examples:

- duplicate an equivalent asset position → equivalent aggregate result;
- split an unchanged Scenario → equivalent result;
- copy an unchanged Trajectory → identical result;
- append a Scenario → earlier results unchanged;
- reorder commutative Events → identical result;
- increase an asset's modeled return while holding everything else constant → result should not decrease solely because of that increase, where the Asset Type behavior guarantees monotonicity.

Only assert monotonicity where the domain actually guarantees it. Do not turn financial intuition into an unverified invariant.

## Required deliverables

1. Property-based testing harness and generators.
2. A documented set of domain properties/invariants.
3. Property tests covering the core engine.
4. Policy hardening properties.
5. Asset and Event hardening properties.
6. Whole Life adversarial properties.
7. Currency properties appropriate to the current implementation.
8. At least one full generated-life black-box integration suite.
9. Reproducible failure output for every property.
10. A short `docs/` report recording:
   - bugs found;
   - assumptions confirmed;
   - assumptions falsified;
   - properties that proved difficult to express;
   - areas where the domain model remains ambiguous;
   - recommendations for the next domain/engine iteration.

## Acceptance criteria

- Existing deterministic test ladder remains green.
- Property tests run reliably in CI/local development.
- Generated failures are reproducible.
- Tests exercise the public engine/domain surface rather than internal implementation details.
- No mock-heavy testing architecture is introduced.
- At least one meaningful defect or previously untested edge case is either found or explicitly explain why the current properties provide strong confidence without finding one.
- Any domain ambiguity discovered during testing is documented rather than silently resolved in code.

## Final rule

Do not optimize for the number of generated cases.

Optimize for **meaningful invariants, useful shrinking, realistic domain generation, and failures that teach us something about the model**.
