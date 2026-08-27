# Prototype 02 — Scenario & Trajectory Model

## Purpose

Test whether the core planning model is as simple and composable as it sounds before building a calculation engine around it.

The prototype should treat Scenarios as reusable building blocks and a Trajectory as the bounded, contiguous sequence in which those building blocks are composed.

## What we want to learn

- Is the Scenario model expressive enough for real life circumstances?
- Are Events, Policies, and Parameters a sufficient Scenario structure?
- Are Scenario and Trajectory transformations easy to express immutably?
- Do the contiguous timeline invariants remain simple when durations change?
- Does duplicating the Master Trajectory produce a useful Alternative naturally?
- Does the model remain understandable when Scenarios are reused?

## Core model to prototype

```text
Scenario
├── identity
├── start / end
├── Events
├── Policies
└── Parameters

Trajectory
├── start / end
└── ordered Scenario references
```

A Scenario is both a description of circumstances and the Events that occur during those circumstances. Do not introduce a separate `Circumstances` domain object unless the prototype demonstrates a real need.

Parameters are numerical inputs such as inflation and expected returns. Input Generators are deliberately separate and can initially provide constants.

## Required transformations

Prototype immutable operations for:

- create Scenario
- modify Scenario → new Scenario
- duplicate Scenario
- create Trajectory
- add Scenario
- remove Scenario
- duplicate Scenario within a Trajectory
- replace Scenario
- resize Scenario
- reorder Scenario
- duplicate an entire Trajectory
- promote an Alternative to Master

Changing one Scenario's duration should maintain the contiguous train by moving the neighboring Scenario boundary as appropriate.

## Test scenarios

Use examples such as:

```text
Working in USA
    ↓
Travel around the world
    ↓
Retirement in Japan
```

and:

```text
NYC ownership
    ↓
SF rental
    ↓
SF ownership
```

Include Events such as job changes, house purchase/sale, moving costs, a $25k trip, and a zero-income/zero-spending period.

Create at least two Alternative Trajectories from the same Master and make independent changes to them. Verify that changing an Alternative never changes the Master or another Alternative.

## Acceptance criteria

- Scenarios have stable identities and can be reused.
- A Trajectory is always contiguous, ordered, bounded, and contains at least one Scenario.
- Scenario transformations are immutable.
- Trajectory transformations are immutable.
- Neighboring Scenario boundaries adjust correctly when duration changes.
- An Alternative can be copied from the Master and changed independently.
- Events can be instantaneous or duration-based without requiring a separate concept for every kind of life change.
- Policies belong to Scenarios and can be copied when desired; they do not need to persist across Scenario boundaries.
- Automated tests express the domain invariants through the public operations rather than testing implementation details.

## Questions to record after the prototype

- Is Event sufficiently expressive, or are some asset behaviors better modeled differently?
- Is the Scenario data structure becoming too broad?
- Are policies naturally composable?
- Is Scenario reuse actually useful or does copying dominate?
- Are Trajectory transformations pleasant enough to support the eventual canvas UI?
