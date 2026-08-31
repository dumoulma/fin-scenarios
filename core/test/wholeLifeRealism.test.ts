// Informed by a real Guardian participating whole life contract (policy provisions:
// Premiums, Dividends, Loans). Three gaps the earlier simplification missed:
// premiums are a real mandatory cost, policy loan interest compounds, and PUA
// (Paid-Up Additions) is how most of this policy's cash value actually gets built.
import { describe, expect, it } from 'vitest'
import { applyAssetTypeBehavior, type GetParam } from '../src/engine/assetTypeBehaviors.ts'
import { reconcile } from '../src/engine/policies.ts'
import { netWorth, type Asset, type FinancialState } from '../src/domain/types.ts'

function getParam(values: Record<string, number>): GetParam {
  return (name) => values[name] ?? 0
}

describe('Whole Life premium — a mandatory outflow, not a free-growing asset', () => {
  it('deducts the monthly-equivalent premium as a cash outflow while within the payable period', () => {
    const policy: Asset = {
      id: 'wl',
      name: 'Whole Life',
      assetType: 'wholeLifeInsurance',
      holdingContext: 'none',
      country: 'US', currency: 'USD', value: 100_000,
      premiumAmount: 16_399.58,
      premiumPayableThroughTick: '2073-04',
    }
    const result = applyAssetTypeBehavior(policy, '2026-01', getParam({ wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0 }))
    expect(result.cashFlow).toBeCloseTo(-16_399.58 / 12, 6)
  })

  it('stops charging premium once past the payable-through tick', () => {
    const policy: Asset = {
      id: 'wl',
      name: 'Whole Life',
      assetType: 'wholeLifeInsurance',
      holdingContext: 'none',
      country: 'US', currency: 'USD', value: 700_000,
      premiumAmount: 16_399.58,
      premiumPayableThroughTick: '2073-04',
    }
    const result = applyAssetTypeBehavior(policy, '2073-05', getParam({ wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0 }))
    expect(result.cashFlow).toBe(0)
  })

  it('a policy with no premiumAmount set (e.g. already paid-up) never charges one', () => {
    const policy: Asset = { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }
    const result = applyAssetTypeBehavior(policy, '2026-01', getParam({ wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0 }))
    expect(result.cashFlow).toBe(0)
  })
})

describe('Whole Life policy loan — interest compounds, unlike a one-time balance bump', () => {
  it('accrues loan interest onto policyLoanBalance every tick, same shape as crediting rate on value', () => {
    const policy: Asset = { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000, policyLoanBalance: 20_000, loanRate: 0.05 }
    const result = applyAssetTypeBehavior(policy, '2026-01', getParam({ wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0 }))
    expect(result.asset.policyLoanBalance).toBeCloseTo(20_000 * (1 + 0.05 / 12), 6)
    expect(result.asset.value).toBeCloseTo(100_000, 6) // cash value itself is untouched by loan interest
  })

  it('a zero loan balance stays at zero regardless of the loan rate', () => {
    const policy: Asset = { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000, loanRate: 0.05 }
    const result = applyAssetTypeBehavior(policy, '2026-01', getParam({ wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0 }))
    expect(result.asset.policyLoanBalance ?? 0).toBe(0)
  })

  it('falls back to the wholeLifeLoanRate Scenario Parameter when the asset has no override', () => {
    const policy: Asset = { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000, policyLoanBalance: 10_000 }
    const result = applyAssetTypeBehavior(policy, '2026-01', getParam({ wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0, wholeLifeLoanRate: 0.035 }))
    expect(result.asset.policyLoanBalance).toBeCloseTo(10_000 * (1 + 0.035 / 12), 6)
  })
})

describe('contributeToWholeLifePUA — pays surplus into Paid-Up Additions up to the annual max', () => {
  const ctx = { spendingAmount: 0, grossIncome: 0, matchRate: 0, matchLimitPercentOfSalary: 0, annualContributions: new Map() }

  it('claims up to the monthly-equivalent max, nets out the charge, and adds the rest straight to cash value', () => {
    const state: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }], liabilities: [] }
    const params = getParam({ wholeLifePuaAnnualMax: 12_000, wholeLifePuaChargeRate: 0.1 }) // $1,000/mo max, 10% charge

    const { pool, state: after } = reconcile(2_000, state, [{ id: 'p', kind: 'contributeToWholeLifePUA', priority: 1 }], params, ctx)

    expect(pool).toBe(2_000 - 1_000) // only claims up to the monthly max, not the whole pool
    expect(after.assets[0]!.value).toBeCloseTo(100_000 + 1_000 * 0.9, 6) // 10% charge nets out
  })

  it('claims the whole pool if it is under the monthly max', () => {
    const state: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }], liabilities: [] }
    const params = getParam({ wholeLifePuaAnnualMax: 12_000, wholeLifePuaChargeRate: 0.1 })

    const { pool, state: after } = reconcile(400, state, [{ id: 'p', kind: 'contributeToWholeLifePUA', priority: 1 }], params, ctx)

    expect(pool).toBe(0)
    expect(after.assets[0]!.value).toBeCloseTo(100_000 + 400 * 0.9, 6)
  })

  it('is a no-op on a deficit (never funds a shortfall) and when there is no Whole Life asset', () => {
    const state: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [], liabilities: [] }
    const params = getParam({ wholeLifePuaAnnualMax: 12_000, wholeLifePuaChargeRate: 0.1 })
    expect(reconcile(-500, state, [{ id: 'p', kind: 'contributeToWholeLifePUA', priority: 1 }], params, ctx).pool).toBe(-500)
    expect(reconcile(500, state, [{ id: 'p', kind: 'contributeToWholeLifePUA', priority: 1 }], params, ctx).pool).toBe(500)
  })
})

describe('netWorth — a policy loan is a real liability against the policy', () => {
  it('reduces net worth by the outstanding policy loan balance, even though the loan never touches cashValue', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000, policyLoanBalance: 30_000 }],
      liabilities: [],
    }
    // cash value is 100,000, but 30,000 of it is borrowed against — real net worth is 70,000
    expect(netWorth(state)).toBe(70_000)
  })
})
