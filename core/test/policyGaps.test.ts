// Re-scoped against core/ from docs/matt-portfolio-tests.md's original spec (which
// targeted the now-superseded prototypes/03-calculation-engine). Two of that spec's
// five gaps no longer apply here: the leftover-pool broadcast bug was already fixed
// during the engine-test-hardening pass, and the Guardian premium is already modeled
// as mandatory wholeLifeInsurance asset-type behavior, not a Policy. The three real
// gaps — one cash-reserve target only, no fixed-dollar contribution, no calendar-year
// running-total cap — are specified below as black-box tests through calculate().
import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Policy, type Scenario } from '../src/domain/types.ts'
import { calculate } from '../src/engine/calculate.ts'
import { reconcile } from '../src/engine/policies.ts'

const noGrowth = { taxRate: 0, cashApy: 0, fixedIncomeReturn: 0, equityReturn: 0, equityDistributionRate: 0 }

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string; policies: Policy[] }): Scenario {
  return createScenario({ events: [], parameters: { spending: 0, ...noGrowth }, ...overrides })
}

describe('gap: maintainCashReserve can only ever target one cash asset', () => {
  it('two reserve Policies, each pointed at a different named cash asset, reach their own independent targets', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD',
      assets: [
        { id: 'chase', name: 'Chase checking', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 5_000 },
        { id: 'wealthfront', name: 'Wealthfront cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 5_000 },
      ],
      liabilities: [],
    }
    const policies: Policy[] = [
      { id: 'reserve-chase', kind: 'maintainCashReserve', priority: 1, targetAssetId: 'chase' },
      { id: 'reserve-wealthfront', kind: 'maintainCashReserve', priority: 2, targetAssetId: 'wealthfront' },
    ]
    const getParam = (name: string) => (name === 'chaseCashReserveTarget' ? 20_000 : name === 'wealthfrontCashReserveTarget' ? 25_000 : 0)

    const { pool, state: after } = reconcile(50_000, state, policies, getParam, { spendingAmount: 0, grossIncome: 0, matchRate: 0, matchLimitPercentOfSalary: 0, annualContributions: new Map() })

    expect(after.assets.find((a) => a.id === 'chase')!.value).toBeCloseTo(20_000, 6)
    expect(after.assets.find((a) => a.id === 'wealthfront')!.value).toBeCloseTo(25_000, 6)
    // each claim is its own shortfall (target - starting balance), not the target itself
    expect(pool).toBeCloseTo(50_000 - (20_000 - 5_000) - (25_000 - 5_000), 6)
  })

  it('with no targetAssetId, falls back to the first cash Asset and the existing cashReserveMonths formula, unchanged', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD',
      assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 1_000 }],
      liabilities: [],
    }
    const getParam = (name: string) => (name === 'cashReserveMonths' ? 3 : 0)
    const { state: after } = reconcile(50_000, state, [{ id: 'r', kind: 'maintainCashReserve', priority: 1 }], getParam, { spendingAmount: 3_000, grossIncome: 0, matchRate: 0, matchLimitPercentOfSalary: 0, annualContributions: new Map() })
    expect(after.assets[0]!.value).toBeCloseTo(9_000, 6) // 3 months * 3,000 spending
  })
})

describe('gap: no policy moves a fixed dollar amount regardless of surplus', () => {
  it('contributeFixedAmount claims exactly its configured amount, not the whole pool', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD',
      assets: [{ id: 'schwab', name: 'Schwab brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 }],
      liabilities: [],
    }
    const policy: Policy = { id: 'schwab-dca', kind: 'contributeFixedAmount', priority: 1, targetHoldingContext: 'taxableBrokerage' }
    const getParam = (name: string) => (name === 'taxableBrokerageFixedMonthlyAmount' ? 1_000 : 0)

    const { pool, state: after } = reconcile(6_000, state, [policy], getParam, { spendingAmount: 0, grossIncome: 0, matchRate: 0, matchLimitPercentOfSalary: 0, annualContributions: new Map() })

    expect(after.assets[0]!.value).toBeCloseTo(1_000, 6)
    expect(pool).toBeCloseTo(5_000, 6) // unlike investSurplus, does not claim the rest
  })

  it('claims only what the pool has if smaller than the configured amount', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD',
      assets: [{ id: 'schwab', name: 'Schwab brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 }],
      liabilities: [],
    }
    const policy: Policy = { id: 'schwab-dca', kind: 'contributeFixedAmount', priority: 1, targetHoldingContext: 'taxableBrokerage' }
    const getParam = (name: string) => (name === 'taxableBrokerageFixedMonthlyAmount' ? 1_000 : 0)

    const { pool, state: after } = reconcile(400, state, [policy], getParam, { spendingAmount: 0, grossIncome: 0, matchRate: 0, matchLimitPercentOfSalary: 0, annualContributions: new Map() })
    expect(after.assets[0]!.value).toBeCloseTo(400, 6)
    expect(pool).toBeCloseTo(0, 6)
  })
})

describe('gap: contributions toward the same annual limit from different Policies do not share a running total', () => {
  it('a fixed contribution and a claim-up-to-limit Policy, both targeting the same account, stop combined at the calendar-year cap and reset in January', () => {
    const trajectory = createTrajectory('Straddle', [
      scenario({
        name: 'Nov-Jan',
        start: '2026-11',
        end: '2027-01',
        events: [{ id: 'evt-income', at: '2026-11', effect: { kind: 'employmentStart', annualSalary: 600_000 } }], // huge surplus every month
        parameters: { spending: 0, traditionalRetirementAnnualLimit: 23_500, traditionalRetirementFixedMonthlyAmount: 15_000, ...noGrowth },
        policies: [
          { id: 'fixed', kind: 'contributeFixedAmount', priority: 1, targetHoldingContext: 'traditionalRetirement' },
          { id: 'limit', kind: 'contributeUpToLimit', priority: 2, targetHoldingContext: 'traditionalRetirement' },
        ],
      }),
    ])
    const initialState: FinancialState = {
      asOf: '2026-11',
      reportingCurrency: 'USD',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: '401k', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 0 },
      ],
      liabilities: [],
    }
    const result = calculate(initialState, trajectory)
    const balanceAt = (asOf: string) => result.monthly.find((s) => s.asOf === asOf)!.assets.find((a) => a.id === '401k')!.value

    // Nov: fixed claims 15,000 first: 23,500 - 15,000 = 8,500 of room left for the
    // up-to-limit claim (its own monthly pace, 23,500/12 ≈ 1,958, is well under that
    // room, so it claims its full monthly pace)
    expect(balanceAt('2026-11')).toBeCloseTo(15_000 + 23_500 / 12, 6)
    // by December the combined running total has reached the annual cap — nothing
    // more can go in this calendar year, from either Policy
    expect(balanceAt('2026-12')).toBeCloseTo(23_500, 6)
    // January is a new calendar year: the cap is available again
    expect(balanceAt('2027-01')).toBeCloseTo(23_500 + 15_000 + 23_500 / 12, 6)
  })
})

describe("capstone: Matt's real policy stack — premium, capped 401(k), two independent cash buffers, fixed brokerage DCA, capped PUA, rest to brokerage", () => {
  it('runs 10 years without throwing and grows net worth', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD',
      assets: [
        { id: 'chase', name: 'Chase checking', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 20_000 },
        { id: 'wealthfront', name: 'Wealthfront cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 25_000 },
        { id: 'schwab', name: 'Schwab brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0, growthRate: 0.05 },
        { id: '401k', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 0, growthRate: 0.05 },
        {
          id: 'guardian',
          name: 'Guardian Whole Life',
          assetType: 'wholeLifeInsurance',
          holdingContext: 'none',
          country: 'US',
          currency: 'USD',
          value: 0,
          premiumAmount: 5_400, // placeholder, pending Mathieu's real figure
        },
      ],
      liabilities: [],
    }
    const policies: Policy[] = [
      { id: '401k-max', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'traditionalRetirement' },
      { id: 'reserve-chase', kind: 'maintainCashReserve', priority: 2, targetAssetId: 'chase' },
      { id: 'reserve-wealthfront', kind: 'maintainCashReserve', priority: 3, targetAssetId: 'wealthfront' },
      { id: 'schwab-dca', kind: 'contributeFixedAmount', priority: 4, targetHoldingContext: 'taxableBrokerage' },
      { id: 'pua-max', kind: 'contributeToWholeLifePUA', priority: 5 },
      { id: 'rest-to-schwab', kind: 'investSurplus', priority: 6 },
    ]
    const trajectory = createTrajectory('Working, 10 years', [
      scenario({
        name: 'Working',
        start: '2026-01',
        end: '2035-12',
        events: [{ id: 'evt-job', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 270_000 } }],
        parameters: {
          spending: 8_000,
          taxRate: 0.25,
          equityReturn: 0.05,
          cashApy: 0,
          fixedIncomeReturn: 0,
          equityDistributionRate: 0,
          wholeLifeCreditingRate: 0.04,
          wholeLifeDividendRate: 0,
          wholeLifePolicyFee: 0,
          chaseCashReserveTarget: 20_000,
          wealthfrontCashReserveTarget: 25_000,
          traditionalRetirementAnnualLimit: 23_500, // placeholder, pending real 401(k) cap
          taxableBrokerageFixedMonthlyAmount: 1_000,
          wholeLifePuaAnnualMax: 10_000, // placeholder, pending real Guardian PUA rider cap
          wholeLifePuaChargeRate: 0,
        },
        policies,
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.annual).toHaveLength(10)
    expect(netWorth(result.annual.at(-1)!)).toBeGreaterThan(netWorth(initialState))
  })
})
