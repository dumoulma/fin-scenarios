# Domain / Engine Convergence Review

## 1. Executive summary

**Evidence.** The progressive suite and Kubera fixture exercise one monthly engine with reusable asset behavior, event behavior, and ordered reconciliation policies. The importer also exposed real USD/CAD/JPY source values and incomplete source metadata.

**Interpretation.** The core model is holding together. Two concrete mismatches needed tightening: Assets did not carry the country/currency facts the model requires, and Spending was represented as a Policy even though it is a Scenario Parameter.

**Recommendation implemented.** Financial State now names a reporting currency, Assets require country and currency, the engine and `netWorth` reject unconverted Asset values, and Spending is applied before Policies. No FX, ticker model, or new policy abstraction was added.

## 2. What implementation validated

**Evidence.** Levels 1–5 calculate through `InitialState -> Trajectory -> Scenario -> calculation -> FinancialState`. They cover independent Equity positions, Holding Context tax treatment, Whole Life, point and ongoing Events, policy priority, and scenario boundaries. The Kubera engine-independence test imports no Kubera module.

**Interpretation.** The calculation module is a deep, useful center of gravity. Asset behavior stays with Asset Type, tax wrapper treatment stays in the engine, Event behavior stays in the event module, and Policies remain an ordered reconciliation seam. Kubera is a true adapter: deleting it does not change engine inputs or results.

## 3. What implementation changed our understanding of the domain

**Evidence.** Kubera supplied non-reporting-currency holdings and source rows without country. The previous domain lost country/currency once a row became an Asset. Separately, a nonzero `Scenario.parameters.spending` only affected the result when callers also supplied a `spending` Policy.

**Interpretation.** Currency is not merely adapter metadata: country and currency are facts of an Asset, and Financial State needs a reporting denomination before values can be combined. Spending is a fixed scenario input, not a disposition decision.

**Recommendation implemented.** Preserve Asset country/currency and make the reporting-currency invariant explicit. Apply Spending before policy reconciliation.

## 4. Concrete architecture/domain friction

**Evidence.** `PolicyKind` included `spending`, which made a required Scenario Parameter depend on an optional, priority-ordered policy record. The importer had to exclude foreign-currency rows because the domain could not retain their denomination.

**Interpretation.** Both were shallow seams: policy priority could accidentally turn Spending off, and the adapter had no domain-shaped place for imported currency facts. In contrast, splitting the engine into more interfaces would not increase depth or locality.

**Recommendation.** Keep the current modules. The small changes above concentrate the currency invariant in the domain module and leave policy handlers focused on allocation/funding decisions.

## 5. Proposed changes and rationale

| Change | Evidence | Domain rule clarified | Smallest implementation | Seam |
| --- | --- | --- | --- | --- |
| Require `country` and `currency` on every Asset; add `reportingCurrency` to Financial State | Kubera has USD/CAD/JPY rows; prior Assets lost both facts | Values may only be combined in an explicit reporting currency | Add fields, preserve them in the adapter, and assert that each calculated Asset matches the reporting currency | Strengthens the domain/adapter seam without adding FX behavior |
| Make Spending unconditional and remove the `spending` Policy | Nonzero Spending previously did nothing without that policy | Spending is a Scenario Parameter; Policies allocate surplus or fund deficit | Deduct the parameter before `reconcile`, then remove the policy kind and fixtures | Strengthens the Scenario/Policy boundary |

## 6. Test rung for each proposed change

| Change | Test rung | Proof |
| --- | --- | --- |
| Asset country/currency and reporting-currency invariant | Level 3 plus Kubera importer tests | Level 3 rejects CAD in a USD Financial State until FX is explicit; the realistic importer fixture preserves USD country/currency and surfaces foreign or countryless rows |
| Spending is not a Policy | Level 1 | A one-month Scenario reduces Cash by its Spending with no Policies present |

The existing Level 3 tests also continue to prove one or many Equity positions and independent Holding Contexts. Asset-specific Whole Life facts remain optional rather than forced onto unrelated Assets; no basis field was introduced because no implemented calculation consumes it.

## 7. Currency decision/recommendation

**Decision.** A Financial State has one reporting currency. Each Asset records its own country and currency. The current engine only calculates a State when every Asset matches the reporting currency; it never converts, discards silently, or invents an FX rate.

**Recommendation.** Add an explicit FX input/conversion boundary only when a planning calculation needs mixed-currency assets. That work should define rate timing, source, and reporting rules together. Do not model securities or country-specific tax systems as a prerequisite.

## 8. Testing assessment

The suite is predominantly black-box integration coverage through `calculate` and real domain collaborators. The new Level 1 and Level 3 checks assert Financial State outcomes/errors, not calls. The Kubera tests use the realistic fixture rather than mocks, and the engine-independence test verifies the adapter boundary directly. Focused pure tests for asset/event/policy behavior provide extra local confidence without mock-only interfaces.

## 9. Explicit non-changes: things deliberately left alone

- No FX calculation, rate provider, or currency conversion policy: the evidence only supports preserving and guarding denominations.
- No ticker/security model: the adapter and Level 3 tests validate coarse and multiple Equity positions already.
- No generalized `basis` field: no current Asset Type behavior needs it, and adding it to every Asset would weaken locality.
- No Event or Policy interface hierarchy: the discriminated domain records plus behavior modules are a small, direct seam.
- No Kubera concepts in the domain or engine: classification remains inside the adapter.
- No Whole Life redesign: it remains specialized Asset Type behavior and its existing black-box scenarios pass.

## 10. Final test results

`cd core && npx tsc --noEmit && npm test` passed on 2026-08-29: type checking passed, then 14 test files and 131 tests passed. This includes Levels 1–5, focused domain/engine tests, Kubera importer tests, and `kuberaEngineIndependence.test.ts`.

## 11. Remaining questions before UI work

1. What FX rate source and timing should apply when the product first supports mixed-currency calculations?
2. Which user-facing flow supplies or confirms an Asset country when an external adapter cannot?
3. Which Asset Types first need genuinely type-specific facts such as tax basis, and which behavior will consume them?
