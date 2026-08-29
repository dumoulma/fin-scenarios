import { describe, expect, it } from 'vitest'
import { calculate, TrajectoryInvariantError, type ParameterProvider } from '../src/engine/calculate.ts'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Scenario, type Trajectory } from '../src/domain/types.ts'
import { initialState, quietMillionaireTrajectory } from '../src/scenarios/quietMillionaire.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ events: [], parameters: { spending: 0, taxRate: 0 }, policies: [], ...overrides })
}

describe('calculate — monthly coherence', () => {
  it('produces one FinancialState per month, in order, covering the whole Trajectory', () => {
    const trajectory = createTrajectory('Two jobs', [
      scenario({ name: 'A', start: '2026-01', end: '2026-06' }),
      scenario({ name: 'B', start: '2026-07', end: '2027-06' }),
    ])
    const state: FinancialState = { asOf: '2026-01', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 0 }], liabilities: [] }

    const result = calculate(state, trajectory)

    expect(result.monthly).toHaveLength(18) // 2026-01 .. 2027-06
    expect(result.monthly[0]!.asOf).toBe('2026-01')
    expect(result.monthly.at(-1)!.asOf).toBe('2027-06')
    for (let i = 1; i < result.monthly.length; i++) {
      expect(result.monthly[i]!.asOf > result.monthly[i - 1]!.asOf).toBe(true)
    }
  })

  it('derives annual snapshots from the monthly result, one per year at that year\'s last month', () => {
    const result = calculate(initialState, quietMillionaireTrajectory)
    expect(result.annual).toHaveLength(40)
    expect(result.annual.map((s) => s.asOf)).toEqual(Array.from({ length: 40 }, (_, i) => `${2026 + i}-12`))
  })

  it('refuses a non-contiguous Trajectory', () => {
    const a = scenario({ name: 'A', start: '2026-01', end: '2026-06' })
    const b = scenario({ name: 'B', start: '2026-08', end: '2026-12' })
    const trajectory: Trajectory = { id: 't', name: 't', scenarios: [a, b] }
    const state: FinancialState = { asOf: '2026-01', assets: [], liabilities: [] }
    expect(() => calculate(state, trajectory)).toThrow(TrajectoryInvariantError)
  })

  it('is deterministic', () => {
    const first = calculate(initialState, quietMillionaireTrajectory)
    const second = calculate(initialState, quietMillionaireTrajectory)
    expect(first).toEqual(second)
  })
})

describe('calculate — quiet millionaire, hand-computed first month', () => {
  it('matches the expected pool math: gross - tax, then spending, then reserve top-up, then 401(k)', () => {
    const result = calculate(initialState, quietMillionaireTrajectory)
    const first = result.monthly[0]!

    const grossIncome = 50000 / 12
    const afterTax = grossIncome - grossIncome * 0.2
    const spending = (50000 * 0.55) / 12
    const afterSpending = afterTax - spending
    const reserveTarget = spending * 3
    const reserveClaim = Math.min(afterSpending, reserveTarget) // cash starts at 0

    expect(first.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(reserveClaim, 6)
    expect(first.assets.find((a) => a.holdingContext === 'traditionalRetirement')!.value).toBeCloseTo(0, 6) // reserve absorbed the whole pool this month
    expect(netWorth(first)).toBeCloseTo(reserveClaim, 6)
  })

  it('crosses into positive six-figure net worth well before the final job, and ends a multi-millionaire at 65', () => {
    const result = calculate(initialState, quietMillionaireTrajectory)
    const atFifty = result.annual.find((s) => s.asOf === '2051-12')!
    const atSixtyFive = result.annual.at(-1)!
    expect(netWorth(atFifty)).toBeGreaterThan(1_000_000)
    expect(netWorth(atSixtyFive)).toBeGreaterThan(2_000_000)
  })

  it('cash tracks the 3-month reserve target rather than accumulating unboundedly', () => {
    // maintainCashReserve only tops up shortfalls, never sweeps down interest-driven
    // excess, so cash can drift a bit above the exact target over 40 years — this
    // just checks it stays in that ballpark, not runaway-accumulating like the
    // pre-fix bug where uncapped leftover pool piled up in cash indefinitely.
    const result = calculate(initialState, quietMillionaireTrajectory)
    const final = result.annual.at(-1)!
    const finalScenario = quietMillionaireTrajectory.scenarios.at(-1)!
    const expectedReserve = finalScenario.parameters.spending * 3
    const cash = final.assets.find((a) => a.assetType === 'cash')!.value
    expect(cash).toBeGreaterThanOrEqual(expectedReserve)
    expect(cash).toBeLessThan(expectedReserve * 2)
  })
})

describe('calculate — Input Generator seam', () => {
  it('swapping the parameterProvider changes the result but stays deterministic for a fixed provider', () => {
    const varyingReturn: ParameterProvider = (name, scenario, tick) => {
      if (name !== 'equityReturn') return scenario.parameters[name] ?? 0
      const month = Number(tick.split('-')[1])
      return month % 2 === 0 ? 0.09 : 0.05
    }

    const constant = calculate(initialState, quietMillionaireTrajectory)
    const varying = calculate(initialState, quietMillionaireTrajectory, { parameterProvider: varyingReturn })
    const varyingAgain = calculate(initialState, quietMillionaireTrajectory, { parameterProvider: varyingReturn })

    expect(netWorth(varying.annual.at(-1)!)).not.toBeCloseTo(netWorth(constant.annual.at(-1)!), 0)
    expect(varying).toEqual(varyingAgain)
  })
})
