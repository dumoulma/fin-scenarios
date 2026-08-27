import { describe, expect, it } from 'vitest'
import { calculate, TrajectoryInvariantError, type ParameterProvider } from '../src/engine/calculate.ts'
import { netWorth, type FinancialState, type Scenario, type Trajectory } from '../src/domain/types.ts'
import { fixtureTrajectory, initialState } from '../src/fixtures.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return { id: overrides.name, income: [], spending: [], events: [], policies: [], parameters: {}, ...overrides }
}

describe('calculate — the end-to-end fixture', () => {
  const result = calculate(initialState, fixtureTrajectory)

  it('produces a coherent monthly FinancialState for every month, in order, with every month belonging to exactly one Scenario', () => {
    expect(result.monthly[0]!.asOf).toBe('2026-01')
    expect(result.monthly.at(-1)!.asOf).toBe('2040-12')
    expect(result.monthly).toHaveLength(15 * 12) // 2026-01 .. 2040-12 inclusive

    for (let i = 1; i < result.monthly.length; i++) {
      const previous = result.monthly[i - 1]!.asOf
      const current = result.monthly[i]!.asOf
      expect(current > previous).toBe(true) // strictly increasing, no gaps in the sequence produced
    }
  })

  it('derives annual snapshots from the monthly result — one per year, at that year\'s last month', () => {
    expect(result.annual).toHaveLength(15)
    expect(result.annual.map((s) => s.asOf)).toEqual(Array.from({ length: 15 }, (_, i) => `${2026 + i}-12`))
  })

  it('computes net worth from FinancialState and shows a coherent story: growth while working, a travel-year drawdown', () => {
    const workingEnd = result.annual[6]! // 2032-12
    const travelEnd = result.annual[7]! // 2033-12
    expect(netWorth(workingEnd)).toBeGreaterThan(netWorth(initialState))
    expect(netWorth(travelEnd)).toBeLessThan(netWorth(workingEnd)) // zero income + elevated spending
  })

  it('the property-sale Event removes the property and its mortgage the month it fires', () => {
    const beforeSale = result.monthly.find((s) => s.asOf === '2034-05')!
    const afterSale = result.monthly.find((s) => s.asOf === '2034-06')!
    expect(beforeSale.assets.some((a) => a.id === 'home')).toBe(true)
    expect(beforeSale.liabilities.some((l) => l.id === 'mortgage-home')).toBe(true)
    expect(afterSale.assets.some((a) => a.id === 'home')).toBe(false)
    expect(afterSale.liabilities.some((l) => l.id === 'mortgage-home')).toBe(false)
  })

  it('the Whole Life withdrawal Event reduces cash value and increases cash in the same month', () => {
    const before = result.monthly.find((s) => s.asOf === '2038-02')!
    const after = result.monthly.find((s) => s.asOf === '2038-03')!
    const wlBefore = before.assets.find((a) => a.id === 'whole-life') as Extract<FinancialState['assets'][number], { kind: 'wholeLifeCashValue' }>
    const wlAfter = after.assets.find((a) => a.id === 'whole-life') as typeof wlBefore
    expect(wlAfter.cashValue).toBeLessThan(wlBefore.cashValue - 14000) // withdrew 15000, partially offset by growth
  })

  it('is deterministic: the same inputs produce the same result every time', () => {
    const again = calculate(initialState, fixtureTrajectory)
    expect(again).toEqual(result)
  })
})

describe('calculate — Input Generator seam', () => {
  it('swapping the parameterProvider changes the result without changing calculation semantics, and stays deterministic for a fixed provider', () => {
    const varyingReturn: ParameterProvider = (name, scenario, month) => {
      if (name !== 'expectedReturn') return scenario.parameters[name] ?? 0
      // deterministic but non-constant: alternates by month parity, not a random generator
      const monthNumber = Number(month.split('-')[1])
      return monthNumber % 2 === 0 ? 0.09 : 0.05
    }

    const constant = calculate(initialState, fixtureTrajectory)
    const varying = calculate(initialState, fixtureTrajectory, { parameterProvider: varyingReturn })
    const varyingAgain = calculate(initialState, fixtureTrajectory, { parameterProvider: varyingReturn })

    expect(netWorth(varying.annual.at(-1)!)).not.toBeCloseTo(netWorth(constant.annual.at(-1)!), 0)
    expect(varying).toEqual(varyingAgain) // same non-constant provider, run twice, same result
  })
})

describe('calculate — Whole Life policy loan (does not draw down cash value, unlike a withdrawal)', () => {
  it('increases cash and the loan balance, leaving cashValue growth untouched', () => {
    const loanScenario = scenario({
      name: 'Loan test',
      start: '2026-01',
      end: '2026-02',
      events: [{ id: 'evt-loan', name: 'Policy loan', timing: { kind: 'instantaneous', at: '2026-01' }, effect: { kind: 'wholeLifePolicyLoan', assetId: 'wl', amount: 5000 } }],
      parameters: { wholeLifeCreditingRate: 0.04, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0 },
    })
    const trajectory: Trajectory = { id: 't', name: 't', scenarios: [loanScenario] }
    const state: FinancialState = {
      asOf: '2026-01',
      assets: [
        { kind: 'cash', id: 'cash', name: 'Cash', balance: 1000 },
        { kind: 'wholeLifeCashValue', id: 'wl', name: 'Whole Life', cashValue: 50000, policyLoanBalance: 0 },
      ],
      liabilities: [],
    }

    const result = calculate(state, trajectory)
    const afterLoan = result.monthly[0]!
    const wl = afterLoan.assets.find((a) => a.id === 'wl') as Extract<FinancialState['assets'][number], { kind: 'wholeLifeCashValue' }>
    const cash = afterLoan.assets.find((a) => a.id === 'cash')!

    expect(wl.policyLoanBalance).toBe(5000)
    expect(wl.cashValue).toBeGreaterThan(50000) // still grew this month — the loan doesn't stop crediting
    expect((cash as { balance: number }).balance).toBe(1000 + 5000)
  })
})

describe('calculate — Trajectory invariant', () => {
  it('refuses a non-contiguous Trajectory', () => {
    const a = scenario({ name: 'A', start: '2026-01', end: '2026-06' })
    const b = scenario({ name: 'B', start: '2026-08', end: '2026-12' }) // gap
    const trajectory: Trajectory = { id: 't', name: 't', scenarios: [a, b] }
    expect(() => calculate(initialState, trajectory)).toThrow(TrajectoryInvariantError)
  })
})
