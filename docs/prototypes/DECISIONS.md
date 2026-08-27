# Prototype Series — Consolidated Decisions & Findings

All four prototypes (`01-kubera-import` through `04-ui-sample-data`) are built,
tested, and connected end to end. Each prototype's own doc has its detailed
"Questions to record" answers — this pulls together the decisions and open questions
that actually matter for the full product spec, per `README.md`'s stated goal:
"record meaningful discoveries... before moving toward the full product
specification." Read the individual docs for the reasoning behind each item; this is
the summary meant to be scanned, not re-derived.

## What actually got validated

- **Kubera → Initial State is a viable seam.** Real account data (live API, not just
  the fixture) maps cleanly into the required Asset/Liability vocabulary, and the
  import summary (recognized/aggregated/ignored/needs-manual-input) makes the
  boundary of what the model represents visible rather than a silent black box.
- **The pure-functional, immutable design was the right bet, consistently.** Every
  prototype benefited from it in a different way: 02's transformations are trivial to
  test and to prove non-interference between Master/Alternatives; 03's determinism
  and Input-Generator-swap acceptance criteria were the easiest tests to write in the
  whole series; 04's "recalculate instantly" requirement turned out to be free —
  `useMemo` keyed on object identity does it, because nothing ever mutates in place.
- **The Asset-behavior-as-generic-function model held up under the hardest test.**
  Whole Life — the prototype's own designated flexibility test — fit into the same
  per-kind switch as every other asset, with exactly one extra field
  (`policyLoanBalance`) as the real, honest asymmetry. No special-purpose engine was
  needed.
- **Throwaway prototyping surfaced findings spec-writing wouldn't have.** A stale
  duplicate mortgage entry, a Canadian TFSA with no equivalent asset kind, a 401(k)
  named without "401(k)" in it, and a negative-SVG-height rendering bug caught only
  by actually loading the page in a browser — none of these were anticipated by the
  prototype docs; all of them came from running real (or realistically messy) data
  through the system.

## Decisions made that should carry forward

- **Aggregate financial accounts by (kind, wrapper, currency), not 1:1 with source
  accounts.** Multiple checking/brokerage accounts of the same kind and currency
  collapse into one Asset. This is also *why* prototype 03/04 integration was
  tractable — Events can reference "the 401(k)" by a stable id because there's never
  more than one per kind/wrapper/currency to disambiguate.
- **Net worth is reported per currency, not as one number.** Multi-currency is
  normal, not an edge case (`01`) — and the integration step had to re-enforce the
  same principle at a different layer (`04`'s adapter filters and reports non-USD
  assets rather than silently mixing them). This is a cross-cutting concern with no
  single owner yet — worth deciding explicitly in the product spec, not re-solving
  ad hoc at each layer that touches money.
- **Mandatory cash outflows are distinct from policy-claimed surplus, and the
  product doc doesn't currently make that distinction.** Tax and a liability's
  *regular* scheduled payment are mandatory; spending and *extra* principal payments
  are ordered claims on what's left. Getting this split right was the single
  trickiest design decision in the calculation engine (`03`).
- **Live Kubera access must never happen from browser-facing code.** Confirmed as an
  explicit architectural boundary during integration (`04`) — a real product needs a
  server/proxy layer between a browser client and the Kubera API, not a different
  fetch call.
- **Instant recalculation, no explicit "Recalculate" action.** Directly answered by
  `04`: nothing in this model is expensive enough to need debouncing, and the
  immutable design makes "recompute only when something actually changed" free.

## Open questions the next phase needs to resolve

- **Is there a real Scenario Library, or just duplicate-and-place?** `02`/`04` both
  punted on this — a Trajectory holds full Scenario values, not references into a
  shared, reusable store. That's simple and testable, but there's currently no way
  to see "this Scenario is used in 3 Trajectories," which the domain doc's own
  "reusable building block" language implies should exist.
- **What does the user need to understand *why* net worth changed?** Unanswered by
  `04` — the projection line just moves. Likely the single most important open UI
  question before a real product ships.
- **Is boundary-drag the right resize semantic, or should it cascade?** `02` picked
  boundary-drag (resizing a card only affects its immediate neighbor) over
  re-flowing the whole downstream timeline, but this was never validated against an
  actual drag interaction — `04` used a stepper instead of true drag-to-resize. Real
  UI engineering work, not yet done.
- **Where do non-US tax-advantaged accounts live?** A Canadian TFSA (`01`) has no
  equivalent in the current Asset model — not a detail gap, a category gap.
- **Housing Circumstance was never built.** `04`'s "rent rather than own" sample
  Trajectory faked it (no `realProperty` asset, rent folded into `spending`) rather
  than modeling a first-class renting/owning distinction, which
  `docs/domain/CONTEXT.md` explicitly calls for.
- **Zero-value entries need a product-level answer, not just an importer flag.**
  `01` correctly routes a $0 balance in a supported category to "needs manual
  input" (paid off vs. stale duplicate connection are both plausible) — but nothing
  yet defines what the *user* does with that flag once surfaced.
- **Name-based classification is doing real, brittle work.** Whole Life, IRA vs.
  Roth IRA, 401(k) detection all key off account names because Kubera's own
  categories don't distinguish them — and a real 401(k) named without "401(k)" in it
  correctly fell through to manual input rather than being silently misclassified.
  Worth a better signal source (or an explicit user-confirmation step) before this
  scales past a handful of account-naming conventions.
