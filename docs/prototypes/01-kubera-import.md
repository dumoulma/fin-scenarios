# Prototype 01 — Kubera Import

## Purpose

De-risk the onboarding path from a user's existing financial life into an **Initial State**.

The product should not make the user manually recreate their financial life in a planning application. This prototype tests whether a Kubera snapshot can be translated into the small, useful financial model the calculation engine needs.

## What we want to learn

- What information can realistically be obtained from Kubera?
- What level of aggregation is sufficient for the Initial State?
- How should accounts and assets map into our Asset hierarchy?
- What information is missing and therefore needs a user-supplied value?
- Can the import be deterministic and inspectable?
- Does the Initial State model feel too detailed or too thin once populated with real data?

## Prototype scope

Implement a local import path that:

1. Reads representative Kubera data.
2. Normalizes it into the domain's Initial State.
3. Produces assets and liabilities at the level required by the prototype calculation.
4. Preserves the Initial State date.
5. Produces a readable import summary showing what was recognized, aggregated, ignored, or requires manual input.

Use a fixture if live Kubera access is inconvenient. The fixture should resemble the shape and messiness of real data rather than being an artificially perfect example.

## Deliberately do not solve yet

- Live production authentication or account linking UX.
- Continuous synchronization.
- Individual security-level holdings.
- Comprehensive account identity and reconciliation.
- Tax-lot information.
- Production persistence.
- Every possible Kubera asset type.

The prototype should prove that **Kubera → Initial State** is a viable seam, not build a complete integration.

## Test scenario

Use a realistic Initial State containing at least:

- taxable brokerage investments
- cash / HYSA
- 401(k)
- Roth IRA
- IRA
- Whole Life cash value
- primary residence
- mortgage

The resulting Initial State should be understandable as a net-worth snapshot: what is owned, what is owed, and the resulting net worth.

## Acceptance criteria

- A fixture can be transformed into an Initial State without hand-editing the resulting domain data.
- The Initial State has an explicit date.
- Supported financial positions are represented using the domain Asset/Liability vocabulary.
- Aggregation is sufficient to calculate a first projection.
- Unknown or unsupported source information does not silently disappear; the prototype makes the limitation visible.
- Automated tests cover representative mappings and important failure/unknown cases.

## Questions to record after the prototype

Answered against a live Kubera account (real API, not just the fixture) plus a
synthetic fixture shaped the same way.

- **Is the Initial State too aggregate?** No — aggregating by (kind, wrapper,
  currency) worked cleanly. The one thing aggregation can't paper over is currency:
  a real account mixes USD, CAD, and JPY, so a single "Cash" total has to stay split
  by currency rather than summed into one number.
- **Do we need account identity sooner than expected?** A bit. Calculation doesn't
  need it, but a trustworthy import summary does — e.g. a $0 mortgage line next to a
  real one is only obviously a stale duplicate once you know they're two data
  sources reporting on the same loan. Right now that's a human reading two summary
  lines and using judgment, not something the model represents.
- **Which Asset types need more detail?** None of the required ones needed more than
  balance + currency for this prototype. The real gap isn't detail, it's coverage:
  Kubera holds real positions we have no category for at all — a Canadian TFSA,
  incentive stock options, GICs/term deposits.
- **Which Kubera fields are genuinely useful?** `sheetName`/`subType`/`assetClass`
  cover most of it, but not all — the whole life policy was only identifiable by
  matching the account's own name ("Whole Life"), since Kubera has no dedicated
  category for it. `parent` was essential: real accounts list each ETF/fund/coin as
  its own line item pointing back at the account, and skipping those is the only way
  to avoid double-counting the account's total.
- **What should happen when the source has info our model doesn't represent?** This
  worked well in practice. Every unmapped item lands in "ignored" (crypto, stock
  options, GICs, credit cards) or "needs manual input" (TFSA, ambiguous retirement
  plans, zero-value entries, missing values) with a stated reason — nothing vanished
  silently, which was the actual bar.

Unanticipated findings worth carrying into the next prototype:

- A zero balance in a supported category is genuinely ambiguous — paid off, or a
  stale/disconnected duplicate account — and always needs a human to confirm it.
- Name-based matching (for whole life, IRA vs. Roth IRA, 401(k)) is doing real work
  that category fields can't. It's also brittle: a real 401(k) named
  "Gusto/Guideline - ***3237" didn't match anything and correctly fell through to
  manual input instead of being silently misclassified.
- Multi-currency isn't an edge case, it's normal — net worth has to be reported per
  currency, and FX conversion to one reporting currency is a real, separate problem
  the calculation engine will eventually need to own.

## End-to-end integration findings

Prototype 04's UI now sources its Initial State from a real run of this importer
(against the fixture) instead of hand-typed sample data — the first time the Kubera
seam actually fed the rest of the pipeline rather than being tested in isolation.

- **Aggregation-by-kind paid off downstream, unexpectedly.** 03/04 needed a couple of
  assets to have stable, predictable ids (the primary residence, the 401(k)) because
  Events reference them by id. That only worked cleanly because this importer never
  produces more than one asset per (kind, wrapper, currency) — there was no "which
  account" ambiguity to resolve when wiring the two together. A less aggressive
  aggregation strategy would have made this integration meaningfully harder.
- **The multi-currency finding had to be re-solved, not just re-stated.** Prototype
  01 recorded that FX conversion is a real, separate problem — the integration is
  where that stopped being an abstract note and became a concrete choice: filter
  non-USD assets out and say so in the UI, rather than silently mixing currencies
  into one number. The same principle, but now enforced at a different layer (the
  adapter, not the importer) — which suggests it's a genuinely cross-cutting
  concern, not something one component can fully own.
- **Never call the live Kubera API from browser code.** The obvious way to make the
  UI "fully live" — call `client.ts` directly from a component — would ship the API
  secret into the client bundle. This wasn't a hard call, but it's a real
  architectural boundary worth stating explicitly: live Kubera access needs a small
  server/proxy layer before a browser-facing product can use it, not just a
  different fetch call.
