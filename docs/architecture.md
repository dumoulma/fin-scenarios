# Architecture Vision

## Purpose

This document describes the architectural direction for the financial-life modeling product. It is intentionally a design vision rather than a detailed implementation specification. The architecture should remain small, functional, testable, and easy for both humans and AI systems to navigate.

The domain model in `docs/domain/CONTEXT.md` is authoritative for domain terminology and concepts. This document describes how those concepts are expected to collaborate.

## Architectural Goal

The system should make the following loop extremely simple:

```text
Initial State + Trajectory
          |
          v
      Calculation
          |
          v
Financial State[] / Calculation Result
          |
          +----> visualization
          +----> comparison
          +----> analysis
          +----> Monte Carlo summaries
```

The calculation engine is the center of gravity. Scenario authoring and visualization should be able to evolve independently of the calculation rules.

The initial implementation is expected to be purely functional and written in TypeScript. Persistence, remote services, and production infrastructure are deliberately deferred while the model is being de-risked.

## Architectural Shape

The initial architecture should have a small number of deep modules organized around domain concepts and major seams rather than a large collection of thin technical modules.

Conceptually:

```text
                         +-------------------+
                         |   Scenario /      |
                         | Trajectory Model  |
                         +---------+---------+
                                   |
                                   v
+----------------+        +--------+---------+        +------------------+
| Kubera Adapter | -----> |  Calculation     | <----- | Type Behaviors   |
|                |        |     Engine       |        | Asset / Event    |
+----------------+        +--------+---------+        +------------------+
                                   |
                                   v
                         +---------+---------+
                         | Calculation Result|
                         | Financial State[] |
                         +---------+---------+
                                   |
                                   v
                         +---------+---------+
                         | Visualization /   |
                         | Comparison        |
                         +-------------------+
```

The diagram is conceptual. The exact module layout should be discovered through the prototype rather than prescribed prematurely.

## Major Modules

### Domain Model

Owns the representation of the domain concepts defined in the domain glossary:

- Initial State
- Financial State
- Asset and Asset Type
- Liability
- Event and Event Type
- Scenario
- Scenario Parameters
- Policy
- Trajectory
- Calculation Result

This module should be mostly data and domain invariants. It should not contain presentation concerns or persistence concerns.

The domain model should make invalid Trajectories difficult to construct, particularly around Scenario ordering, contiguity, and the requirement that the first Scenario begins at the Initial State date.

### Calculation Engine

The Calculation Engine transforms Financial State from one monthly Time Tick to the next.

Its conceptual operation is:

```text
calculate(Initial State, Trajectory, Inputs)
    -> Calculation Result
```

For every tick it:

1. identifies the Scenario covering the tick;
2. determines the Events and Event behaviors relevant to the tick;
3. determines the Asset behaviors relevant to the Financial State;
4. applies Scenario Parameters;
5. calculates cash inflows and other financial consequences;
6. applies Scenario Spending;
7. applies taxes and other applicable outflows;
8. applies Policies to reconcile surplus or deficit;
9. produces the next Financial State.

The engine should be deterministic when given deterministic Inputs.

The engine should not know about UI state, databases, HTTP, Kubera, or visualization.

### Type Behaviors

Asset Types and Event Types provide reusable calculation knowledge.

The important architectural distinction is:

```text
Domain instance        Reusable behavior
---------------        ------------------
Asset             -->  Asset Type behavior
Event             -->  Event Type behavior
```

Assets and Events carry the domain facts required to identify them and their type. They do not embed ad hoc calculation logic.

Examples:

- Equity Asset Type behavior calculates growth and distributions.
- Whole Life Asset Type behavior calculates policy-specific behavior such as cash-value growth, dividends, premium effects, and loans/withdrawals as the domain supports them.
- Employment Event Type behavior can establish employment and generate salary cash inflows while that employment is active.
- Property Purchase Event Type behavior can transform Financial State and establish the resulting property position.

The exact behavior model should remain small until the prototype exposes real friction.

### Policy Evaluation

Policies determine how the difference between calculated cash inflows and Scenario Spending is reconciled with Financial State.

Positive net cash flow may be allocated to Assets or debt repayment. Negative net cash flow may be funded through Asset withdrawals, Asset sales, or additional debt.

Policies are ordered where priority matters.

Policy evaluation is a natural deep module because the rest of the engine should be able to say, conceptually:

```text
reconcile(netCashPosition, financialState, policies)
```

without needing to understand the individual policy mechanics.

### Input Generation

Input Generation supplies values used by calculation.

Initially, inputs can simply be deterministic numbers:

```text
return = 7%
inflation = 2.5%
```

Later, an Input Generator can produce values from distributions for Monte Carlo evaluation.

The Calculation Engine should consume inputs without caring whether they came from a literal value or a generator.

This allows Monte Carlo to reuse the exact same calculation path:

```text
Trajectory
    |
    +--> deterministic inputs --> calculate --> one result
    |
    +--> generated inputs ------> calculate --> simulation result
```

### Kubera Adapter

Kubera is an external source for populating the Initial State.

The Kubera integration should be isolated behind an adapter seam. The rest of the product should deal with an Initial State rather than knowing how Kubera represents holdings.

Initially, the import can aggregate holdings into the Asset and holding-context fidelity supported by the domain rather than attempting ticker-level replication.

The desired user experience is:

```text
Connect Kubera
      |
      v
Populate Initial State
      |
      v
Start first Scenario
```

This integration is particularly valuable because manually reconstructing a current financial position is a major source of friction in retirement-planning software.

### Calculation Result / Projection Data

The calculation result is the canonical output of the engine.

At minimum it must support the yearly Financial State / net-worth summary used by the product's visualizations. The underlying calculation operates monthly, so richer visualizations can later consume monthly results without changing the calculation model.

The same result shape should support:

- a single deterministic Trajectory;
- Master Trajectory visualization;
- Alternative Trajectory comparison;
- arbitrary what-if comparisons;
- Monte Carlo distributions and ranges.

The presentation layer should not recalculate financial outcomes.

### Visualization

Visualization consumes Calculation Results.

The intended product experience is inspired by ProjectionLab for a single Trajectory: the Scenario cards form a visual timeline and the calculated financial outcome is visible alongside it.

The architecture should keep visualization separate from calculation so that visual experimentation does not destabilize financial behavior.

## Master and Alternative Trajectories

The domain defines one Master Trajectory as the current plan and allows Alternative Trajectories for experimentation.

Architecturally, these are not different calculation paths.

```text
Master Trajectory --------\
                           > same Calculation Engine
Alternative Trajectory ----/
```

An Alternative is typically created by transforming/copying a Trajectory and changing its Scenarios. The original remains unchanged.

The UI should make experimentation feel cheap:

```text
Master
  |
  +--> duplicate --> Alternative A --> modify
  |
  +--> duplicate --> Alternative B --> modify
  |
  +--> update Master when desired
```

There should be no special calculation logic for Alternatives.

## Functional Core, External Edges

The preferred architectural bias is a functional core with thin external edges.

```text
              External / stateful edges
       +--------------------------------------+
       | Kubera | Persistence | UI | future APIs |
       +-------------------+------------------+
                           |
                           v
       +--------------------------------------+
       |              Functional Core         |
       |                                      |
       | Domain Model                         |
       | Type Behaviors                       |
       | Calculation Engine                   |
       | Policy Evaluation                    |
       | Input Generation                     |
       +--------------------------------------+
```

The calculation core should be straightforward to exercise with automated tests by constructing an Initial State and Trajectory directly and examining the resulting Financial State sequence.

## Persistence Direction

Persistence is deliberately deferred for the prototype.

The eventual direction may be Parquet files plus DuckDB in-process for calculation results and analytical access. This is not yet an architectural commitment.

The important architectural requirement is that persistence must not become part of the calculation model. A Calculation Result should be usable whether it came from an in-memory calculation or was later loaded from persistent analytical storage.

Scenario persistence likewise should not change Scenario semantics. Temporary and saved Scenarios have the same domain meaning.

## Time Model

The calculation engine operates at monthly resolution.

```text
Initial State date
       |
       v
2026-01 -> 2026-02 -> 2026-03 -> ... -> end
```

Scenarios are date-based and can begin/end at month-level granularity. The engine produces monthly Financial States and the presentation layer can derive annual snapshots.

The engine should therefore not be designed around annual calculations even though yearly net-worth output is the initial primary presentation.

## Taxes

Taxes are part of calculation behavior but the product is not a tax optimization calculator.

The initial model uses simple tax assumptions associated with Scenario Parameters and applicable asset/flow behavior. Tax behavior should be sufficiently generic to support different country/circumstance scenarios without creating a jurisdiction-specific tax engine.

For example, a Scenario representing a period in Costa Rica can use tax parameters appropriate to that circumstance without changing the fundamental calculation model.

The architecture should avoid making US tax rules a foundational dependency of the calculation engine.

## Testing Strategy

The calculation engine should be primarily tested through its public calculation interface rather than through internal implementation functions.

Tests should construct small, explicit examples such as:

- cash earning interest for one year;
- equity growing and distributing dividends;
- salary income minus spending creating brokerage contributions;
- negative cash flow causing a policy-directed withdrawal;
- mortgage repayment from surplus;
- Whole Life cash-value behavior and policy loan/withdrawal;
- property purchase and sale;
- Scenario boundary transitions;
- copying and modifying a Trajectory without changing the original;
- deterministic versus generated inputs producing the same calculation path.

The most valuable tests should verify Financial State transitions and resulting net worth, not implementation details.

## Prototype Strategy

The architecture should be validated through four small local prototypes before attempting a complete product implementation:

1. **Kubera Import** — prove that a real Initial State can be populated with acceptable fidelity.
2. **Scenario and Trajectory Model** — prove that Scenarios can be composed, duplicated, resized, transformed, and used to build contiguous Trajectories.
3. **Calculation Engine** — prove that realistic examples can be expressed with Events, Asset Types, Scenario Parameters, and Policies and produce plausible Financial State sequences.
4. **UI with Sample Data** — prove that a Trajectory can be edited visually and its Calculation Result can be presented intuitively.

The prototypes are deliberately throwaway. Their purpose is to discover friction and converge on a better architecture, not to establish premature production structure.

## Architectural Principles

### Keep the calculation engine boring

The core should resemble a straightforward state transition simulation. Complexity should live in domain behaviors rather than orchestration tricks.

### Prefer deep modules

A module should hide meaningful complexity behind a small, stable interface. Avoid splitting the system into many thin modules simply because concepts can be named separately.

### Preserve locality

A developer or AI agent should be able to understand a financial behavior by reading a small amount of closely related code. Avoid scattering a single domain rule across unrelated modules.

### Keep seams real

External integrations such as Kubera are genuine seams. Internal abstractions should earn their existence through actual variation or complexity rather than speculative flexibility.

### Same engine everywhere

Master, Alternatives, deterministic projections, comparisons, and Monte Carlo all use the same calculation engine.

### Don't build the future twice

The prototype should implement the smallest useful version of the model and use actual friction to determine where the architecture needs to deepen.

## Explicitly Not Decided Yet

This document intentionally does not settle:

- exact TypeScript module/file structure;
- exact interfaces;
- persistence schema;
- database choice;
- UI framework;
- exact Event Type behavior representation;
- exact Asset Type behavior representation;
- exact Policy representation;
- detailed tax algorithms;
- Monte Carlo statistical presentation;
- production deployment architecture.

Those decisions should be made when the prototypes provide evidence that they matter.
