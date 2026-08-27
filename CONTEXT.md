# Domain Context

## Purpose

This document defines the domain language for the financial-life modeling product. It intentionally contains no implementation details. The product models a person's financial life as a Trajectory composed of reusable Scenarios, evaluates that Trajectory from an Initial State, and presents the resulting financial position over time.

## Core Concepts

### Initial State

The financial state from which a Trajectory begins. It represents what the user owns, owes, and otherwise has financially at the start of the modeled period.

The Initial State is separate from Scenarios and Trajectories. It is the starting point for calculation, not a description of future circumstances.

An Initial State may be populated from an external source such as Kubera rather than manually recreated by the user.

### Scenario

A Scenario is a reusable, independently identifiable description of a person's life and financial circumstances during a defined period.

A Scenario is **not** a calculation. It describes circumstances from which the calculation engine derives financial consequences.

Examples include:

- working in the USA
- taking a year off to travel the world
- living in Costa Rica as a bridge period
- retirement in Japan
- renting rather than owning a home

A Scenario has a stable identity and may be reused in multiple Trajectories.

A Scenario can be transformed into a new Scenario without modifying the original. There is no separate concept of a template: every Scenario is potentially a reusable building block.

### Scenario Lifecycle

A Scenario may be temporary or saved.

A temporary Scenario is being explored and need not be persisted. A saved Scenario is retained for later reuse in the Scenario Library. Temporary and saved Scenarios have the same domain meaning and behavior; persistence status does not create different Scenario types.

### Scenario Transformation

A Scenario Transformation applies a change to a Scenario and produces a new Scenario without modifying the original.

Transformations support experimentation, branching, and reuse. A transformation may change the circumstances or temporal characteristics of a Scenario.

### Scenario Library

The collection of Scenarios available for reuse and composition.

The library does not distinguish templates from ordinary Scenarios. Any saved Scenario can serve as a building block for another Scenario or Trajectory.

### Event

An Event is something that occurs at a point in time and may change financial state, life circumstances, or both.

Events may occur within a Scenario or at the boundary between Scenarios.

Examples include:

- changing jobs
- retiring
- moving from NYC to San Francisco
- moving from the USA to Japan
- buying a house
- selling a house
- incurring a large moving expense
- buying a vehicle, RV, or boat

An Event does not necessarily define a Scenario. An Event may instead be an occurrence within a Scenario.

### Trajectory

A Trajectory is the complete bounded timeline being modeled: a defined start point, a defined end point, and one or more ordered, contiguous Scenarios covering the period between them.

A Trajectory is the primary unit of planning and calculation. The user works in a Trajectory rather than calculating isolated Scenarios.

A Trajectory is conceptually a sequence or train of Scenario building blocks. In the product, Scenarios are represented as manipulable cards within the Trajectory.

A Trajectory always has a start and an end. Its Scenarios determine the duration and partition the modeled period.

### Master Trajectory

The Master Trajectory is the user's current preferred financial-life plan.

There is one active Master Trajectory for the planning workspace. Its calculation and visualization are kept current so that opening the application presents the user's current plan and its financial projection immediately.

The Master Trajectory is the stable starting point for experimentation.

### Alternative Trajectory

An Alternative Trajectory is a Trajectory used to explore a different possible plan without changing the Master Trajectory.

An Alternative may be created by duplicating the Master Trajectory or another Trajectory and then modifying its Scenarios. Multiple Alternatives may exist simultaneously, with no domain-imposed limit.

An Alternative can be compared with the Master or with any other Trajectory. An Alternative may also be promoted to become the new Master Trajectory.

### Trajectory Transformation

A Trajectory Transformation applies a change to a Trajectory and produces a new Trajectory without modifying the original.

Examples include adding, removing, duplicating, replacing, resizing, or otherwise modifying Scenarios.

### Asset

An Asset is something with financial value that forms part of the financial state.

The initial product must support at least:

- ordinary taxable brokerage investments
- cash and high-yield savings accounts
- 401(k) accounts
- Roth IRA accounts
- IRA accounts
- high cash-value whole-life insurance policies
- primary residential property

Assets may have different financial behaviors and quirks. The domain therefore requires an asset-type hierarchy capable of representing materially different kinds of assets without making Scenarios responsible for asset-specific calculation logic.

### Liability

A Liability is a financial obligation that reduces net worth.

The initial product must support liabilities associated with the supported financial state, including mortgages.

### Housing Circumstance

A Housing Circumstance describes whether and how the person is housed during a Scenario.

The initial product needs to distinguish at least renting and owning. It must support significant housing Events such as buying or selling a house.

The initial product does **not** attempt to model rental-property economics such as vacancy, rental yield, property management, or detailed investment-property operations.

### Income

Income is a financial inflow associated with a Scenario or Event.

Scenarios may specify ongoing income circumstances, such as salary or other recurring income. Income can change between Scenarios.

### Spending

Spending is a financial outflow associated with a Scenario or Event.

Scenarios may specify ongoing spending circumstances. Significant one-time or time-bounded expenditures may be represented by Events or other scenario-level financial circumstances.

Examples include travel, moving costs, buying a vehicle, or a major vacation period.

### Tax Assumption

A Tax Assumption represents an estimate of taxes relevant to a Scenario, Event, or financial asset behavior.

The product is not a tax optimization calculator and does not attempt to provide jurisdiction-specific tax optimization. Taxes are modeled sufficiently to produce useful financial projections, using assumptions appropriate to the circumstances being modeled.

This allows, for example, a Costa Rica Scenario to contain an appropriate estimated tax assumption without requiring the calculation engine to implement the complete Costa Rican tax system.

### Input Generator

An Input Generator produces variable inputs used by the calculation engine, such as investment returns, inflation, or other uncertain quantities.

Input Generators are deliberately separate from Scenario variables and from the calculations that consume them.

This separation allows the same Scenario and calculation model to be evaluated deterministically or repeatedly with generated inputs, including Monte Carlo simulation.

### Calculation

A Calculation derives financial consequences from an Initial State, a Trajectory, and the applicable inputs.

The calculation engine is separate from Scenario definition. A Scenario describes circumstances; the engine knows how those circumstances transform financial state over time.

The same calculation engine is used for the Master Trajectory, Alternative Trajectories, comparisons, and simulations.

### Annual Financial Snapshot

An Annual Financial Snapshot is the raw output of calculating a Trajectory for a particular year.

The core output is a yearly net-worth summary analogous to a Kubera net-worth snapshot. The raw annual data is the canonical basis for visualization, comparison, and further analysis.

The visualization may become arbitrarily rich, but the underlying yearly financial snapshots remain the fundamental result.

### Calculation Result

A Calculation Result is the collection of Annual Financial Snapshots produced by evaluating a Trajectory from an Initial State.

A deterministic calculation produces one result for a Trajectory. A Monte Carlo evaluation produces a collection of simulation outcomes from which ranges, distributions, percentiles, and other statistical summaries can be derived.

Calculation Results are conceptually separate from the Scenario and Trajectory definitions.

### Monte Carlo Simulation

A Monte Carlo Simulation evaluates the same Trajectory repeatedly using generated inputs in order to understand the range of possible financial outcomes.

Monte Carlo does not require a separate financial calculation model. It repeatedly applies the same calculation engine with different generated inputs.

## Domain Invariants

- Every Trajectory has a defined start and end.
- Every Trajectory contains at least one Scenario.
- Scenarios within a Trajectory are ordered.
- Scenarios within a Trajectory are contiguous and non-overlapping.
- Together, the Scenarios cover the entire modeled period of the Trajectory.
- A Trajectory is calculated from an Initial State.
- A Scenario is not itself a calculation or a calculated financial state.
- Transforming a Scenario does not modify the source Scenario.
- Transforming a Trajectory does not modify the source Trajectory.
- The calculation engine is shared across Master and Alternative Trajectories.
- Every calculated Trajectory produces Annual Financial Snapshots using the same fundamental output contract.
- There is no domain-imposed limit on the number of Alternative Trajectories that may exist or be compared.

## Product Interaction Model

The user experience centers on one Trajectory at a time, visualized as a timeline of Scenario cards. The visualization is kept current with the Trajectory's latest calculation.

The normal workflow is:

1. Populate the Initial State, preferably by connecting a source such as Kubera.
2. Create an initial Scenario and place it into a new Trajectory.
3. Calculate and visualize the Trajectory.
4. Add, remove, duplicate, resize, reorder, or modify Scenario cards to make the financial life more detailed.
5. Duplicate the Master Trajectory to explore an alternative.
6. Modify the alternative and immediately see how its financial projection changes.
7. Compare any selected set of Trajectories.
8. Promote a preferred Alternative to become the new Master Trajectory.

The central product loop is:

**construct → calculate → visualize → change something → see what happens → compare → update the plan**

## LLM Scenario Construction and Validation

An LLM-based capability may assist with constructing and validating Scenarios and Trajectories from natural-language descriptions.

The LLM should translate user intent into explicit domain concepts rather than performing financial calculations itself.

For example, a request to move from NYC to San Francisco may require recognizing a Scenario boundary and identifying related Events and circumstances such as selling a home, moving costs, and beginning a rental period.

The LLM should help identify missing, ambiguous, contradictory, or potentially overlooked circumstances and consequences. It should distinguish known information, assumptions, missing information, and potentially relevant considerations rather than silently inventing important financial inputs.

The resulting structured Scenario or Trajectory must be understandable and inspectable independently of the LLM and must be suitable for the deterministic calculation engine.

## Deliberate Boundaries

- The product is a financial-life modeling and scenario exploration tool, not a tax optimization system.
- Tax calculations are intentionally approximate and circumstance-driven rather than comprehensive jurisdiction-specific tax engines.
- Detailed rental-property investment modeling is not part of the initial domain; simple renting/owning circumstances and buying/selling a home are sufficient initially.
- Visualization is not the domain model. It consumes Annual Financial Snapshots and may evolve independently.
- Monte Carlo is not a separate calculation engine; it is repeated evaluation of the same engine using Input Generators.
- Scenarios are not templates. All saved Scenarios are reusable building blocks.
