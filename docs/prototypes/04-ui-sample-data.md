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

- **Does the card-on-canvas metaphor actually work?** Basically yes, even in this
  prototype's cheapest possible version (a horizontal row of boxes, no drag). Seeing
  the cards next to their chart, and watching the chart redraw the instant a card
  changes, is what makes the timeline read as "one editable plan" rather than a form.
  The thing that's still unproven is drag-to-resize specifically (this prototype used
  a ±1-month stepper instead) — that's a real UI engineering project on its own and
  deserves its own pass before betting the interaction model on it.
- **Is the distinction between Master and Alternatives intuitive?** The mechanics are
  sound (duplicate, edit independently, promote) and the isolation is real, not just
  presented — but a plain list with a "Master" badge and checkboxes is doing the
  minimum, not proving intuitiveness. That needs an actual user in front of it, not
  just an engineer confirming the state management is correct.
- **Which Scenario properties need to be editable directly on the card?** Name and
  total monthly spending turned out to be enough to make edits feel meaningful and
  see them move the chart. Income, individual Events, and Policy priority all stayed
  edit-only-in-code for this prototype — putting those on the card is real UI design
  work (probably not more fields on the same card, more likely a detail panel).
- **Which changes should be instant versus requiring an explicit recalculate
  action?** Answered directly: instant, always. `useMemo` keyed on the Trajectory
  object means recalculation happens automatically and cheaply on every edit — there
  was never a reason to add a "Recalculate" button, and the immutable-by-construction
  design from 02/03 is exactly what makes that free.
- **What information does the user need to understand why net worth changed?** This
  prototype doesn't answer it — the line just moves. Watching the demo trajectory,
  the honest gap is clear: a user editing a card has no way to see *why* the
  projection moved (which policy claimed the surplus, whether an Event fired, whether
  a shortfall occurred) without reading the composition chart and doing the math
  themselves. That's probably the single most important next UI question.
- **Does comparison need to be a separate mode or part of the main view?** Part of
  the main view worked fine here — a checkbox per Trajectory, overlaid lines with a
  legend. No separate "compare mode" was needed for 2-3 Trajectories; that question
  would resurface if the number of Alternatives grew much larger.

An unanticipated finding: this was the only prototype where a real rendering bug
surfaced in end-to-end verification that the type system and unit tests both missed —
a cash shortfall (a legitimate state the calculation engine allows) produced a
negative asset value, which produced an invalid negative SVG `height` attribute,
silently failing to render that bar rather than crashing. Caught only by actually
loading the page in a browser and checking the console, not by `tsc` or `vitest` —
a concrete instance of why "start the dev server and look at it" is a separate step
from "the tests pass."
