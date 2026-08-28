# Domain Context

## Purpose

This document defines the domain language for the financial-life modeling product. It intentionally contains no implementation details. The product models a person's financial life as a Trajectory composed of reusable Scenarios, evaluates that Trajectory from an Initial State, and presents the resulting financial position over time.

## Core Concepts

### Initial State

The financial state from which a Trajectory begins. It represents what the user owns and owes at the start of the modeled period.

An Initial State has a date and is the starting point for calculation. The first Scenario in a Trajectory begins at that date.

An Initial State may be populated from an external source such as Kubera rather than manually recreated by the user. Initially, the product may represent holdings at an aggregate level rather than individual securities.

### Financial State

A Financial State represents what the user owns and owes at a particular point in time. It consists of Assets and Liabilities and therefore provides the basis for calculating net worth.

Financial State is the state transformed by calculation over time. Income and Spending are not persistent contents of Financial State; they are inputs and calculated flows associated with the Scenario being evaluated.

### Scenario

A Scenario is a reusable description of a person's life and financial circumstances during a defined period.

A Scenario has a start time and an end time and contains Events, Scenario Parameters, and Policies. A Scenario is not a calculation and is not a Financial State.

Scenarios are the building blocks of alternative life plans. What varies between alternative plans belongs in Scenarios; reusable knowledge about how things behave belongs in Types.

A Scenario has a stable identity and may be reused in multiple Trajectories. There is no separate concept of a template: every saved Scenario is potentially a reusable building block.

### Scenario Parameters

Scenario Parameters are the values that describe the economic conditions and financial assumptions for a Scenario.

Scenario Parameters include Spending and may include economic parameters such as inflation, tax rates, and other values used by the calculation engine.

Spending is intentionally modeled as a simple Scenario Parameter representing overall expenditure for a period. The product does not attempt to model an individual's detailed household budget. Users may derive the value from another system such as Monarch or from their own estimate.

Scenario Parameters may later be supplied by deterministic values or by Input Generators without changing the Scenario's conceptual meaning.

### Scenario Lifecycle

A Scenario may be temporary or saved.

A temporary Scenario is being explored and need not be persisted. A saved Scenario is retained for later reuse in the Scenario Library. Temporary and saved Scenarios have the same domain meaning and behavior; persistence status does not create different Scenario types.

### Scenario Transformation

A Scenario Transformation applies a change to a Scenario and produces a new Scenario without modifying the original.

Transformations support experimentation, branching, and reuse. A transformation may change the Scenario's Events, Parameters, Policies, or temporal characteristics.

### Scenario Library

The collection of Scenarios available for reuse and composition.

The library does not distinguish templates from ordinary Scenarios. Any saved Scenario can serve as a building block for another Scenario or Trajectory.

### Event

An Event is a timestamped occurrence. An Event is represented by a single timestamp and an Event Type; it does not itself have a duration or recurrence.

Events occur within Scenarios. An Event's Type and associated behavior determine its financial consequences or establish a circumstance whose behavior remains active until another Event changes or ends it.

Examples include starting or ending employment, buying or selling a house, moving, receiving an inheritance or gift, buying a vehicle, RV, or boat, or taking a large one-time trip.

An Event may have immediate financial consequences or may establish behavior that affects calculations over subsequent time ticks. Recurrence is behavior associated with an Event Type, not a property of the Event record.

### Event Type

An Event Type defines reusable knowledge about how an Event behaves during calculation.

For example, an employment-start Event Type may establish an employment period that generates salary cash inflows each month until an employment-ending Event occurs. A one-time purchase Event Type may instead transform Financial State only at its timestamp.

Event Types do not belong to individual Scenarios; Scenarios contain Events that use the reusable Event Type behavior.

### Asset

An Asset is something with financial value that forms part of Financial State.

The initial product supports at least cash, ordinary taxable brokerage investments, 401(k), Traditional IRA, Roth IRA, HSA, high cash-value Whole Life insurance, and primary residential property.

Assets are represented at whatever modeling fidelity is useful to the user. A user may model an entire Equity position as one Asset, distinguish asset classes such as US Equity and Fixed Income, distinguish multiple positions with different expected behavior, or eventually represent individual securities. The domain does not require ticker-level fidelity.

### Asset Type

An Asset Type defines reusable knowledge about how an Asset behaves during calculation.

Asset Types form a hierarchy sufficient to represent materially different economic behavior. At minimum, the model distinguishes asset classes such as Cash, Fixed Income, Equity, Real Estate, and Insurance, with Whole Life as a specialized insurance type.

An Asset Type provides calculation behavior rather than user-specific economic parameters. For example, Equity behavior can determine growth and distributions using the Scenario's applicable parameters.

### Asset Holding Context

A holding context describes the tax or account wrapper in which an Asset is held. The same underlying Asset Type may be held in different contexts such as taxable Brokerage, Traditional Retirement, Roth Retirement, or HSA.

The holding context affects taxation, while the underlying Asset Type determines its economic growth and distribution behavior. The model therefore does not treat a 401(k) as a fundamentally different investment from the Equity or Fixed Income held within it.

The initial product does not require individual account-level fidelity beyond what is necessary to model these economic and tax distinctions.

### Cash

Cash is a Financial Asset. The initial product distinguishes at least Checking and HYSA where their different expected economic behavior matters.

Cash held incidentally inside investment or retirement accounts does not need to be modeled separately in the initial product unless doing so becomes materially useful to calculation behavior.

### Liability

A Liability is a financial obligation that reduces net worth. The initial product supports liabilities including mortgages and other debt where relevant to the modeled Financial State.

### Housing

Housing is part of a Scenario's financial circumstances. The initial product distinguishes owning and renting.

Buying and selling a home are Events that can transform Financial State and change the applicable housing circumstances. Property appreciation is an Asset Type behavior.

The initial product does not model rental-property investment economics such as vacancy, rental yield, property management, or detailed investment-property operations.

### Income and Cash Inflow

Income is not a manually maintained Scenario total. Cash inflows are calculated from active Events, Asset behavior, and other applicable financial behavior.

Cash inflows may arise from employment, interest, dividends, Social Security, pensions, inheritances, gifts, bond maturities, asset dispositions, or other Event and Asset Type behavior.

The domain distinguishes cash inflow from the narrower accounting meaning of income where useful. For example, selling an Asset creates a cash inflow but is not necessarily income; a Whole Life policy loan creates cash and a corresponding Liability rather than income.

### Spending

Spending is a Scenario Parameter representing the user's expected overall expenditure for the Scenario. It is not modeled as a detailed collection of household expenses.

Spending is combined with calculated cash inflows to determine the Scenario's net cash position for each time tick.

### Policy

A Policy describes how the difference between calculated cash inflows and Scenario Spending is reconciled with Financial State.

When the result is positive, Policies determine how surplus is allocated, for example by adding to Assets or paying down debt. When the result is negative, Policies determine how the shortfall is funded, for example by withdrawing from Assets or increasing debt.

Policies are ordered decisions where priority matters. Policies belong to a Scenario and do not continue across Scenario boundaries automatically. A user may copy Policies from one Scenario to another.

If the user's disposition strategy changes materially, the preferred modeling approach is to create a new Scenario rather than having an Event mutate the Policies of an existing Scenario.

### Economic Parameters

Economic Parameters are Scenario Parameters describing economic conditions or assumptions used during calculation, such as inflation, tax rates, and other economic values.

Asset-specific expected return or distribution behavior is not stored as a general Economic Parameter on the Asset Type. Asset Types provide reusable calculation behavior; the calculation uses the applicable Scenario Parameters and the Asset's modeled representation.

### Input Generator

An Input Generator produces variable inputs used by the calculation engine, such as investment returns, inflation, or other uncertain quantities.

Input Generators are deliberately separate from Scenario Parameters and from the calculations that consume them. A deterministic value can be used initially; a generator can later provide distributions or other variable inputs for repeated evaluation and Monte Carlo simulation.

### Time Tick

A Time Tick is the discrete period over which the calculation engine transforms one Financial State into the next.

The calculation model uses monthly ticks internally. Scenarios are date-based and may therefore be specified with month-level granularity. Yearly output is derived from the underlying monthly calculation results.

### Calculation

A Calculation derives financial consequences from an Initial State, a Trajectory, and applicable inputs.

For each Time Tick, the engine knows the Financial State at the beginning of the tick, determines which Event behaviors and Asset behaviors are active, applies Scenario Parameters and Policies, and produces the Financial State at the end of the tick.

Conceptually:

```text
Financial State(t)
    + active Event behavior
    + active Asset behavior
    + Scenario Parameters
    + Policies
    -> Financial State(t+1)
```

The calculation engine is separate from Scenario definition. The same engine evaluates the Master Trajectory, Alternative Trajectories, comparisons, and simulations.

The calculation model is composable: complex financial situations are constructed from reusable Types, Events, Assets, Policies, and Scenario Parameters rather than bespoke calculation paths.

### Annual Financial Snapshot

An Annual Financial Snapshot is the raw output of calculating a Trajectory for a particular year.

The core output is a yearly net-worth summary analogous to a Kubera net-worth snapshot. The raw annual data is the canonical basis for visualization, comparison, and further analysis.

The visualization may become arbitrarily rich, but the underlying yearly Financial State / net-worth data remains the fundamental result exposed for presentation and analysis.

### Calculation Result

A Calculation Result is the collection of financial outputs produced by evaluating a Trajectory from an Initial State.

A deterministic calculation produces one result for a Trajectory. A Monte Carlo evaluation produces a collection of simulation outcomes from which ranges, distributions, percentiles, standard deviations, and other statistical summaries can be derived.

Calculation Results are separate from Scenario and Trajectory definitions.

### Trajectory

A Trajectory is the complete bounded timeline being modeled: a defined start point, a defined end point, and one or more ordered, contiguous Scenarios covering the period between them.

A Trajectory is the primary unit of planning and calculation. The user always works in a Trajectory rather than calculating isolated Scenarios.

A Trajectory is conceptually a sequence or train of Scenario building blocks. Scenarios are represented as manipulable cards within the Trajectory in the product experience.

A Trajectory ends at the end of its final Scenario. There is no required terminal age or date.

### Master Trajectory

The Master Trajectory is the user's current preferred financial-life plan.

There is one active Master Trajectory for the planning workspace. Its calculation and visualization are kept current so that the application presents the user's current plan immediately.

The Master Trajectory is the stable starting point for experimentation.

### Alternative Trajectory

An Alternative Trajectory is a Trajectory used to explore a different possible plan without changing the Master Trajectory.

An Alternative may be created by duplicating the Master Trajectory or another Trajectory and then modifying its Scenarios. Multiple Alternatives may exist simultaneously and may be compared with the Master or with one another. An Alternative may be promoted to become the new Master Trajectory.

### Scenario and Trajectory Transformations

A Scenario Transformation or Trajectory Transformation applies a change and produces a new object without modifying the original.

Trajectory transformations include adding, removing, duplicating, replacing, resizing, reordering, or otherwise modifying Scenario cards. They support non-destructive experimentation.

### Monte Carlo Simulation

A Monte Carlo Simulation evaluates the same Trajectory repeatedly using generated inputs in order to understand the range of possible financial outcomes.

Monte Carlo does not require a separate financial calculation model. It repeatedly applies the same calculation engine with different Input Generator outputs.

## Domain Relationships

```text
Initial State
     │
     ▼
 Trajectory
     │
     ├── Scenario ──┐
     │   ├── Events │
     │   ├── Scenario Parameters
     │   └── Policies
     │               │
     │               ▼
     │          Calculation
     │               │
     │               ▼
     └──────── Financial State(t+1)

Event ──uses──> Event Type ──provides──> behavior
Asset ──uses──> Asset Type ──provides──> behavior

Scenario Parameters ──provide──> economic values
Input Generators ──may provide──> variable values for those inputs
```

## Domain Invariants

- Every Initial State has a date.
- Every Trajectory has a defined start and end.
- Every Trajectory contains at least one Scenario.
- The first Scenario in a Trajectory starts at the Initial State date.
- Scenarios within a Trajectory are ordered.
- Scenarios within a Trajectory are contiguous and non-overlapping.
- Together, the Scenarios cover the entire modeled period of the Trajectory.
- Every Scenario has a start and end time.
- Every Event belongs to a Scenario.
- An Event has one timestamp; recurrence and duration are behavior, not properties of the Event record.
- A Scenario is not itself a calculation or a Financial State.
- A Calculation transforms Financial State from one Time Tick to the next.
- Spending is a Scenario Parameter; total cash inflow is calculated.
- Policies reconcile positive or negative net cash flow with Financial State.
- Asset Types and Event Types provide reusable behavior; Scenarios provide the values and circumstances that vary between life plans.
- The same calculation engine is used for Master and Alternative Trajectories.
- Transforming a Scenario does not modify the source Scenario.
- Transforming a Trajectory does not modify the source Trajectory.
- There is no domain-imposed limit on the number of Alternative Trajectories that may exist or be compared.

## Deliberate Boundaries

- The product is a financial-life modeling and scenario exploration tool, not a tax optimization system.
- Tax calculations are intentionally approximate and circumstance-driven rather than comprehensive jurisdiction-specific tax engines.
- Detailed rental-property investment modeling is not part of the initial domain; simple owning/renting circumstances and buying/selling a home are sufficient initially.
- The product does not require ticker-level portfolio fidelity. Users choose their desired modeling fidelity.
- Detailed household budgeting is out of scope; Spending is an aggregate Scenario Parameter.
- Visualization is not the domain model. It consumes calculation output and may evolve independently.
- Monte Carlo is not a separate calculation engine; it is repeated evaluation of the same engine using Input Generators.
- Scenarios are not templates. All saved Scenarios are reusable building blocks.
