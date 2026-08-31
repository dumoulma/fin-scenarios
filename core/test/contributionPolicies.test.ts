// Replaces the vague "contributeToRetirement" with policies that target a real
// destination bucket (HoldingContext) explicitly — a 401(k) match/limit and an
// IRA limit are mechanically the same claim-and-cap shape, just aimed at a
// different Policy.targetHoldingContext, not different policy kinds.
import { describe, expect, it } from 'vitest'
import { reconcile } from '../src/engine/policies.ts'
import type { GetParam } from '../src/engine/assetTypeBehaviors.ts'
import type { FinancialState, Policy } from '../src/domain/types.ts'

function getParam(values: Record<string, number>): GetParam {
  return (name) => values[name] ?? 0
}

function stateWith401k(value = 0): FinancialState {
  return {
    asOf: '2026-01',
    reportingCurrency: 'USD', assets: [{ id: '401k', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value }],
    liabilities: [],
  }
}

describe('contributeUpToMatch', () => {
  const policy: Policy = { id: 'p', kind: 'contributeUpToMatch', priority: 1, targetHoldingContext: 'traditionalRetirement' }

  it('claims the employee contribution up to the match-eligible percent of salary, and adds the employer match on top for free', () => {
    const ctx = { spendingAmount: 0, grossIncome: 10_000, matchRate: 0.5, matchLimitPercentOfSalary: 0.06, annualContributions: new Map() } // match 50% of employee contribution, up to 6% of salary
    const { pool, state } = reconcile(2_000, stateWith401k(), [policy], getParam({}), ctx)

    const employeeContribution = 10_000 * 0.06 // 600
    const employerMatch = employeeContribution * 0.5 // 300
    expect(pool).toBe(2_000 - employeeContribution) // only the employee's own contribution reduces the pool
    expect(state.assets[0]!.value).toBeCloseTo(employeeContribution + employerMatch, 6)
  })

  it('claims only what the pool has if the pool is smaller than the match-eligible amount (match still applies to the smaller amount actually contributed)', () => {
    const ctx = { spendingAmount: 0, grossIncome: 10_000, matchRate: 1, matchLimitPercentOfSalary: 0.06, annualContributions: new Map() } // dollar-for-dollar match up to 6%
    const { pool, state } = reconcile(200, stateWith401k(), [policy], getParam({}), ctx)

    expect(pool).toBe(0)
    expect(state.assets[0]!.value).toBeCloseTo(200 + 200, 6) // 200 employee + 100% match
  })

  it('does nothing without a targetHoldingContext, without a matching asset, or on a deficit', () => {
    const ctx = { spendingAmount: 0, grossIncome: 10_000, matchRate: 0.5, matchLimitPercentOfSalary: 0.06, annualContributions: new Map() }
    const noTarget: Policy = { id: 'p', kind: 'contributeUpToMatch', priority: 1 }
    expect(reconcile(2_000, stateWith401k(), [noTarget], getParam({}), ctx).pool).toBe(2_000)
    expect(reconcile(2_000, { asOf: '2026-01', reportingCurrency: 'USD', assets: [], liabilities: [] }, [policy], getParam({}), ctx).pool).toBe(2_000)
    expect(reconcile(-500, stateWith401k(), [policy], getParam({}), ctx).pool).toBe(-500)
  })
})

describe('contributeUpToLimit', () => {
  const policy: Policy = { id: 'p', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'traditionalRetirement' }
  const ctx = { spendingAmount: 0, grossIncome: 0, matchRate: 0, matchLimitPercentOfSalary: 0, annualContributions: new Map() }

  it('claims up to the monthly-equivalent of the bucket-specific annual limit, looked up by targetHoldingContext', () => {
    const { pool, state } = reconcile(5_000, stateWith401k(), [policy], getParam({ traditionalRetirementAnnualLimit: 24_000 }), ctx) // $2,000/mo
    expect(pool).toBe(5_000 - 2_000)
    expect(state.assets[0]!.value).toBeCloseTo(2_000, 6)
  })

  it('claims the whole pool if it is under the monthly limit', () => {
    const { pool, state } = reconcile(500, stateWith401k(), [policy], getParam({ traditionalRetirementAnnualLimit: 24_000 }), ctx)
    expect(pool).toBe(0)
    expect(state.assets[0]!.value).toBeCloseTo(500, 6)
  })

  it('a different targetHoldingContext looks up its own limit — an IRA and a 401(k) are the same policy kind, different bucket', () => {
    const iraPolicy: Policy = { id: 'p', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'rothRetirement' }
    const state: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'ira', name: 'Roth IRA', assetType: 'equity', holdingContext: 'rothRetirement', country: 'US', currency: 'USD', value: 0 }], liabilities: [] }
    const { state: after } = reconcile(1_000, state, [iraPolicy], getParam({ rothRetirementAnnualLimit: 7_000, traditionalRetirementAnnualLimit: 24_000 }), ctx)
    expect(after.assets[0]!.value).toBeCloseTo(7_000 / 12, 6) // used the Roth limit, not the Traditional one
  })
})
