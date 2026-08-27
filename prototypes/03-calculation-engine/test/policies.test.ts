import { describe, expect, it } from 'vitest'
import { runPolicies } from '../src/engine/policies.ts'
import type { GetParam } from '../src/engine/assetBehavior.ts'
import type { FinancialState, Policy } from '../src/domain/types.ts'

function baseState(): FinancialState {
  return {
    asOf: '2026-01',
    assets: [
      { kind: 'cash', id: 'cash', name: 'Cash', balance: 5000 },
      { kind: 'taxableBrokerage', id: 'brokerage', name: 'Brokerage', balance: 10000 },
    ],
    liabilities: [{ kind: 'mortgage', id: 'm', name: 'Mortgage', balance: 300000, interestRate: 0.06, monthlyPayment: 2000, propertyAssetId: 'home' }],
  }
}

const getParam: GetParam = (name) => (name === 'cashReserveTarget' ? 10000 : 0)

describe('runPolicies', () => {
  it('spending claims first and can drive the pool negative — no liquidation waterfall in this prototype', () => {
    const { pool } = runPolicies(1000, baseState(), [{ id: 'p', kind: 'spending', priority: 1 }], getParam, { spendingAmount: 4000 })
    expect(pool).toBe(1000 - 4000)
  })

  it('changing policy priority changes the resulting FinancialState without changing the mechanism', () => {
    const policiesInvestFirst: Policy[] = [
      { id: 'invest', kind: 'investSurplus', priority: 1 },
      { id: 'mortgage', kind: 'payMortgage', priority: 2 },
    ]
    const policiesMortgageFirst: Policy[] = [
      { id: 'mortgage', kind: 'payMortgage', priority: 1 },
      { id: 'invest', kind: 'investSurplus', priority: 2 },
    ]

    const investFirst = runPolicies(5000, baseState(), policiesInvestFirst, getParam, { spendingAmount: 0 })
    const mortgageFirst = runPolicies(5000, baseState(), policiesMortgageFirst, getParam, { spendingAmount: 0 })

    // investSurplus claims everything when it runs first, leaving nothing for payMortgage
    expect(investFirst.state.assets.find((a) => a.kind === 'taxableBrokerage')).toMatchObject({ balance: 15000 })
    expect(investFirst.state.liabilities[0]).toMatchObject({ balance: 300000 })

    // payMortgage claims everything when it runs first, leaving nothing for investSurplus
    expect(mortgageFirst.state.liabilities[0]).toMatchObject({ balance: 295000 })
    expect(mortgageFirst.state.assets.find((a) => a.kind === 'taxableBrokerage')).toMatchObject({ balance: 10000 })
  })

  it('maintainCashReserve only tops up to the target, never past it', () => {
    const { pool, state } = runPolicies(50000, baseState(), [{ id: 'reserve', kind: 'maintainCashReserve', priority: 1 }], getParam, { spendingAmount: 0 })
    const cash = state.assets.find((a) => a.kind === 'cash')!
    expect(cash.balance).toBe(10000) // target from getParam, not the full pool
    expect(pool).toBe(50000 - 5000) // only the shortfall (10000 - 5000) was claimed
  })

  it('a non-positive pool means every subsequent policy is a no-op', () => {
    const policies: Policy[] = [
      { id: 'spend', kind: 'spending', priority: 1 },
      { id: 'reserve', kind: 'maintainCashReserve', priority: 2 },
      { id: 'mortgage', kind: 'payMortgage', priority: 3 },
      { id: 'invest', kind: 'investSurplus', priority: 4 },
    ]
    const { state } = runPolicies(1000, baseState(), policies, getParam, { spendingAmount: 5000 })
    expect(state).toEqual(baseState()) // nothing changed except the (untracked) pool
  })
})
