import { describe, expect, it } from 'vitest'
import { reconcile } from '../src/engine/policies.ts'
import type { GetParam } from '../src/engine/assetTypeBehaviors.ts'
import type { FinancialState, Policy } from '../src/domain/types.ts'

function baseState(): FinancialState {
  return {
    asOf: '2026-01',
    reportingCurrency: 'USD', assets: [
      { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 5000 },
      { id: '401k', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 10000 },
    ],
    liabilities: [{ id: 'm', name: 'Mortgage', kind: 'mortgage', balance: 300000, linkedAssetId: 'home' }],
  }
}

// traditionalRetirementAnnualLimit set far above anything these tests claim, so
// contributeUpToLimit behaves like the old uncapped contributeToRetirement did.
const getParam: GetParam = (name) => (name === 'cashReserveMonths' ? 3 : name === 'traditionalRetirementAnnualLimit' ? 12_000_000 : 0)
const ctx = { spendingAmount: 3000, grossIncome: 6000, matchRate: 0, matchLimitPercentOfSalary: 0, annualContributions: new Map() }

describe('reconcile', () => {
  it('maintainCashReserve tops up to spendingAmount * cashReserveMonths, no further', () => {
    const { pool, state } = reconcile(50000, baseState(), [{ id: 'r', kind: 'maintainCashReserve', priority: 1 }], getParam, ctx)
    const target = ctx.spendingAmount * 3
    expect(state.assets.find((a) => a.assetType === 'cash')!.value).toBe(target)
    expect(pool).toBe(50000 - (target - 5000))
  })

  it('contributeUpToLimit claims the entire remaining pool when it is under the account limit', () => {
    const { pool, state } = reconcile(2000, baseState(), [{ id: 'c', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'traditionalRetirement' }], getParam, ctx)
    expect(state.assets.find((a) => a.holdingContext === 'traditionalRetirement')!.value).toBe(12000)
    expect(pool).toBe(0)
  })

  it('changing policy priority changes the outcome without changing the mechanism', () => {
    const retirementFirst: Policy[] = [
      { id: 'r', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'traditionalRetirement' },
      { id: 'm', kind: 'payMortgageExtra', priority: 2 },
    ]
    const mortgageFirst: Policy[] = [
      { id: 'm', kind: 'payMortgageExtra', priority: 1 },
      { id: 'r', kind: 'contributeUpToLimit', priority: 2, targetHoldingContext: 'traditionalRetirement' },
    ]

    const a = reconcile(5000, baseState(), retirementFirst, getParam, ctx)
    const b = reconcile(5000, baseState(), mortgageFirst, getParam, ctx)

    expect(a.state.assets.find((x) => x.holdingContext === 'traditionalRetirement')!.value).toBe(15000)
    expect(a.state.liabilities[0]!.balance).toBe(300000)

    expect(b.state.liabilities[0]!.balance).toBe(295000)
    expect(b.state.assets.find((x) => x.holdingContext === 'traditionalRetirement')!.value).toBe(10000)
  })

  it('a non-positive pool makes every policy a no-op', () => {
    const policies: Policy[] = [
      { id: 'r', kind: 'maintainCashReserve', priority: 1 },
      { id: 'c', kind: 'contributeUpToLimit', priority: 2, targetHoldingContext: 'traditionalRetirement' },
    ]
    const { state } = reconcile(-2000, baseState(), policies, getParam, ctx)
    expect(state).toEqual(baseState())
  })
})
