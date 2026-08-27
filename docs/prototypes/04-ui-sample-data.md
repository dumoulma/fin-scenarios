# Prototype 04 — UI with Sample Data

## Purpose

Test the central product interaction rather than production UI architecture: a user sees one Trajectory, represented as a train of Scenario cards, and can play with the plan while the financial projection updates.

Use sample data initially. The UI prototype does not need Kubera or persistence to prove the interaction.

## Core experience

The first screen should communicate:

```text
Initial State
     ↓
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Working    │→ │   Travel    │→ │   Japan     │
│  2026–2032  │  │    2033     │  │  2034–2040  │
└─────────────┘  └─────────────┘  └─────────────┘
                         │
                         ▼
                 Financial projection
                         │
             ┌───────────┴───────────┐
             │                       │
          Net worth             other charts
             by year
```

The exact visual design is intentionally open. The important thing is the interaction model.

## Required interactions

- View the Master Trajectory.
- See Scenario cards arranged as a contiguous timeline.
- Add a Scenario.
- Duplicate a Scenario.
- Delete a Scenario.
- Resize a Scenario.
- Modify Scenario details.
- Recalculate and immediately see the resulting projection.
- Duplicate the Master Trajectory as an Alternative.
- Modify the Alternative without changing the Master.
- Display Master and selected Alternatives for comparison.

An Alternative should make experimentation feel cheap and reversible.

## Sample scenarios

Provide at least these alternatives:

### Master

Work in the USA → retire in USA.

### Alternative A

Work in USA → travel for a year → retire in Japan.

### Alternative B

Work longer → retire at 65 → remain in USA.

### Alternative C

Work in USA → move to SF → rent rather than own → later retire.

The point is not to produce financially perfect projections. The point is to make the differences immediately visible.

## Visualization

The canonical data source is the Calculation Result, especially Annual Financial Snapshots.

At minimum visualize:

- net worth by year
- assets vs liabilities if available from sample Financial State
- Scenario boundaries on the timeline
- the currently selected Trajectory
- comparison of multiple Trajectories

Do not put financial calculation logic into the UI.

## Acceptance criteria

- A user can understand the current Trajectory without reading documentation.
- Scenario cards clearly communicate their period and purpose.
- Changing a Scenario visibly changes the projection.
- Creating an Alternative preserves the Master projection.
- Two or three Alternatives can be compared without requiring a different calculation model.
- The projection is derived from calculation output rather than duplicated UI-specific financial logic.
- The interaction feels fast enough that changing a scenario and seeing the result encourages experimentation.

## Deliberately do not solve yet

- production visual design system
- responsive/mobile polish
- authentication
- persistence
- live Kubera connection
- full LLM scenario construction
- comprehensive chart library
- Monte Carlo visualization beyond proving that the result shape can support it

## Questions to record after the prototype

- Does the card-on-canvas metaphor actually work?
- Is the distinction between Master and Alternatives intuitive?
- Which Scenario properties need to be editable directly on the card?
- Which changes should be instant versus requiring an explicit recalculate action?
- What information does the user need to understand why net worth changed?
- Does comparison need to be a separate mode or part of the main view?
