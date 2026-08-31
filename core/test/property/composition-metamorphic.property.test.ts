import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addMonths, monthsBetween } from '../../src/domain/dates.ts'
import { createTrajectory } from '../../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Scenario } from '../../src/domain/types.ts'
import { calculate } from '../../src/engine/calculate.ts'
import { pointEventsFor, policiesArb, propertyRuns, propertySeed, scenario, scenarioParametersArb } from './generators.ts'

const options = { seed: propertySeed + 3, numRuns: 50, verbose: 2 as const }

function lifeState(): FinancialState {
  return {
    asOf: '2026-01', reportingCurrency: 'USD',
    assets: [
      { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 50_000 },
      { id: 'equity', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 100_000, growthRate: 0.05, distributionRate: 0.02 },
      { id: 'bonds', name: 'Bonds', assetType: 'fixedIncome', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 60_000 },
      { id: 'property', name: 'Home', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 300_000 },
      { id: 'whole-life', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 40_000, policyLoanBalance: 5_000 },
    ],
    liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 150_000, interestRate: 0.04, monthlyPayment: 1_000, linkedAssetId: 'property' }],
  }
}

describe('property: composed lives and metamorphic relations', () => {
  it('calculates small complete financial lives without gaps, metadata loss, or non-finite values', () => {
    const scenarioInput = fc.tuple(fc.integer({ min: 1, max: 4 }), scenarioParametersArb, policiesArb).chain(([duration, parameters, policies]) => pointEventsFor('2026-01', duration).map((events) => ({ duration, parameters, policies, events })))
    fc.assert(fc.property(fc.array(scenarioInput, { minLength: 1, maxLength: 5 }), (inputs) => {
      let cursor = '2026-01'
      const scenarios: Scenario[] = inputs.map((input, index) => {
        const events = input.events.map((event) => ({ ...event, at: addMonths(cursor, monthsBetween('2026-01', event.at) - 1) }))
        const result = scenario(`scenario-${index}`, cursor, input.duration, input.parameters, input.policies, events)
        cursor = addMonths(result.end, 1)
        return result
      })
      const trajectory = createTrajectory('generated life', scenarios)
      const result = calculate(lifeState(), trajectory)
      expect(result.monthly).toHaveLength(monthsBetween('2026-01', trajectory.scenarios.at(-1)!.end))
      result.monthly.forEach((state) => {
        expect(Number.isFinite(netWorth(state))).toBe(true)
        state.assets.forEach((asset) => { expect(asset.country).toBeTruthy(); expect(asset.currency).toBe('USD') })
      })
    }), options)
  })

  it('keeps scenario parameters local to their own period', () => {
    fc.assert(fc.property(scenarioParametersArb, scenarioParametersArb, (first, second) => {
      const initial = lifeState()
      const baseline = createTrajectory('baseline', [scenario('first', '2026-01', 2, first), scenario('second', '2026-03', 2, second)])
      const changedSecond = createTrajectory('changed', [scenario('first', '2026-01', 2, first), scenario('second', '2026-03', 2, { ...second, spending: second.spending + 1_000 })])
      expect(calculate(initial, changedSecond).monthly.slice(0, 2)).toEqual(calculate(initial, baseline).monthly.slice(0, 2))
    }), options)
  })

  it('is monotonic in an equity return when no behavior can offset the gain', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 0.15, noNaN: true }), fc.double({ min: 0, max: 0.15, noNaN: true }), (left, right) => {
      const low = Math.min(left, right)
      const high = Math.max(left, right)
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'equity', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }], liabilities: [] }
      const makeTrajectory = (equityReturn: number) => createTrajectory('return', [scenario('one', '2026-01', 12, { spending: 0, taxRate: 0, equityReturn, equityDistributionRate: 0 })])
      expect(netWorth(calculate(initial, makeTrajectory(high)).monthly.at(-1)!)).toBeGreaterThanOrEqual(netWorth(calculate(initial, makeTrajectory(low)).monthly.at(-1)!))
    }), options)
  })

  it('does not let Holding Context change equity growth when distributions and taxes are absent', () => {
    fc.assert(fc.property(fc.double({ min: -0.2, max: 0.2, noNaN: true }), (growth) => {
      const trajectory = createTrajectory('contexts', [scenario('one', '2026-01', 6, { spending: 0, taxRate: 0, equityReturn: growth, equityDistributionRate: 0 })])
      const makeState = (holdingContext: 'none' | 'rothRetirement'): FinancialState => ({ asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'equity', name: 'Equity', assetType: 'equity', holdingContext, country: 'US', currency: 'USD', value: 100_000 }], liabilities: [] })
      const values = (holdingContext: 'none' | 'rothRetirement') => calculate(makeState(holdingContext), trajectory).monthly.map((state) => state.assets[0]!.value)
      expect(values('none')).toEqual(values('rothRetirement'))
    }), options)
  })
})
