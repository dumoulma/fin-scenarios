# Handover: build the 10-year Master Scenario

Written to let a fresh session pick this up without the prior conversation.
Read this doc plus the current repo state (`core/`, `ui/`, and the other
`docs/*-notes.md` files it references) — don't assume anything not written
down here or already committed.

## The task

Build a single, 10-year Scenario (a "Master Trajectory" with one Scenario in
it) using **Mathieu's real Kubera-imported portfolio** as the Initial State,
matching this real policy stack, in priority order:

1. Pay Guardian (Whole Life) policy fee: **$1,500/month** (confirmed: this is
   a monthly figure, $18k/yr — not the policy's actual premium, which is a
   separate, larger, already-modeled cost; see "Whole Life" below).
2. Max 401(k) contribution, pre-tax framing (the engine's own tax treatment
   is a known simplification — see "Known simplifications" below).
3. Maintain cash reserve: **$20,000 at Chase**, **$25,000 at Wealthfront**
   (HYSA) — two *independent* targets, not one combined reserve.
4. **$1,000/month** into Schwab, split **70% into an S&P 500 ETF, 30% into an
   international ETF** — two specific assets, not one generic "brokerage."
5. Max Guardian PUA (Paid-Up Additions) contribution: **$23,000/year** cap.
6. Everything left over → Schwab (which specific ETF is unspecified by
   Mathieu — reasonable default: the S&P 500 ETF, or split the same 70/30;
   confirm or just pick one and say which).

Additional scenario mechanics:

- **Income**: $270,000/yr gross salary, plus a **10% bonus at the end of each
  year** ($27,000/yr, a `oneTimeCashFlow` each December — 10 occurrences
  across the 10-year scenario).
- **Tax rate**: confirmed **32%** flat (a flat approximation, per the
  domain's own design — not a real tax engine).
- **Spending**: **$7,000/month**, fixed.
- **At the end of the single scenario**: sell the condo (the real estate
  asset, "530 Gregory Ave c311" in the live import), with a **6% selling
  fee**. This needs a real engine change — see below, it doesn't exist yet.

Mathieu's own phrase "14k net post 401k max" for take-home pay was
**context, not a literal parameter** — the engine computes net pay from gross
salary via the flat tax rate and policy claims; it doesn't need a literal
"$14k net" figure. Don't try to force-fit that number anywhere.

## What's already built and working (don't re-build these)

Everything below is on `main` as of this handover. Run `cd core && npm test`
to confirm — should be 20 files, 180 tests, all green, plus `npx tsc --noEmit`
clean in both `core/` and `ui/`.

- **The real Kubera importer**, fully generic — no hardcoded personal
  knowledge in `mapping.ts`/`importer.ts`. See
  `docs/kubera-mapping-overrides-notes.md`. Corrections for Mathieu's own
  real, otherwise-unrecognizable items live in `core/src/kuberaImportDemo.ts`
  as `MY_KUBERA_OVERRIDES`, keyed by real Kubera item id:
  - Gusto/Guideline 401(k) → `{ assetType: 'equity', holdingContext: 'traditionalRetirement' }`
  - Guardian Life Whole Life, 530 Gregory Ave, and the Mortgage → each
    `{ country: 'US' }` (Kubera reports `geography.country: "others"` for
    these three real, manually-entered/unlinked items).

  To get the current real Initial State, run (from `core/`):
  ```
  npx tsx --env-file=../prototypes/01-kubera-import/.env src/kuberaImportDemo.ts --live
  ```
  Credentials live in `prototypes/01-kubera-import/.env` (not `core/`). **Do
  not** use `source` to load them — the sandbox in this worktree blocks it;
  `--env-file` is what actually works. Also don't use compound `&&`/`$()`
  shell commands here — the worktree-isolation sandbox is oddly strict about
  verifying them and will refuse; keep commands to one plain step at a time,
  or write a throwaway `.ts` script under `core/` and run it directly (delete
  it after — see "Working conventions" below).

  As of the last live run, recognized: Chase + Wealthfront cash (aggregated
  into one `cash` asset — **this is a problem, see "Known gaps" below**),
  Schwab taxable brokerage (one combined asset — **also a problem**), the
  Guideline 401(k), a Roth IRA, the house, the Whole Life policy, and the
  mortgage. Still correctly unrecognized: crypto, a Canadian TFSA, two
  ambiguous Alight retirement plans, two CAD accounts, a few stale $0
  duplicates. Don't try to "fix" these — they're deliberately excluded per
  `docs/kubera-live-import-notes.md`.

- **The domain/engine** (`core/src/domain/`, `core/src/engine/`): monthly-tick
  `calculate()`, `Scenario`/`Trajectory` with boundary-drag `resizeScenario`/
  `insertScenario`/`deleteScenario`, `Policy` priority-ordered pool
  reconciliation, dynamic `SpendingPolicy` (not needed for this task — fixed
  $7k/mo spending is enough), Whole Life as `wholeLifeInsurance` asset-type
  behavior (premium, PUA, policy fee, loan/withdrawal all modeled), currency
  as a hard invariant (`CurrencyInvariantError` if any Asset's currency
  doesn't match the Financial State's `reportingCurrency` — no FX).

- **Relevant existing Policy kinds** (`core/src/engine/policies.ts`):
  - `maintainCashReserve` — supports `targetAssetId` (targets one specific
    named cash Asset with its own flat `${targetAssetId}CashReserveTarget`
    param) or falls back to "first cash Asset, `cashReserveMonths` *
    spending" if `targetAssetId` is absent. **This is exactly what Chase/
    Wealthfront need — but only if they're separate Assets** (see gap below).
  - `contributeUpToLimit` — claims up to `${targetHoldingContext}AnnualLimit`
    / 12 per month, respecting a **shared calendar-year running total**
    (`PolicyContext.annualContributions`, reset every January) across any
    other Policy claiming into the same `targetHoldingContext`. This is what
    "max 401(k)" should use.
  - `contributeFixedAmount` — claims exactly `${targetHoldingContext}
    FixedMonthlyAmount`, not the whole pool. **Only targets a
    `HoldingContext`, not a specific Asset** — this is the gap for the
    70/30 ETF split, see below.
  - `contributeToWholeLifePUA` — claims up to `wholeLifePuaAnnualMax` / 12,
    nets out `wholeLifePuaChargeRate`. This is what "max Guardian PUA
    ($23k/yr)" should use directly, no changes needed.
  - `investSurplus` — claims the whole remaining pool into the first
    `taxableBrokerage` Asset. Reasonable for "everything left over → Schwab"
    if you pick one ETF as the catch-all (see task item 6 above).
  - Whole Life's premium and policy fee are **Asset fields/Scenario
    Parameters, not Policies** — `Asset.premiumAmount` /
    `premiumPayableThroughTick` for the real premium (already on the
    imported Guardian asset if it has one; check), and the
    `wholeLifePolicyFee` Scenario Parameter for the $1,500/mo fee task item 1
    is asking for (it's a flat monthly deduction already, per
    `assetTypeBehaviors.ts` — no `/12` needed, set it to `1500` directly).

- **`sellProperty` exists** (`EventEffect` in `domain/types.ts`,
  `applyPointEvent` in `engine/eventTypeBehaviors.ts`) but **has no fee
  concept at all** — see "Known gaps," item 1.

## Known gaps — real engine work needed before this scenario can be built correctly

### 1. `sellProperty` has no selling-fee field

Current shape: `{ kind: 'sellProperty'; assetId: string }`. `buyProperty` has
`transactionCost?: number` (a flat dollar amount) but the mirror-image sell
side has nothing. Needs a `sellingFeeRate?: number` (a *rate*, e.g. `0.06` for
6% — realtor commissions are percentage-based, unlike a buy-side transaction
cost which is more naturally a flat number) consumed in
`applyPointEvent`'s `sellProperty` case:

```ts
case 'sellProperty': {
  const property = state.assets.find((a) => a.id === effect.assetId)
  if (!property || property.assetType !== 'realEstate') return state
  const mortgage = state.liabilities.find((l) => l.linkedAssetId === effect.assetId)
  const fee = property.value * (effect.sellingFeeRate ?? 0)
  const netProceeds = property.value - (mortgage?.balance ?? 0) - fee
  // ...unchanged from here
}
```

TDD this in `core/test/eventTypeBehaviors.test.ts` (there's already a
`sellProperty` test there to extend or sit alongside) before touching the
implementation. Full suite must stay green after.

### 2. `contributeFixedAmount` can't target a specific Asset, only a `HoldingContext`

The 70/30 split needs two *specific* ETF Assets (both presumably
`holdingContext: 'taxableBrokerage'`) to each get their own fixed monthly
amount ($700 and $300). Today's handler:

```ts
contributeFixedAmount: (pool, state, getParam, ctx, policy) => {
  if (pool <= 0 || !policy.targetHoldingContext) return { pool, state }
  const account = state.assets.find((a) => a.holdingContext === policy.targetHoldingContext)
  // ...
```

`.find()` on `holdingContext` alone will always hit the *same* first-matching
asset for both policy instances if two ETFs share `taxableBrokerage`. Fix by
mirroring `maintainCashReserve`'s already-established `targetAssetId`
pattern: if `policy.targetAssetId` is set, target that specific Asset (and
key `annualContributions`/read the fixed-amount param off the asset id
instead of the holding context); otherwise keep today's holding-context
behavior unchanged. TDD this in `core/test/policyGaps.test.ts` (the existing
`contributeFixedAmount` tests are there) — add a case with two Assets sharing
one `holdingContext`, each independently targeted and funded.

### 3. The Kubera importer aggregates Chase and Wealthfront into one cash Asset

`importer.ts`'s `isAggregated()` currently aggregates every `AssetType` except
`realEstate` and `wholeLifeInsurance` — meaning **all cash accounts collapse
into one Asset** regardless of which real bank they're at. `maintainCashReserve`'s
`targetAssetId` fix from an earlier pass is useless for this scenario if Chase
and Wealthfront aren't separately identifiable Assets after import.

This wasn't a problem before because nothing needed two independent cash
targets until now. Needs a real design decision, not just a code tweak —
options, roughly in order of how much they disturb the existing model:

- Add a real domain reason to keep specific cash accounts separate (e.g. give
  Cash Assets an optional identity/label akin to how Whole Life and real
  estate already stay one-to-one with their source item) and change
  `isAggregated` to exclude cash from aggregation entirely, or make
  aggregation configurable per import.
- Or: post-process the imported `InitialState` in the *caller*
  (`kuberaImportDemo.ts`, or wherever the scenario gets assembled) to manually
  split the combined cash Asset back into two named ones with hardcoded
  values — a hack, avoid this, it silently drifts from the real Kubera
  numbers every time the live data changes.
- Or: revisit whether `importKuberaSnapshot` should aggregate by
  `(assetType, holdingContext, country)` *and* something identifying the
  underlying account/institution when the caller cares to keep them apart —
  this is the same shape as the real-estate/whole-life one-to-one exception,
  generalized.

Don't guess at this — it changes what "the Initial State" means for every
future scenario too, not just this one. Recommend surfacing the tradeoff and
getting a decision before implementing, the same way the currency and
country questions got resolved earlier this session (see
`docs/kubera-live-import-notes.md`, `docs/kubera-mapping-overrides-notes.md`
for the pattern: real finding → explain the tradeoff → build the smallest
correct thing).

Same likely applies to Schwab: the live import currently produces **one**
combined `taxableBrokerage` equity Asset ("Charles Schwab - Post-Tax account
...103"), not two separate ETF holdings — the individual ETF holdings
(`Schwab International Equity ETF`, `iShares Core S&P 500 ETF`, etc.) are
currently *ignored* as "individual security-level holdings...represented at
the account level." To model "$700/mo into the S&P 500 ETF, $300/mo into the
international ETF" as two independently-tracked Assets, you likely need to
construct those two Assets directly in the Scenario-building code (not
necessarily from the Kubera import at all, since Kubera's import intentionally
collapses ticker-level detail per the domain's "prefer loss of detail" rule)
— i.e., add two `equity`/`taxableBrokerage` Assets to the Initial State
yourself, seeded at $0 or at the real known balance if you have it, rather
than expecting the importer to produce them.

## Known simplifications already accepted this session (don't relitigate)

- **401(k) contributions are modeled post-tax in the pool**, not pre-tax
  reducing taxable income — an explicit, documented simplification (the
  9-step calculation order applies tax before Policies reconcile the
  remainder). "Pre-tax" in the task description is Mathieu's own mental
  model of the real account, not an instruction to change engine ordering.
- **Currency is single-currency per Financial State**, enforced by
  `CurrencyInvariantError` — no FX. Any CAD/JPY items are already excluded
  from the real import; don't try to include them.
- **Tax is a flat rate**, not a real tax-bracket engine.

## Working conventions established this session (follow these)

- **TDD, strictly**: write the test first, run it, confirm it fails for the
  *expected* reason (not a typo), then implement, then confirm green. Every
  commit this session followed this; don't skip it for these two engine
  changes.
- **Run `npx tsc --noEmit` and `npx vitest run` from `core/` before every
  commit.** Both must be clean/green.
- **No stray files**: if you write a throwaway diagnostic/one-off script
  (e.g. to inspect live Kubera data), delete it before committing — several
  were written and removed this session (`core/diag-kubera.ts`, never
  committed).
- **Commit messages**: no Jira-style prefix (this repo doesn't use one),
  explain *why* not just *what*, end with
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` when the agent
  wrote the code (it did, every commit this session).
- **This worktree's branch is `worktree-kubera-import`**, kept in sync with
  `main` by merging `origin/main` in periodically (squash-merges from this
  branch to `main` mean merging back the other way can produce spurious
  duplicate-content conflicts — resolve by inspecting the file directly, not
  by trusting git's auto-merge, if that happens again).
- **Sandbox note**: this session's bash tool refuses `source`, and is
  sometimes oddly strict about compound commands (`&&`, `$(...)`) claiming it
  "can't verify they stay inside the worktree" — break things into separate,
  plain single-step commands when that happens, or use `npx tsx
  --env-file=...` instead of shell-sourcing env vars.
- **Mapping/personal-data separation is now a hard rule**: never put
  Mathieu-specific knowledge (account names, ids, "this provider means
  401(k)") into `core/src/kubera/mapping.ts` or `importer.ts`. It goes in
  `MappingOverrides` data, supplied by the caller
  (`kuberaImportDemo.ts` today; a real UI eventually). This was an explicit
  correction mid-session — don't regress it.

## Suggested order of work

1. Fix gap 1 (`sellProperty` selling fee) — small, self-contained, TDD it.
2. Fix gap 2 (`contributeFixedAmount` `targetAssetId`) — small,
   self-contained, mirrors an existing pattern, TDD it.
3. Surface gap 3 (cash/brokerage aggregation) as a decision point — probably
   worth a quick check-in rather than guessing, since it changes what "one
   Kubera cash Asset" means going forward.
4. Re-run the live import to get current real numbers.
5. Build the actual `Scenario` (probably in a new
   `core/src/scenarios/mathieuMaster.ts`, following the existing
   `quietMillionaire.ts` as a pattern) wiring the real Initial State + the
   policy stack above.
6. Run it through `calculate()`, sanity-check the 10-year net worth curve,
   report back with real numbers and any assumptions that had to be made
   explicit (ETF growth rates, property appreciation rate, etc. — none of
   these were specified in the task and reasonable defaults should be picked
   and clearly stated, same pattern as `quietMillionaire.ts` and the
   `docs/matt-portfolio-tests.md` capstone test).
7. Once the domain/engine work is real and tested, consider whether the UI
   (`ui/`) needs updating to load this scenario instead of/alongside
   `quietMillionaireTrajectory` — not required for this task, but likely the
   natural next step after.
