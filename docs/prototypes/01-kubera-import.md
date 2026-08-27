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

- Is the Initial State too aggregate?
- Do we need account identity sooner than expected?
- Which Asset types need more detail?
- Which Kubera fields are genuinely useful to the calculation engine?
- What should happen when the source contains information our model intentionally does not represent?
