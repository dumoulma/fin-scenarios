# Post-Prototype Domain Review

## Purpose

The prototype at commit `7288c82` exercised the domain through the progressive test suite and added substantially sharper Policy and Whole Life behavior. This review records what implementation validated and what it taught us about the domain.

## Validated model

The following concepts survived implementation cleanly:

- Initial State is the dated starting Financial State.
- Financial State contains assets and liabilities and is the state transformed by calculation.
- Trajectory is a contiguous ordered sequence of Scenarios.
- Scenario has a start and end time and contains Events, Scenario Parameters, and Policies.
- Monthly ticks are the calculation primitive.
- Event Type supplies reusable Event behavior.
- Asset Type supplies reusable Asset behavior.
- Holding Context is separate from Asset Type and primarily captures account/tax-wrapper behavior.
- Cash inflows are calculated from Events and Asset behavior rather than entered as a single Scenario value.
- Spending is a Scenario Parameter.
- Policies reconcile the resulting surplus or deficit in explicit priority order.
- Deterministic calculation and future Monte Carlo calculation can share the same domain and calculation model.

## Refinements learned from implementation

### Asset positions carry instance-specific facts

The conceptual statement that "assets do not have parameters" was too absolute for implementation.

An Asset Position has an Asset Type whose reusable behavior performs the calculation, but the position may also carry facts that distinguish it from another instance of the same type. Examples include a modeled growth rate or distribution rate for one Equity position versus another.

The domain distinction should therefore be:

> **Asset Type owns reusable behavior; an Asset Position supplies the facts that parameterize that particular holding where necessary.**

This preserves the separation of behavior from data while allowing optional modeling fidelity.

### Events carry instance-specific facts

Likewise, an Event is more than timestamp plus Event Type. The Event Type owns reusable behavior, while the Event instance supplies the facts of that occurrence.

Examples:
- an Employment Event supplies the salary;
- a Property Purchase Event supplies the transaction facts;
- a Whole Life Loan Event supplies the loan amount.

The refined rule is:

> **Event Type owns reusable behavior; an Event supplies the facts describing the particular occurrence.**

### Policies are ordered reconciliation rules

The implementation sharpened Policy into a particularly useful abstraction: Policies operate on a generic net cash pool and claim from that pool or provide funds according to priority.

This means changing the order of Policies changes the resulting Financial State without changing calculation logic. Policy mechanisms can target Holding Contexts or relevant liabilities without knowing Asset-Type-specific calculation behavior.

This is a strong domain/architecture seam and should be preserved.

### Whole Life is an Asset Type, not a special simulation

The Whole Life implementation validated the decision to model the policy as an Asset Type with specialized behavior. Cash value, dividends, premiums, PUA, PUA charges, policy loans, and withdrawals can participate in the same Financial State transition model.

A policy loan is represented asymmetrically: cash becomes available while a policy-loan liability increases; the underlying cash value is not simply reduced by the loan amount.

## Architectural implications

The prototype suggests that the calculation engine should remain centered on a simple Financial State transition rather than accumulating special cases for different life plans.

```text
Scenario
  |-- Events -------- Event Type behavior
  |-- Assets -------- Asset Type behavior
  |-- Scenario Parameters
  |-- Spending
  |-- Policies
          |
          v
    monthly calculation
          |
          v
    Financial State'
```

The same engine should produce the same fundamental result shape for:
- a simple one-scenario trajectory;
- a complex multi-scenario life plan;
- a Master Trajectory;
- an alternative Trajectory;
- a deterministic run;
- a Monte Carlo run.

## What remains intentionally simple

The prototype does not justify expanding the domain into:

- detailed budgeting;
- individual securities or account reconciliation;
- rental-property economics;
- exact tax-law optimization;
- special retirement domain logic;
- country-specific tax/legal systems;
- sophisticated stochastic models.

These remain future capabilities, not current domain requirements.

## Next validation target

The next meaningful prototype step is Kubera import into Initial State. The goal is to prove that a real-world portfolio can be transformed into the coarse-grained Financial State required by the calculation engine without contaminating the domain with Kubera-specific concepts.
