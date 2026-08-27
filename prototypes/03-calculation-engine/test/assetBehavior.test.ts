import { describe, expect, it } from 'vitest'
import { applyAssetBehavior, applyLiabilityBehavior, type GetParam } from '../src/engine/assetBehavior.ts'
import type { Asset, Liability } from '../src/domain/types.ts'

function getParam(values: Record<string, number>): GetParam {
  return (name) => values[name] ?? 0
}

describe('applyAssetBehavior', () => {
  it('compounds cash by the monthly-equivalent of cashApy, with no pool-affecting flow', () => {
    const cash: Asset = { kind: 'cash', id: 'cash', name: 'Cash', balance: 10000 }
    const { asset, flows } = applyAssetBehavior(cash, '2026-01', getParam({ cashApy: 0.12 }))
    expect(asset).toMatchObject({ balance: 10000 * (1 + 0.12 / 12) })
    expect(flows).toEqual([])
  })

  it('compounds brokerage and retirement balances by expectedReturn, unrealized (no flow)', () => {
    const brokerage: Asset = { kind: 'taxableBrokerage', id: 'b', name: 'Brokerage', balance: 100000 }
    const { asset, flows } = applyAssetBehavior(brokerage, '2026-01', getParam({ expectedReturn: 0.12 }))
    expect(asset).toMatchObject({ balance: 100000 * (1 + 0.01) })
    expect(flows).toEqual([])
  })

  it('appreciates real property, unrealized (no flow)', () => {
    const home: Asset = { kind: 'realProperty', id: 'home', name: 'Home', marketValue: 500000 }
    const { asset, flows } = applyAssetBehavior(home, '2026-01', getParam({ propertyAppreciation: 0.06 }))
    expect(asset).toMatchObject({ marketValue: 500000 * (1 + 0.005) })
    expect(flows).toEqual([])
  })

  it('grows Whole Life cash value via crediting rate + dividend-as-PUA, minus a flat fee — same shape as every other asset', () => {
    const policy: Asset = { kind: 'wholeLifeCashValue', id: 'wl', name: 'Whole Life', cashValue: 100000, policyLoanBalance: 0 }
    const params = getParam({ wholeLifeCreditingRate: 0.04, wholeLifeDividendRate: 0.02, wholeLifePolicyFee: 25 })
    const { asset, flows } = applyAssetBehavior(policy, '2026-01', params)
    const expected = 100000 + (100000 * 0.04) / 12 + (100000 * 0.02) / 12 - 25
    expect((asset as typeof policy).cashValue).toBeCloseTo(expected, 6)
    expect(flows).toEqual([])
  })
})

describe('applyLiabilityBehavior (mortgage amortization)', () => {
  it('splits the scheduled payment into interest (a pool outflow) and principal (reduces the balance)', () => {
    const mortgage: Liability = { kind: 'mortgage', id: 'm', name: 'Mortgage', balance: 400000, interestRate: 0.06, monthlyPayment: 2500, propertyAssetId: 'home' }
    const { liability, flows } = applyLiabilityBehavior(mortgage, '2026-01', getParam({}))

    const expectedInterest = 400000 * (0.06 / 12)
    const expectedPrincipal = 2500 - expectedInterest
    expect(liability.balance).toBeCloseTo(400000 - expectedPrincipal, 6)
    expect(flows).toEqual([{ kind: 'mortgagePayment', amount: -2500 }])
  })

  it('caps the final payment at what is actually owed, never overpaying', () => {
    const mortgage: Liability = { kind: 'mortgage', id: 'm', name: 'Mortgage', balance: 100, interestRate: 0.06, monthlyPayment: 2500, propertyAssetId: 'home' }
    const { liability, flows } = applyLiabilityBehavior(mortgage, '2026-01', getParam({}))
    expect(liability.balance).toBe(0)
    expect(flows[0]!.amount).toBeCloseTo(-100.5, 6) // 100 principal + half a percent monthly interest
  })

  it('does nothing once the mortgage is paid off', () => {
    const mortgage: Liability = { kind: 'mortgage', id: 'm', name: 'Mortgage', balance: 0, interestRate: 0.06, monthlyPayment: 2500, propertyAssetId: 'home' }
    const { liability, flows } = applyLiabilityBehavior(mortgage, '2026-01', getParam({}))
    expect(liability.balance).toBe(0)
    expect(flows).toEqual([])
  })
})
