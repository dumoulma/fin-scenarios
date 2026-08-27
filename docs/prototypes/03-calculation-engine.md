# Prototype 03 — Calculation Engine

## Purpose

Prove the central architectural hypothesis: the financial projection can be implemented as a purely functional, deterministic calculation over an Initial State, a Trajectory, and explicit inputs.

This is the most important prototype. It should be small enough to throw away, but realistic enough to expose whether Events, Policies, Assets, Parameters, and Financial State compose cleanly.

## Core hypothesis

```text
calculate(
  initialState,
  trajectory,
  inputs
) → CalculationResult
```

The calculation core must have no persistence, network, clock, UI, or hidden mutable state.

The same calculation must be usable for Master and Alternative Trajectories.

## Time model

Calculate at **monthly resolution** internally. Scenarios can therefore start and end on month boundaries and one-time Events can occur in a particular month.

The Calculation Result should retain the monthly Financial State history needed for analysis while exposing yearly Financial State snapshots as the primary raw planning output.

## Financial State

Financial State contains assets and liabilities. Income and spending are flows that occur during calculation and cause changes to Financial State; they are not stored as permanent Scenario state.

The prototype should support enough Asset behavior to test:

- cash / HYSA
- taxable equity investments
- retirement accounts with different tax wrappers
- residential property
- mortgage
- Whole Life cash value

## Event model

Events may be:

- instantaneous, such as an inheritance or house purchase
- recurring, such as salary or dividend income
- duration-based, such as employment or property ownership

Events change financial state. Asset behavior may also produce financial flows/events such as dividends or Whole Life activity.

## Policies

Policies describe what happens to available money according to user choices, particularly disposition of surplus.

Prototype prioritized policies such as:

1. spending
2. maintain a cash reserve
3. pay mortgage
4. invest surplus

The prototype should demonstrate that changing policy priority changes the resulting Financial State without changing the calculation mechanism.

## Parameters and Input Generators

Parameters include numerical assumptions such as:

- investment return
- inflation
- property appreciation
- tax estimates
- other asset-specific rates

The first prototype can use constant values. Keep the representation sufficiently separate that a future Input Generator can supply a different value on each simulation run without changing the calculation engine.

## Whole Life as the flexibility test

The prototype must include enough Whole Life behavior to expose whether the Asset model is genuinely flexible:

- cash value growth
- dividends
- PUA
- policy fees
- policy loans
- withdrawals

Do not create a special-purpose Whole Life calculation engine outside the general Asset behavior model merely to make the prototype work.

## Suggested end-to-end fixture

Use a fictional but realistic life trajectory:

```text
2026–2032  Working in USA
           $270k salary
           normal spending
           mortgage
           investment contributions

2033       One year travelling
           zero salary
           elevated travel spending
           cash drawdown

2034–2040  Retirement in Japan
           Social Security later
           portfolio withdrawals
           Whole Life available as a secondary source
```

Include a property sale and a large one-time expenditure somewhere in the trajectory to test event handling.

## Acceptance criteria

- The same pure calculation function handles materially different Scenarios.
- Monthly calculation produces a coherent Financial State for every month.
- Every month belongs to exactly one Scenario.
- Annual snapshots can be derived from the monthly result.
- Net worth can be calculated from Financial State.
- Events can create and remove financial positions.
- Asset behavior can generate financial flows.
- Policies can redirect available cash without being embedded in asset logic.
- Taxes can be represented as approximate financial outflows using explicit parameters.
- Constants can be replaced by generated inputs without changing the calculation semantics.
- Running the same calculation twice with the same inputs produces the same result.
- Automated tests cover the calculation through its highest useful seam.

## Deliberately do not solve yet

- production tax accuracy
- Monte Carlo orchestration
- database persistence
- performance optimization
- every possible asset class
- portfolio security-level modeling
- production Whole Life policy modeling

## Questions to record after the prototype

- Is the month-by-month calculation model natural?
- Does Event remain the right primitive once asset behavior is implemented?
- Where does calculation complexity actually concentrate?
- Are Policies sufficiently independent from Assets?
- Does Whole Life fit without special cases?
- Is the pure functional design pleasant to test and modify?
- What would have to change to run 10,000 calculations?
