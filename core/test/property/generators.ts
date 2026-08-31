import fc from 'fast-check'
import { addMonths, type YearMonth } from '../../src/domain/dates.ts'
import type { Asset, AssetType, Event, FinancialState, HoldingContext, Liability, Policy, Scenario, ScenarioParameters, Trajectory } from '../../src/domain/types.ts'

export const propertySeed = 20260829
export const propertyRuns = 75

export const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'] as const
const assetTypes: AssetType[] = ['cash', 'fixedIncome', 'equity', 'realEstate', 'wholeLifeInsurance']
const holdingContexts: HoldingContext[] = ['none', 'taxableBrokerage', 'traditionalRetirement', 'rothRetirement', 'hsa']

export const scenarioParametersArb: fc.Arbitrary<ScenarioParameters> = fc.record({
  spending: fc.double({ min: 0, max: 15_000, noNaN: true }),
  taxRate: fc.double({ min: 0, max: 0.45, noNaN: true }),
  cashApy: fc.double({ min: -0.02, max: 0.12, noNaN: true }),
  fixedIncomeReturn: fc.double({ min: -0.08, max: 0.12, noNaN: true }),
  equityReturn: fc.double({ min: -0.3, max: 0.3, noNaN: true }),
  equityDistributionRate: fc.double({ min: 0, max: 0.08, noNaN: true }),
  propertyAppreciation: fc.double({ min: -0.1, max: 0.15, noNaN: true }),
  wholeLifeCreditingRate: fc.double({ min: 0, max: 0.08, noNaN: true }),
  wholeLifeDividendRate: fc.double({ min: 0, max: 0.06, noNaN: true }),
  wholeLifePolicyFee: fc.double({ min: 0, max: 100, noNaN: true }),
  wholeLifeLoanRate: fc.double({ min: 0, max: 0.12, noNaN: true }),
  wholeLifePuaAnnualMax: fc.double({ min: 0, max: 24_000, noNaN: true }),
  wholeLifePuaChargeRate: fc.double({ min: 0, max: 0.2, noNaN: true }),
  cashReserveMonths: fc.double({ min: 0, max: 12, noNaN: true }),
  taxableBrokerageAnnualLimit: fc.double({ min: 0, max: 30_000, noNaN: true }),
  traditionalRetirementAnnualLimit: fc.double({ min: 0, max: 30_000, noNaN: true }),
  rothRetirementAnnualLimit: fc.double({ min: 0, max: 10_000, noNaN: true }),
  hsaAnnualLimit: fc.double({ min: 0, max: 10_000, noNaN: true }),
})

export const assetArb = (id: string, assetType?: AssetType): fc.Arbitrary<Asset> => {
  const typeArb = assetType ? fc.constant(assetType) : fc.constantFrom(...assetTypes)
  return fc.tuple(typeArb, fc.double({ min: 0, max: 1_000_000, noNaN: true }), fc.constantFrom(...holdingContexts)).chain(([type, value, holdingContext]) =>
    fc.record({
      id: fc.constant(id), name: fc.constant(`${type}-${id}`), assetType: fc.constant(type), holdingContext: fc.constant(holdingContext),
      country: fc.constantFrom('US', 'JP', 'CA'), currency: fc.constant('USD'), value: fc.constant(value),
      growthRate: fc.option(fc.double({ min: -0.3, max: 0.3, noNaN: true }), { nil: undefined }),
      distributionRate: fc.option(fc.double({ min: 0, max: 0.08, noNaN: true }), { nil: undefined }),
      premiumAmount: fc.option(fc.double({ min: 0, max: 30_000, noNaN: true }), { nil: undefined }),
      loanRate: fc.option(fc.double({ min: 0, max: 0.12, noNaN: true }), { nil: undefined }),
    }).map((asset) => type === 'wholeLifeInsurance'
      ? { ...asset, policyLoanBalance: Math.min(asset.value, asset.value * 0.5), premiumPayableThroughTick: '2026-12' }
      : { ...asset, growthRate: type === 'equity' ? asset.growthRate : undefined, distributionRate: type === 'equity' ? asset.distributionRate : undefined, premiumAmount: undefined, loanRate: undefined }),
  )
}

export const initialStateArb: fc.Arbitrary<FinancialState> = fc.array(assetArb('asset'), { minLength: 0, maxLength: 4 }).map((assets) => ({
  asOf: '2026-01', reportingCurrency: 'USD',
  assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }, ...assets.map((asset, index) => ({ ...asset, id: `asset-${index}` }))],
  liabilities: [],
}))

const policyKinds: Policy['kind'][] = ['maintainCashReserve', 'contributeUpToMatch', 'contributeUpToLimit', 'payMortgageExtra', 'investSurplus', 'fundDeficitFromCash', 'fundDeficitFromWholeLifeLoan', 'fundDeficitFromEquitySale', 'fundDeficitFromFixedIncomeSale', 'fundDeficitFromDebt', 'contributeToWholeLifePUA']
export const policiesArb: fc.Arbitrary<Policy[]> = fc.array(fc.record({
  kind: fc.constantFrom(...policyKinds), priority: fc.integer({ min: 1, max: 20 }), targetHoldingContext: fc.option(fc.constantFrom(...holdingContexts), { nil: undefined }),
}), { maxLength: 5 }).map((policies) => policies.map((policy, index) => ({ ...policy, id: `policy-${index}` })))

export function scenario(id: string, start: YearMonth, duration: number, parameters: ScenarioParameters, policies: Policy[] = [], events: Event[] = []): Scenario {
  return { id, name: id, start, end: addMonths(start, duration - 1), parameters, policies, events }
}

export const contiguousTrajectoryArb: fc.Arbitrary<Trajectory> = fc.tuple(
  fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 4 }), scenarioParametersArb, policiesArb,
).map(([durations, parameters, policies]) => {
  let cursor: YearMonth = '2026-01'
  const scenarios = durations.map((duration, index) => {
    const next = scenario(`scenario-${index}`, cursor, duration, parameters, policies)
    cursor = addMonths(next.end, 1)
    return next
  })
  return { id: 'trajectory', name: 'Generated trajectory', scenarios }
})

export function pointEventsFor(start: YearMonth, duration: number): fc.Arbitrary<Event[]> {
  const ticks = Array.from({ length: duration }, (_, index) => addMonths(start, index))
  const eventArb: fc.Arbitrary<Event> = fc.oneof(
    fc.record({ at: fc.constantFrom(...ticks), amount: fc.double({ min: -25_000, max: 25_000, noNaN: true }) }).map(({ at, amount }) => ({ id: `cash-flow-${at}-${amount}`, at, effect: { kind: 'oneTimeCashFlow' as const, amount } })),
    fc.record({ at: fc.constantFrom(...ticks), annualSalary: fc.double({ min: 0, max: 300_000, noNaN: true }) }).map(({ at, annualSalary }) => ({ id: `job-${at}-${annualSalary}`, at, effect: { kind: 'employmentStart' as const, annualSalary } })),
  )
  return fc.array(eventArb, { maxLength: 4 })
}

export const mortgageArb: fc.Arbitrary<Liability> = fc.record({
  id: fc.constant('mortgage'), name: fc.constant('Mortgage'), kind: fc.constant('mortgage' as const),
  balance: fc.double({ min: 1, max: 900_000, noNaN: true }), interestRate: fc.double({ min: 0, max: 0.12, noNaN: true }), monthlyPayment: fc.double({ min: 1, max: 10_000, noNaN: true }), linkedAssetId: fc.constant('property'),
})
