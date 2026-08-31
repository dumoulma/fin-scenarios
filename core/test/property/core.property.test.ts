import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addMonths, monthsBetween } from '../../src/domain/dates.ts'
import { createTrajectory, duplicateTrajectory } from '../../src/domain/trajectory.ts'
import { CurrencyInvariantError, netWorth, type FinancialState } from '../../src/domain/types.ts'
import { calculate } from '../../src/engine/calculate.ts'
import { contiguousTrajectoryArb, initialStateArb, propertyRuns, propertySeed, scenario, scenarioParametersArb } from './generators.ts'

const options = { seed: propertySeed, numRuns: propertyRuns, verbose: 2 as const }

describe('property: core calculation invariants', () => {
  it('emits exactly one contiguous state per modeled month', () => {
    fc.assert(fc.property(initialStateArb, contiguousTrajectoryArb, (initial, trajectory) => {
      const result = calculate(initial, trajectory)
      expect(result.monthly).toHaveLength(monthsBetween(trajectory.scenarios[0]!.start, trajectory.scenarios.at(-1)!.end))
      expect(result.monthly[0]!.asOf).toBe(initial.asOf)
      expect(result.monthly.at(-1)!.asOf).toBe(trajectory.scenarios.at(-1)!.end)
      result.monthly.slice(1).forEach((state, index) => expect(state.asOf).toBe(addMonths(result.monthly[index]!.asOf, 1)))
      expect(result.monthly.every((state) => Number.isFinite(netWorth(state)))).toBe(true)
    }), options)
  })

  it('preserves the accounting identity for cash-only flows', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 100_000, noNaN: true }), fc.double({ min: -20_000, max: 20_000, noNaN: true }), fc.double({ min: 0, max: 20_000, noNaN: true }), (cash, flow, spending) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: cash }], liabilities: [] }
      const trajectory = createTrajectory('one tick', [scenario('one', '2026-01', 1, { spending, taxRate: 0, cashApy: 0 }, [], [{ id: 'flow', at: '2026-01', effect: { kind: 'oneTimeCashFlow', amount: flow } }])])
      expect(netWorth(calculate(initial, trajectory).monthly[0]!)).toBeCloseTo(cash + flow - spending, 7)
    }), options)
  })

  it('is partition-equivalent when an event-free scenario is split', () => {
    fc.assert(fc.property(initialStateArb, scenarioParametersArb, fc.integer({ min: 2, max: 8 }), fc.integer({ min: 1, max: 7 }), (initial, parameters, duration, requestedSplit) => {
      const split = Math.min(requestedSplit, duration - 1)
      const whole = createTrajectory('whole', [scenario('whole', '2026-01', duration, parameters)])
      const parts = createTrajectory('parts', [scenario('first', '2026-01', split, parameters), scenario('second', addMonths('2026-01', split), duration - split, parameters)])
      expect(calculate(initial, parts).monthly).toEqual(calculate(initial, whole).monthly)
    }), options)
  })

  it('keeps copied trajectories identical and extension-local', () => {
    fc.assert(fc.property(initialStateArb, scenarioParametersArb, fc.integer({ min: 1, max: 6 }), (initial, parameters, duration) => {
      const source = createTrajectory('source', [scenario('source', '2026-01', duration, parameters)])
      const copied = duplicateTrajectory(source, 'copy')
      const extension = createTrajectory('extended', [...source.scenarios, scenario('extension', addMonths(source.scenarios[0]!.end, 1), 2, parameters)])
      expect(calculate(initial, copied)).toEqual(calculate(initial, source))
      expect(calculate(initial, extension).monthly.slice(0, duration)).toEqual(calculate(initial, source).monthly)
    }), options)
  })

  it('rejects missing FX rather than silently combining currencies', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 1_000_000, noNaN: true }), (value) => {
      const initial: FinancialState = { asOf: '2026-01', reportingCurrency: 'USD', assets: [{ id: 'yen', name: 'Yen asset', assetType: 'cash', holdingContext: 'none', country: 'JP', currency: 'JPY', value }], liabilities: [] }
      const trajectory = createTrajectory('one tick', [scenario('one', '2026-01', 1, { spending: 0, taxRate: 0 })])
      expect(() => calculate(initial, trajectory)).toThrow(CurrencyInvariantError)
    }), options)
  })
})
