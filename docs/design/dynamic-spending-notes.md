# Dynamic spending — implementation notes

Implements `docs/design/dynamic-spending.md`. Code: `core/src/engine/spendingPolicies.ts`,
wired into `calculate.ts` at the existing "determine Spending" step. Tests:
`core/test/dynamicSpending.test.ts`, covering all 12 items in the design doc's
Initial Test Progression, black-box through `calculate()`.

## What was built

- `Scenario.spendingPolicy?: SpendingPolicy` — optional. Absent means exactly
  today's behavior: `parameters.spending` is used unchanged, no policy logic runs.
- Two `SpendingPolicyKind`s: `percentOfPortfolio` (spend a fixed % of the
  investable portfolio each recompute — the "simple rule," test item 8) and
  `guardrails` (adjust from the previous amount when the annualized withdrawal
  rate crosses a band — test items 9-10). "Investable portfolio" is cash + fixed
  income + equity; real estate and Whole Life cash value are excluded, matching
  how a real guardrail/withdrawal-rate rule is normally scoped.
- Cadence (`cadenceMonths`) is a plain number in the domain (1/3/12), not an
  enum — a UI can still offer "monthly/quarterly/annually" and translate.
- A Scenario's first tick with a `spendingPolicy` always recomputes — the start
  of a Scenario is itself a cadence boundary. This also means dynamic-spending
  state never carries across a Scenario boundary (test 11, 12): a fresh
  Scenario always reseeds from its own `baseAnnualSpending`, never inherits the
  previous Scenario's last-computed amount.
- Added `fundDeficitFromFixedIncomeSale` (mirrors the existing
  `fundDeficitFromEquitySale`) — needed for the doc's cash → bonds → equity
  bucket-strategy tests; there was no way to target a fixed-income sale before.

## A real ordering subtlety worth knowing

Spending is determined *after* that tick's asset behavior (step 3) already ran,
per `docs/architecture.md`'s step order — so a guardrail check on a Scenario's
very first tick already sees that same tick's return, not last tick's. This is
correct (the design doc says a policy "may inspect the Financial State
available at the relevant calculation point," and step 3 has already run by
then) but it surprised the first draft of the "poor sequence of returns" test,
which assumed a crash starting on a Scenario's first tick wouldn't affect that
tick's own spending determination. It does. Test 6 was adjusted to start its
crash window one month into the Scenario so the baseline-vs-adjusted comparison
stays clean, rather than changing the engine's ordering.

## Non-goals kept

No Monte Carlo, no stochastic spending generator, no dedicated retirement
subsystem — `SpendingPolicy` is a small addition to the existing Scenario/
calculate() shape, per the design doc's own "keep the model small" principle.
The exact guardrail formula (bands, adjustment size) is left to the caller via
`SpendingPolicy`'s fields, not hardcoded, since the design doc explicitly left
the methodology open.
