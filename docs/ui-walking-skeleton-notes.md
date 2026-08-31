# UI walking skeleton — implementation notes

`ui/` is the first real UI, wired to the real `core/` engine — not another throwaway
prototype. `npm install && npm run dev` (from `ui/`), then open http://localhost:5173.

## What it is

A single page rendering the real `quietMillionaireTrajectory` (8 scenarios, 40 years,
imported directly from `core/src/scenarios/quietMillionaire.ts`) as an interactive
timeline, with a net-worth chart sharing its time axis, per the confirmed interaction
design in `docs/ui-design-guide.md` §5:

- **Drag a scenario edge to resize it.** Calls the real `resizeScenario` — only the
  immediate neighbor absorbs the change, nothing else moves.
- **Click "+" between two scenarios to insert one.** Calls the new `insertScenario`
  (added to `core/src/domain/trajectory.ts` for this) — no dialog, splits the
  neighbor's remaining duration in half immediately.
- **Rename inline, delete inserted scenarios.** Delete calls the new `deleteScenario`
  (also added to `core/`) — the inverse of `insertScenario`: the freed duration goes
  back to the following Scenario, keeping the trajectory's total length fixed. This
  is deliberately *not* the same as the pre-existing `removeScenario`, which cascades
  every later Scenario earlier and shrinks the trajectory instead — that's a real,
  different, already-tested operation, just not the one this interaction model needs.
- **Click the chart to inspect any point in time** — the summary strip below shows
  net worth, month, and change-from-start for whatever's selected; defaults to the
  end of the trajectory.
- **Duplicate a Trajectory into an Alternative and compare.** Uses the existing
  `duplicateTrajectory` plus the domain's `Workspace` shape (`master` +
  `alternatives`). Tabs above the timeline switch which Trajectory is being edited;
  the chart always plots every Trajectory in the Workspace at once (Master solid,
  Alternatives dashed in distinct colors), matching docs/ui-design-guide.md §16 —
  "no separate comparison calculator," just the same `calculate()` run once per
  Trajectory. Editing one Trajectory never touches another's data.

There is no backend: `core/`'s engine is plain TypeScript with no Node-only APIs, so
it's imported straight into the Vite/React app via a `@core` path alias
(`ui/vite.config.ts`) and runs client-side. Every edit re-runs the real `calculate()`
against the real domain objects — nothing in this app is illustrative/mocked, unlike
the earlier design sketches.

## What was deliberately left out

- **Events/Policies editing UI.** Scenarios use whatever parameters/policies the
  quiet-millionaire trajectory (or an inserted scenario's copied neighbor) already
  has; there's no form to edit them yet.
- **Promoting an Alternative to Master, Kubera import flow.** Out of scope for a
  walking skeleton; both already exist at the domain/adapter level in `core/`
  (`promoteToMaster`, the Kubera importer) — just not wired into this UI yet.

## Bugs found while verifying this (via `ui/verify.mjs`, a Playwright smoke test)

The resize handle initially did nothing when dragged. Root cause: the handle was
rendered as a child of its scenario's own `.block`, but the *next* block (later in
DOM order, same `position: relative` stacking level) painted over the boundary
region regardless of the handle's own `z-index` — z-index only wins comparisons
within the same parent's stacking contribution, not across sibling subtrees. Fixed
by moving handles (and the insert "+" buttons, which had the same class of issue) to
be direct siblings of the runway rather than nested inside a scenario block.

A second, related issue: the insert "+" button sat vertically centered on the same
boundary as the resize handle, so dragging from dead-center hit insert instead of
resize. Fixed by moving the insert button above the timeline strip instead of
overlapping it — the two affordances no longer compete for the same pixels.

A third issue, caught by the delete step of the same smoke test: deleting a scenario
made the *whole trajectory* two years shorter instead of just closing the gap
locally. The delete handler was calling `removeScenario`, whose real (already-tested)
semantic is to cascade every later Scenario earlier, preserving each one's own
duration but shrinking the total — the opposite of the boundary-drag model resize
and insert both use. Fixed by adding `deleteScenario`, the actual inverse of
`insertScenario`: the freed time goes to the following Scenario instead of vanishing
from the total.

## Known rough edge

A scenario resized or inserted down to only a few months wide can become narrower
than the two 14px-wide handles flanking it, making it hard to grab the scenario's
own content (rename field, delete button) without hitting a neighboring handle
first. Not fixed here — real usage is unlikely to produce sub-year scenarios by
accident (insert defaults to half the neighbor's remaining duration), but a minimum
practical width is worth revisiting if it comes up.
