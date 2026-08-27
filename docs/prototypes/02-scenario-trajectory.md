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

- **Is Event sufficiently expressive, or are some asset behaviors better modeled
  differently?** Untested here on purpose — Events stayed purely descriptive (just a
  name and timing shape), no financial effect attached, since that's calculation
  engine territory (prototype 03). What this prototype does show: three timing shapes
  (instantaneous/recurring/durationBased) were enough to express every example event
  in the doc without needing a fourth kind.
- **Is the Scenario data structure becoming too broad?** No — five fields
  (start/end/events/policies/parameters) stayed enough for both test scenarios.
- **Are policies naturally composable?** Untested for real — they're inert data here
  (`{ id, kind, priority }`), never evaluated. Real composability (does changing
  priority order actually change outcomes without changing the calculation) is
  prototype 03's question, not this one's.
- **Is Scenario reuse actually useful or does copying dominate?** Copying dominated in
  this prototype, but that may be an artifact of the design, not the domain: a
  Trajectory holds full Scenario values rather than references into a shared library
  (see below), so every placement is structurally a copy already.
- **Are Trajectory transformations pleasant enough to support the eventual canvas
  UI?** Broadly yes for the 8 required operations, but resize needed a real design
  call to feel right — see below.

Design decisions this prototype had to make that the doc left ambiguous, worth
revisiting before prototype 04 builds a UI on top of them:

- The doc puts `start`/`end` directly on Scenario, but also says Scenarios have
  "stable identity" and are "reusable" across Trajectories — those pull in different
  directions, since baked-in absolute dates can't be the same object placed at two
  different times. This prototype resolved it by making Trajectory hold full Scenario
  *values* (not references into a shared library) and treating "reuse" as
  duplicate-then-place. That's simple and testable, but it means there's no actual
  Scenario Library yet, and no way to see "this Scenario is used in 3 Trajectories" —
  worth deciding explicitly before the canvas UI needs that information.
- Resize turned out to have two plausible interpretations: cascade the whole
  downstream timeline, or drag just the shared boundary with the immediate neighbor.
  This prototype implemented the latter (a Scenario's neighbor absorbs the
  change, nothing further away moves) because it reads closer to "manipulable cards"
  than a full re-flow — but a real user dragging a card edge might expect the whole
  timeline to compress/expand instead. This is a genuine UX question, not just an
  implementation detail, and worth validating once there's a canvas to try it on.
