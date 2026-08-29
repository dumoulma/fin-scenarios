# Kubera → Initial State: implementation notes

Implements `docs/work-orders/kubera-initial-state.md`. Code lives in `core/src/kubera/`
(`types.ts`, `mapping.ts`, `importer.ts`, `summary.ts`, `client.ts`, `fixture.ts`),
tests in `core/test/kuberaImport.test.ts` and `core/test/kuberaEngineIndependence.test.ts`.

## What Kubera data was actually encountered

The API shape (`GET /portfolio/<id>` on the live Kubera Data API v3) was already
confirmed against a real account during `prototypes/01-kubera-import` — that
exploration is carried forward as-is rather than repeated. Real items are flat rows
with `sheetName`/`subType`/`assetClass` fields that are inconsistent and sometimes
misleading (see below), plus an optional `parent` pointer on security-level holdings
nested under an account.

## What was mapped

Kubera items map onto the domain's existing `AssetType`/`HoldingContext` split, not a
Kubera-specific asset model:

- Cash sheet, `subType: 'cash'` → `assetType: cash`, `holdingContext: none`.
- Investments sheet, `subType/assetClass: 'investment'` → `assetType: equity`,
  `holdingContext: taxableBrokerage`.
- Retirement Investments sheet, name matched against 401(k)/IRA/Roth patterns →
  `assetType: equity`, `holdingContext: traditionalRetirement` or `rothRetirement`.
  A 401(k) and a Traditional IRA collapse into the same bucket — the domain doesn't
  distinguish them, since both are just equity in a traditional wrapper.
- Real Estate sheet, `subType: 'primary residence'` → `assetType: realEstate`.
- Mortgage rows (`sheetName: 'Loans'`, name matches `/mortgage/i`) → a `Liability`.

Multiple source accounts landing in the same bucket (three checking accounts, a
401(k) + an IRA) aggregate into one `Asset`. Real estate and Whole Life stay
one-to-one with their source row, since a later Event (`sellProperty`, a policy loan)
needs to target one specific asset id.

## What was intentionally discarded

- Individual security-level holdings (`parent` set) are skipped — the parent
  account's own value already includes them; keeping both would double-count.
- Regional/fund-specific detail (e.g. "Global Equity Index Fund" vs. "Total Market
  ETF") is discarded — everything becomes plain `equity`, per the work order's
  "loss of detail over fabricated detail" rule.
- Stock options, GICs, and other Investments-sheet rows with no clean `AssetType`
  fit are ignored (not misclassified into the nearest guess).
- Credit cards and other non-mortgage debt are ignored — the domain currently only
  has first-class mortgage handling.

## Ambiguities and unresolved classifications

Two real classification problems surfaced (and are exercised by the fixture):

- **Whole Life has no dedicated Kubera category.** The real account filed it under
  "Retirement Investments" with `subType: 'other'`. Kubera's own category fields
  proved unreliable for this — the importer matches on the item's own name instead
  (same treatment given to HSA detection, for the same reason).
- **A Canadian TFSA has no domain equivalent.** It isn't a plain taxable brokerage
  (its distributions aren't ordinary-taxable) and isn't a US retirement wrapper —
  surfaced as `needsManualInput` rather than forced into the nearest bucket.

Also surfaced rather than guessed: retirement rows whose wrapper isn't identifiable
from the name (e.g. a "Profit-Sharing Retirement Plan"), rows with a `subType` that
doesn't match their sheet's expected shape, zero-value rows (usually a stale
duplicate), and null-value rows (an incomplete sync).

## Domain-model finding: currency

The real account is multi-currency (USD/CAD/JPY). The domain now records the
Financial State's `reportingCurrency` and every Asset's country and currency. The
engine has no FX behavior: it rejects a state containing an Asset whose currency does
not match the reporting currency. The importer therefore still surfaces any other
currency as `unsupportedCurrency`, excludes it from the Initial State, and never
fabricates a rate. It also asks for manual input when Kubera has not supplied a
country rather than inventing one.

## Everything else

No other domain-model changes were needed — `Initial State`/`Asset`/`Liability` as
they already existed were sufficient. `core/test/kuberaEngineIndependence.test.ts`
imports nothing from `src/kubera/*` and still runs a full Trajectory calculation
against an importer-shaped `InitialState`, demonstrating the acceptance check
literally: Kubera-specific knowledge can be deleted from the engine without changing
its behavior.

`core/src/kuberaImportDemo.ts` (`npx tsx src/kuberaImportDemo.ts [--live]`) runs the
importer against the fixture by default, or against a real Kubera portfolio with
`--live` (using the same `KUBERA_API_KEY`/`KUBERA_API_SECRET` credentials already set
up for `prototypes/01-kubera-import`) — this is the seam the next step (an eventual
"Connect Kubera" user-facing flow) wires into.
