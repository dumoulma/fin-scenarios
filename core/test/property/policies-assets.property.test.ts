import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createTrajectory } from '../../src/domain/trajectory.ts'
import { netWorth, type Asset, type FinancialState } from '../../src/domain/types.ts'
import { calculate } from '../../src/engine/calculate.ts'
import { assetArb, propertyRuns, propertySeed, scenario, scenarioParametersArb } from './generators.ts'

const options = { seed: propertySeed + 1, numRuns: propertyRuns, verbose: 2 as const }
const valueOf = (state: FinancialState, id: string) => state.assets.find((asset) => asset.id === id)!.value

describe('property: policy and asset hardening', () => {
  it('does not allocate a surplus twice across priority-ordered policies', () => {
    fc.assert(fc.property(fc.double({ min: 1, max: 25_000, noNaN: true }), fc.double({ min: 0, max: 30_000, noNaN: true }), (surplus, limit) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'retirement', name: 'Retirement', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 0 },
        { id: 'brokerage', name: 'Brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 },
      ], liabilities: [] }
      const trajectory = createTrajectory('priority', [scenario('one', '2026-01', 1, { spending: 0, taxRate: 0, equityReturn: 0, traditionalRetirementAnnualLimit: limit }, [
        { id: 'limit', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'traditionalRetirement' },
        { id: 'invest', kind: 'investSurplus', priority: 2 },
      ], [{ id: 'income', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: surplus * 12 } }])])
      const final = calculate(initial, trajectory).monthly[0]!
      const firstClaim = Math.min(surplus, limit / 12)
      expect(valueOf(final, 'retirement')).toBeCloseTo(firstClaim, 7)
      expect(valueOf(final, 'brokerage')).toBeCloseTo(surplus - firstClaim, 7)
      expect(netWorth(final)).toBeCloseTo(surplus, 7)
    }), options)
  })

  it('uses the priority order to select which deficit source is consumed', () => {
    fc.assert(fc.property(fc.double({ min: 1, max: 50_000, noNaN: true }), fc.double({ min: 1, max: 50_000, noNaN: true }), (cash, deficit) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: cash },
        { id: 'equity', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: deficit + 1 },
      ], liabilities: [] }
      const trajectory = createTrajectory('deficit', [scenario('one', '2026-01', 1, { spending: deficit, taxRate: 0, cashApy: 0, equityReturn: 0 }, [
        { id: 'cash-first', kind: 'fundDeficitFromCash', priority: 1 }, { id: 'equity-second', kind: 'fundDeficitFromEquitySale', priority: 2 },
      ])])
      const final = calculate(initial, trajectory).monthly[0]!
      expect(valueOf(final, 'cash')).toBeCloseTo(Math.max(0, cash - deficit), 7)
      expect(valueOf(final, 'equity')).toBeCloseTo(deficit + 1 - Math.max(0, deficit - cash), 7)
    }), options)
  })

  it('keeps independently modeled equivalent equity positions additive', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 500_000, noNaN: true }), fc.double({ min: -0.2, max: 0.2, noNaN: true }), fc.double({ min: 0, max: 0.06, noNaN: true }), (value, growth, distribution) => {
      const base: Asset = { id: 'equity', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value, growthRate: growth, distributionRate: distribution }
      const split: Asset[] = [{ ...base, id: 'equity-a', value: value * 0.4 }, { ...base, id: 'equity-b', value: value * 0.6 }]
      const parameters = { spending: 0, taxRate: 0, equityReturn: 0, equityDistributionRate: 0 }
      const trajectory = createTrajectory('one', [scenario('one', '2026-01', 1, parameters)])
      const makeState = (assets: Asset[]): FinancialState => ({ asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 }, ...assets], liabilities: [] })
      expect(netWorth(calculate(makeState(split), trajectory).monthly[0]!)).toBeCloseTo(netWorth(calculate(makeState([base]), trajectory).monthly[0]!), 7)
    }), options)
  })

  it('does not duplicate a cash flow when cash is represented by two positions', () => {
    fc.assert(fc.property(fc.double({ min: -50_000, max: 50_000, noNaN: true }), (flow) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [
        { id: 'cash-a', name: 'Checking', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100 },
        { id: 'cash-b', name: 'Savings', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 200 },
      ], liabilities: [] }
      const trajectory = createTrajectory('cash positions', [scenario('one', '2026-01', 1, { spending: 0, taxRate: 0, cashApy: 0 }, [], [{ id: 'flow', at: '2026-01', effect: { kind: 'oneTimeCashFlow', amount: flow } }])])
      expect(netWorth(calculate(initial, trajectory).monthly[0]!)).toBeCloseTo(300 + flow, 7)
    }), options)
  })

  it('preserves country and currency metadata through every tick', () => {
    fc.assert(fc.property(assetArb('asset'), scenarioParametersArb, (asset, parameters) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 }, asset], liabilities: [] }
      const trajectory = createTrajectory('metadata', [scenario('one', '2026-01', 3, parameters)])
      calculate(initial, trajectory).monthly.forEach((state) => {
        const output = state.assets.find((candidate) => candidate.id === asset.id)!
        expect(output.country).toBe(asset.country)
        expect(output.currency).toBe(asset.currency)
      })
    }), options)
  })
})
