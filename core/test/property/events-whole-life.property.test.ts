import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addMonths } from '../../src/domain/dates.ts'
import { createTrajectory } from '../../src/domain/trajectory.ts'
import { netWorth, type FinancialState } from '../../src/domain/types.ts'
import { calculate } from '../../src/engine/calculate.ts'
import { pointEventsFor, propertyRuns, propertySeed, scenario, scenarioParametersArb } from './generators.ts'

const options = { seed: propertySeed + 2, numRuns: propertyRuns, verbose: 2 as const }

describe('property: event and Whole Life hardening', () => {
  it('applies each one-time cash flow once, on its own tick only', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 8 }), fc.double({ min: -50_000, max: 50_000, noNaN: true }), (duration, amount) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }], liabilities: [] }
      const at = addMonths('2026-01', Math.floor(duration / 2))
      const trajectory = createTrajectory('event', [scenario('one', '2026-01', duration, { spending: 0, taxRate: 0, cashApy: 0 }, [], [{ id: 'flow', at, effect: { kind: 'oneTimeCashFlow', amount } }])])
      const monthly = calculate(initial, trajectory).monthly
      monthly.forEach((state, index) => expect(netWorth(state)).toBeCloseTo(100_000 + (index >= Math.floor(duration / 2) ? amount : 0), 7))
    }), options)
  })

  it('does not let events mutate their scenario inputs', () => {
    fc.assert(fc.property(scenarioParametersArb, pointEventsFor('2026-01', 3), (parameters, events) => {
      const policies = [{ id: 'cash', kind: 'fundDeficitFromCash' as const, priority: 1 }]
      const source = scenario('one', '2026-01', 3, parameters, policies, events)
      const trajectory = createTrajectory('events', [source])
      const before = structuredClone(trajectory.scenarios[0]!)
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }], liabilities: [] }
      calculate(initial, trajectory)
      expect(trajectory.scenarios[0]).toEqual(before)
    }), options)
  })

  it('keeps employment active from its start through the tick before its end', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 7 }), fc.double({ min: 0, max: 240_000, noNaN: true }), (endOffset, salary) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 }], liabilities: [] }
      const trajectory = createTrajectory('employment duration', [scenario('one', '2026-01', 8, { spending: 0, taxRate: 0, cashApy: 0 }, [], [
        { id: 'start', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: salary } },
        { id: 'end', at: addMonths('2026-01', endOffset), effect: { kind: 'employmentEnd' } },
      ])])
      const monthly = calculate(initial, trajectory).monthly
      monthly.forEach((state, index) => expect(netWorth(state)).toBeCloseTo(index < endOffset ? salary / 12 * (index + 1) : salary / 12 * endOffset, 7))
    }), options)
  })

  it('is order-independent for same-month one-time cash-flow events', () => {
    fc.assert(fc.property(fc.double({ min: -25_000, max: 25_000, noNaN: true }), fc.double({ min: -25_000, max: 25_000, noNaN: true }), (left, right) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }], liabilities: [] }
      const parameters = { spending: 0, taxRate: 0, cashApy: 0 }
      const events = [
        { id: 'left', at: '2026-01', effect: { kind: 'oneTimeCashFlow' as const, amount: left } },
        { id: 'right', at: '2026-01', effect: { kind: 'oneTimeCashFlow' as const, amount: right } },
      ]
      const forward = createTrajectory('forward', [scenario('one', '2026-01', 1, parameters, [], events)])
      const reverse = createTrajectory('reverse', [scenario('one', '2026-01', 1, parameters, [], [...events].reverse())])
      expect(calculate(initial, forward)).toEqual(calculate(initial, reverse))
    }), options)
  })

  it('keeps Whole Life cash value and loan accounting coherent under same-month operations', () => {
    fc.assert(fc.property(fc.integer({ min: 1_000, max: 500_000 }), fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50 }), (value, loanPercent, withdrawalPercent) => {
      const loanFraction = loanPercent / 100
      const withdrawalFraction = withdrawalPercent / 100
      const loan = value * loanFraction
      const withdrawal = value * withdrawalFraction
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'whole-life', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value },
      ], liabilities: [] }
      const trajectory = createTrajectory('whole life', [scenario('one', '2026-01', 1, { spending: 0, taxRate: 0, wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0, wholeLifeLoanRate: 0 }, [], [
        { id: 'loan', at: '2026-01', effect: { kind: 'wholeLifePolicyLoan', assetId: 'whole-life', amount: loan } },
        { id: 'withdraw', at: '2026-01', effect: { kind: 'wholeLifeWithdrawal', assetId: 'whole-life', amount: withdrawal } },
      ])])
      const final = calculate(initial, trajectory).monthly[0]!
      const policy = final.assets.find((asset) => asset.id === 'whole-life')!
      const cash = final.assets.find((asset) => asset.id === 'cash')!
      expect(policy.value).toBeCloseTo(value - withdrawal, 6)
      expect(policy.policyLoanBalance).toBeCloseTo(loan, 6)
      expect(cash.value).toBeCloseTo(loan + withdrawal, 6)
      expect(netWorth(final)).toBeCloseTo(value, 6)
    }), options)
  })
})
