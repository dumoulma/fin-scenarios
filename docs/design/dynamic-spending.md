# Dynamic Spending Design

## Purpose

Retirement drawdown introduces one small extension to the existing model: Scenario spending does not always have to be a fixed number. It may be determined dynamically for each calculation period by a Spending Policy.

This is an extension of the existing model, not a new retirement-specific subsystem.

## Core Model

A Scenario already contains Scenario Parameters, including Spending.

Spending should support two forms:

```text
Spending
├── Fixed
│   └── explicit amount
└── Policy
    └── determines amount for a calculation period
```

The existing calculation loop remains the fundamental model:

```text
Financial State at start of tick
        ↓
   active Events / Assets
        ↓
    calculate Income
        ↓
 determine Spending
        ↓
   Income − Spending
        ↓
       Policies
        ↓
Financial State at end of tick
```

A Spending Policy therefore participates at the point where the engine needs to determine Spending for the current calculation period.

## Cadence

A Spending Policy may operate at the natural cadence of the strategy:

- monthly;
- quarterly;
- annually.

The engine continues to calculate at monthly ticks. A policy with a longer cadence simply determines or updates the applicable spending amount at its cadence and that amount applies according to its defined behavior.

The UI should allow the user to express spending in the unit that is natural to them; the domain normalizes it for calculation.

## Fixed Spending

Fixed spending is the simplest and remains the default case.

Example:

```text
Spending = $100,000/year
```

This should require no policy logic and should behave exactly as the existing engine does today.

## Dynamic Spending

A dynamic Spending Policy determines spending from the current simulation context.

The policy may inspect the Financial State available at the relevant calculation point and its own user-defined parameters.

Example:

```text
Base spending: $100k/year
Withdrawal-rate guardrail: 6%
Adjustment: -10%
```

The important domain rule is:

> Spending remains a Scenario Parameter; a Spending Policy is simply a way of determining its value for a calculation period.

Do not introduce a separate retirement-drawdown domain hierarchy merely to support this behavior.

## Guardrails

Guardrails are an important first dynamic strategy to exercise.

A simplified example:

```text
if withdrawal rate > upper guardrail:
    reduce spending
else if withdrawal rate < lower guardrail:
    increase spending
else:
    maintain spending
```

The exact guardrail formula and parameters are intentionally not fixed by this document. They should be introduced through tests and concrete product requirements.

## Relationship to Policies

Do not confuse Spending Policies with the existing financial Policies.

**Spending Policy** answers:

> How much do I spend this period?

**Financial Policy** answers:

> What do I do with the resulting surplus or deficit?

The resulting flow remains:

```text
Income − Spending
        ↓
Surplus / Deficit
        ↓
Financial Policies
```

This allows the same engine to combine dynamic spending with simple or sophisticated asset-disposition strategies.

For example:

```text
Dynamic spending
       +
Cash → Bonds → Equity drawdown policy
       =
Retirement guardrails + bucket strategy
```

No special retirement engine is required.

## Design Principles

### Keep the model small

Dynamic spending should be a small extension of Scenario Parameters and calculation behavior. Avoid introducing retirement-specific concepts until the tests demonstrate a real need.

### Reuse the monthly simulation

The existing monthly tick model is already the natural evaluation point. Do not introduce a second simulation mechanism for dynamic spending.

### Keep reusable knowledge in behavior

The Spending Policy type/behavior defines how spending is calculated. Scenario data supplies the policy's concrete parameters.

### Preserve fixed spending

A fixed spending Scenario must remain the simplest possible representation and must not become more complicated merely because dynamic spending exists.

### Test behavior through the engine

Prefer black-box integration tests through the public calculation interface. Avoid mocks and tests coupled to internal implementation details.

## Initial Test Progression

The first retirement-specific tests should increase in complexity gradually:

1. Fixed spending during retirement.
2. Fixed spending with a simple asset drawdown Policy.
3. Cash-first bucket strategy.
4. Cash → bonds → equity bucket strategy.
5. Bucket replenishment.
6. Poor sequence of returns.
7. Favorable sequence of returns.
8. Dynamic spending with a simple rule.
9. Guardrail spending based on portfolio state.
10. Guardrail spending combined with bucket drawdown.
11. Working → retirement Scenario transition.
12. Multiple retirement Scenarios with different spending Policies.

The tests should determine whether the implementation needs any deeper architectural change.

## Non-Goals

This design does not currently specify:

- a particular guardrail methodology;
- Monte Carlo simulation;
- stochastic spending generators;
- detailed household budgeting;
- tax optimization strategies;
- a dedicated retirement subsystem;
- a special drawdown engine.

Those may become useful later, but none is required to support the initial dynamic-spending model.
