import { describe, expect, it } from 'vitest'
import { applyAssetTypeBehavior, applyLiabilityBehavior, type GetParam } from '../src/engine/assetTypeBehaviors.ts'
import type { Asset, Liability } from '../src/domain/types.ts'

function getParam(values: Record<string, number>): GetParam {
  return (name) => values[name] ?? 0
}

describe('applyAssetTypeBehavior', () => {
  it('compounds cash by the monthly-equivalent of cashApy, with no cash flow', () => {
    const cash: Asset = { id: 'c', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 10000 }
    const result = applyAssetTypeBehavior(cash, '2026-01', getParam({ cashApy: 0.12 }))
    expect(result.asset.value).toBeCloseTo(10000 * (1 + 0.01), 6)
    expect(result.cashFlow).toBe(0)
  })

  it('compounds equity by equityReturn regardless of holdingContext (401k is just equity held in a Traditional Retirement context)', () => {
    const brokerageEquity: Asset = { id: 'e1', name: 'Brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 50000 }
    const retirementEquity: Asset = { id: 'e2', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 50000 }
    const params = getParam({ equityReturn: 0.12 })
    expect(applyAssetTypeBehavior(brokerageEquity, '2026-01', params).asset.value).toBeCloseTo(applyAssetTypeBehavior(retirementEquity, '2026-01', params).asset.value, 6)
  })

  it('growthRateParameter reads a named Scenario Parameter instead of the shared equityReturn default — this is what lets a Monte Carlo Input Generator randomize an otherwise-fixed-override Asset', () => {
    const withLiteralOverride: Asset = { id: 'e1', name: 'Fixed 5%', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 100000, growthRate: 0.05 }
    const withNamedParameter: Asset = { id: 'e2', name: 'Named param', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 100000, growthRateParameter: 'sp500EtfReturn' }
    const params = getParam({ equityReturn: 0.07, sp500EtfReturn: 0.05 })

    // Same numeric result whether the 5% comes from a literal override or a
    // named parameter that happens to also be 5% right now...
    expect(applyAssetTypeBehavior(withNamedParameter, '2026-01', params).asset.value).toBeCloseTo(applyAssetTypeBehavior(withLiteralOverride, '2026-01', params).asset.value, 6)

    // ...but only the named-parameter version actually reacts when that
    // parameter changes (e.g. a fresh stochastic draw each tick) — the literal
    // override never does, by definition.
    const stochasticParams = getParam({ equityReturn: 0.07, sp500EtfReturn: 0.30 })
    expect(applyAssetTypeBehavior(withNamedParameter, '2026-01', stochasticParams).asset.value).toBeCloseTo(100000 * (1 + 0.3 / 12), 6)
    expect(applyAssetTypeBehavior(withLiteralOverride, '2026-01', stochasticParams).asset.value).toBeCloseTo(100000 * (1 + 0.05 / 12), 6)
  })

  it('growthRateParameter takes priority over a literal growthRate if both are somehow set', () => {
    const asset: Asset = { id: 'e', name: 'Both set', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100000, growthRate: 0.05, growthRateParameter: 'customReturn' }
    const result = applyAssetTypeBehavior(asset, '2026-01', getParam({ equityReturn: 0.07, customReturn: 0.2 }))
    expect(result.asset.value).toBeCloseTo(100000 * (1 + 0.2 / 12), 6)
  })

  it('distributionRateParameter works the same way for the distribution cash flow', () => {
    const asset: Asset = { id: 'e', name: 'Named distribution', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100000, distributionRateParameter: 'intlEtfDistribution' }
    const result = applyAssetTypeBehavior(asset, '2026-01', getParam({ equityReturn: 0, equityDistributionRate: 0.015, intlEtfDistribution: 0.04 }))
    expect(result.cashFlow).toBeCloseTo((100000 * 0.04) / 12, 6)
  })

  it('produces a distribution cash flow separate from (and not reducing) the equity value', () => {
    const equity: Asset = { id: 'e', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100000 }
    const result = applyAssetTypeBehavior(equity, '2026-01', getParam({ equityReturn: 0, equityDistributionRate: 0.04 }))
    expect(result.asset.value).toBeCloseTo(100000, 6) // 0% growth — untouched
    expect(result.cashFlow).toBeCloseTo((100000 * 0.04) / 12, 6)
  })

  it('appreciates real estate, with no cash flow', () => {
    const home: Asset = { id: 'h', name: 'Home', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 500000 }
    const result = applyAssetTypeBehavior(home, '2026-01', getParam({ propertyAppreciation: 0.06 }))
    expect(result.asset.value).toBeCloseTo(500000 * 1.005, 6)
    expect(result.cashFlow).toBe(0)
  })

  it('grows Whole Life cash value via crediting rate + dividend-as-PUA, minus a flat fee — same shape as every other asset', () => {
    const policy: Asset = { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100000 }
    const params = getParam({ wholeLifeCreditingRate: 0.04, wholeLifeDividendRate: 0.02, wholeLifePolicyFee: 25 })
    const result = applyAssetTypeBehavior(policy, '2026-01', params)
    const expected = 100000 + (100000 * 0.04) / 12 + (100000 * 0.02) / 12 - 25
    expect(result.asset.value).toBeCloseTo(expected, 6)
    expect(result.cashFlow).toBe(0)
  })
})

describe('applyLiabilityBehavior (mortgage amortization)', () => {
  it('splits the scheduled payment into interest (a cash outflow) and principal (reduces the balance)', () => {
    const mortgage: Liability = { id: 'm', name: 'Mortgage', kind: 'mortgage', balance: 400000, interestRate: 0.06, monthlyPayment: 2500, linkedAssetId: 'home' }
    const { liability, cashFlow } = applyLiabilityBehavior(mortgage, getParam({}))
    const expectedInterest = 400000 * (0.06 / 12)
    expect(liability.balance).toBeCloseTo(400000 - (2500 - expectedInterest), 6)
    expect(cashFlow).toBe(-2500)
  })

  it('caps the final payment at what is actually owed', () => {
    const mortgage: Liability = { id: 'm', name: 'Mortgage', kind: 'mortgage', balance: 100, interestRate: 0.06, monthlyPayment: 2500, linkedAssetId: 'home' }
    const { liability, cashFlow } = applyLiabilityBehavior(mortgage, getParam({}))
    expect(liability.balance).toBe(0)
    expect(cashFlow).toBeCloseTo(-100.5, 6)
  })

  it('does nothing for a non-mortgage liability or a paid-off one', () => {
    const other: Liability = { id: 'o', name: 'Other debt', kind: 'other', balance: 500 }
    expect(applyLiabilityBehavior(other, getParam({})).cashFlow).toBe(0)
    const paidOff: Liability = { id: 'm', name: 'Mortgage', kind: 'mortgage', balance: 0, interestRate: 0.06, monthlyPayment: 2500 }
    expect(applyLiabilityBehavior(paidOff, getParam({})).cashFlow).toBe(0)
  })
})
