import { describe, expect, it } from 'vitest'
import { activeAnnualSalaryAt, applyPointEvent, isPointEventActiveAt } from '../src/engine/eventTypeBehaviors.ts'
import type { Event, FinancialState } from '../src/domain/types.ts'

describe('activeAnnualSalaryAt', () => {
  it('is 0 before any employmentStart', () => {
    const events: Event[] = [{ id: 'e1', at: '2026-06', effect: { kind: 'employmentStart', annualSalary: 60000 } }]
    expect(activeAnnualSalaryAt(events, '2026-01')).toBe(0)
  })

  it('is active from the employmentStart tick onward', () => {
    const events: Event[] = [{ id: 'e1', at: '2026-06', effect: { kind: 'employmentStart', annualSalary: 60000 } }]
    expect(activeAnnualSalaryAt(events, '2026-06')).toBe(60000)
    expect(activeAnnualSalaryAt(events, '2030-01')).toBe(60000)
  })

  it('goes back to 0 after employmentEnd', () => {
    const events: Event[] = [
      { id: 'e1', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 60000 } },
      { id: 'e2', at: '2027-06', effect: { kind: 'employmentEnd' } },
    ]
    expect(activeAnnualSalaryAt(events, '2027-05')).toBe(60000)
    expect(activeAnnualSalaryAt(events, '2027-06')).toBe(0)
    expect(activeAnnualSalaryAt(events, '2030-01')).toBe(0)
  })

  it('a later employmentStart overrides an earlier one, independent of event array order', () => {
    const events: Event[] = [
      { id: 'e2', at: '2029-01', effect: { kind: 'employmentStart', annualSalary: 90000 } },
      { id: 'e1', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 60000 } },
    ]
    expect(activeAnnualSalaryAt(events, '2027-01')).toBe(60000)
    expect(activeAnnualSalaryAt(events, '2029-01')).toBe(90000)
  })
})

describe('isPointEventActiveAt', () => {
  it('is only active on its own exact tick', () => {
    const event: Event = { id: 'e', at: '2027-03', effect: { kind: 'oneTimeCashFlow', amount: 100 } }
    expect(isPointEventActiveAt(event, '2027-02')).toBe(false)
    expect(isPointEventActiveAt(event, '2027-03')).toBe(true)
    expect(isPointEventActiveAt(event, '2027-04')).toBe(false)
  })
})

function baseState(): FinancialState {
  return {
    asOf: '2026-01',
    reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 1000 }],
    liabilities: [],
  }
}

describe('applyPointEvent', () => {
  it('employmentStart/employmentEnd do not transform state directly', () => {
    const state = baseState()
    const started = applyPointEvent(state, { id: 'e', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 60000 } })
    expect(started).toEqual(state)
  })

  it('oneTimeCashFlow adds to (or subtracts from) cash', () => {
    const state = applyPointEvent(baseState(), { id: 'e', at: '2026-01', effect: { kind: 'oneTimeCashFlow', amount: -300 } })
    expect(state.assets.find((a) => a.assetType === 'cash')!.value).toBe(700)
  })

  it('sellProperty removes the property and its linked mortgage, netting proceeds to cash', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'home', name: 'Home', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 500000 },
      ],
      liabilities: [{ id: 'm', name: 'Mortgage', kind: 'mortgage', balance: 200000, linkedAssetId: 'home' }],
    }
    const after = applyPointEvent(state, { id: 'e', at: '2026-01', effect: { kind: 'sellProperty', assetId: 'home' } })
    expect(after.assets.some((a) => a.id === 'home')).toBe(false)
    expect(after.liabilities).toHaveLength(0)
    expect(after.assets.find((a) => a.assetType === 'cash')!.value).toBe(300000)
  })

  it('sellProperty deducts a selling fee (rate of sale price) from proceeds before the mortgage payoff', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'home', name: 'Home', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 500000 },
      ],
      liabilities: [{ id: 'm', name: 'Mortgage', kind: 'mortgage', balance: 200000, linkedAssetId: 'home' }],
    }
    const after = applyPointEvent(state, { id: 'e', at: '2026-01', effect: { kind: 'sellProperty', assetId: 'home', sellingFeeRate: 0.06 } })
    expect(after.assets.some((a) => a.id === 'home')).toBe(false)
    expect(after.liabilities).toHaveLength(0)
    // 500000 sale - 30000 fee (6%) - 200000 mortgage payoff = 270000 net proceeds
    expect(after.assets.find((a) => a.assetType === 'cash')!.value).toBe(270000)
  })

  it('wholeLifePolicyLoan increases cash and the loan balance without reducing the policy value', () => {
    const state: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 50000 },
      ],
      liabilities: [],
    }
    const after = applyPointEvent(state, { id: 'e', at: '2026-01', effect: { kind: 'wholeLifePolicyLoan', assetId: 'wl', amount: 5000 } })
    const wl = after.assets.find((a) => a.id === 'wl')!
    expect(wl.value).toBe(50000)
    expect(wl.policyLoanBalance).toBe(5000)
    expect(after.assets.find((a) => a.assetType === 'cash')!.value).toBe(5000)
  })
})
