# Matt's portfolio — implementation notes

Re-scopes `docs/matt-portfolio-tests.md` against `core/` (that doc's original spec,
committed as `9f3f966`, targeted `prototypes/03-calculation-engine` — a stale
checkout that predated this session's work on `core/` entirely). Tests:
`core/test/policyGaps.test.ts`.

## What carried over, and what didn't

Of the original spec's five identified gaps, two no longer apply to `core/`:

- **Leftover pool broadcast to every cash asset** — already fixed during the
  engine-test-hardening pass (a `core/`-only bug that predated this spec).
- **No policy pays the Guardian premium** — doesn't apply; `core/` already models
  a Whole Life premium as mandatory `wholeLifeInsurance` asset-type behavior
  (`applyAssetTypeBehavior`), not a Policy. Nothing to build here.

Three real gaps did carry over and are fixed:

- **`maintainCashReserve` could only ever target one cash Asset.** Added
  `Policy.targetAssetId` — when set, targets that specific Asset with its own
  flat-dollar target (`${targetAssetId}CashReserveTarget`); absent, falls back
  unchanged to the original "first cash Asset, `cashReserveMonths` * spending"
  behavior. Lets "keep $20k at Chase, $25k at Wealthfront" be two independent
  Policies instead of one that can only ever see one account.
- **No fixed-dollar recurring contribution.** Added `contributeFixedAmount` —
  moves exactly `${targetHoldingContext}FixedMonthlyAmount`, never the whole
  pool (unlike `investSurplus`).
- **No calendar-year running-total cap.** `contributeUpToLimit` and
  `contributeFixedAmount` now share `PolicyContext.annualContributions`, a
  `Map<targetHoldingContext, amount>` that `calculate()` resets every January
  (new `dates.ts` export: `monthOf`). Two Policies aimed at the same account
  (e.g. a fixed DCA and a claim-up-to-limit, both into the same 401(k)) can no
  longer combine to exceed the account's annual limit.

The Map is mutated in place rather than threaded through every handler's
return value — a deliberate, narrow exception to the otherwise-pure handler
shape, made because reworking all 11 handlers' signatures for one
cross-cutting concern wasn't worth it. Documented at the `PolicyContext` type.

## A real Kubera-import gap, fixed the same way

The original spec's own "current status" section flagged (but explicitly
didn't fix) that the real 401(k), held at Gusto/Guideline, doesn't match the
importer's name-based pattern and silently lands in `needsManualInput`. Fixed
narrowly: a short, explicitly-documented list of known payroll-401(k) provider
names (starting with "Guideline," the one concretely needed) checked alongside
the existing "401(k)"/"IRA" text patterns. An unlisted provider still
correctly falls to `needsManualInput` — this isn't a general solution to
recognizing every 401(k) provider, just an honest fix for the one gap found
against a real account.

## Capstone

`policyGaps.test.ts` includes a 10-year run of the real 6-policy stack (capped
401(k) → two independent cash buffers → fixed brokerage DCA → capped PUA →
rest to brokerage), proving the shape holds together end to end. Premium,
both annual caps, and the PUA cap are still placeholder figures — the doc's
own "real figures still unknown" caveat carries over unchanged; swap them for
real numbers once known.
