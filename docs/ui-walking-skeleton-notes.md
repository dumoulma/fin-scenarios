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
- **Rename inline, delete inserted scenarios.**
- **Click the chart to inspect any point in time** — the summary strip below shows
  net worth, month, and change-from-start for whatever's selected; defaults to the
  end of the trajectory.

There is no backend: `core/`'s engine is plain TypeScript with no Node-only APIs, so
it's imported straight into the Vite/React app via a `@core` path alias
(`ui/vite.config.ts`) and runs client-side. Every edit re-runs the real `calculate()`
against the real domain objects — nothing in this app is illustrative/mocked, unlike
the earlier design sketches.

## What was deliberately left out of this first pass

- **Duplicate Trajectory / compare view.** The design guide treats this as the whole
  point of the product, but today's work specifically validated the timeline-editing
  interactions (resize/insert/inspect) — adding compare is a natural, contained next
  step, not included here to keep this pass focused.
- **Events/Policies editing UI.** Scenarios use whatever parameters/policies the
  quiet-millionaire trajectory (or an inserted scenario's copied neighbor) already
  has; there's no form to edit them yet.
- **Master/Alternative promotion, Kubera import flow.** Out of scope for a walking
  skeleton; both already exist at the domain/adapter level in `core/`.

## One real bug found while verifying this (via `ui/verify.mjs`, a Playwright smoke test)

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

## Known rough edge

A scenario resized or inserted down to only a few months wide can become narrower
than the two 14px-wide handles flanking it, making it hard to grab the scenario's
own content (rename field, delete button) without hitting a neighboring handle
first. Not fixed here — real usage is unlikely to produce sub-year scenarios by
accident (insert defaults to half the neighbor's remaining duration), but a minimum
practical width is worth revisiting if it comes up.
