// docs/test-scenarios.md, Level 2 — Events and Scenario boundaries (tests 11-18).
import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory, resizeScenario } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Scenario } from '../src/domain/types.ts'
import { calculate } from '../src/engine/calculate.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ events: [], parameters: { spending: 0, taxRate: 0 }, policies: [], ...overrides })
}

describe('11. Employment starts and generates monthly income', () => {
  it('generates monthly income while active; surplus is invested', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        events: [{ id: 'evt-employment', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }],
        parameters: { spending: 5_000, taxRate: 0, equityReturn: 0 },
        policies: [
          { id: 'pol-invest', kind: 'investSurplus', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    // $10,000/mo salary - $5,000/mo spending = $5,000/mo surplus, invested every month
    for (let i = 0; i < 12; i++) {
      expect(result.monthly[i]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(5_000 * (i + 1), 6)
      expect(result.monthly[i]!.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(100_000, 6)
    }
  })
})

describe('12. Employment ends', () => {
  it('generates salary for months 1-6 and none for months 7-12', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        events: [
          { id: 'evt-start', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } },
          { id: 'evt-end', at: '2026-07', effect: { kind: 'employmentEnd' } },
        ],
        parameters: { spending: 0, taxRate: 0 },
        policies: [],
      }),
    ])

    const result = calculate(initialState, trajectory)

    // $10,000/mo while active, accumulating in cash (no spending, no policy needed)
    for (let i = 0; i < 6; i++) {
      expect(netWorth(result.monthly[i]!)).toBeCloseTo(10_000 * (i + 1), 6)
    }
    const afterEmployment = netWorth(result.monthly[5]!)
    for (let i = 6; i < 12; i++) {
      expect(netWorth(result.monthly[i]!)).toBeCloseTo(afterEmployment, 6)
    }
  })
})

describe('13. One Scenario becomes two contiguous Scenarios', () => {
  it("June's ending Financial State feeds July's calculation with no gap or duplicated month", () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Two scenarios', [
      scenario({
        name: 'Employed',
        start: '2026-01',
        end: '2026-06',
        events: [{ id: 'evt-employment', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }],
        parameters: { spending: 5_000, taxRate: 0 },
        policies: [],
      }),
      scenario({
        name: 'Unemployed',
        start: '2026-07',
        end: '2026-12',
        parameters: { spending: 5_000, taxRate: 0 },
        policies: [
          { id: 'pol-cash', kind: 'fundDeficitFromCash', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.monthly).toHaveLength(12)
    expect(new Set(result.monthly.map((s) => s.asOf)).size).toBe(12) // every month appears exactly once

    const juneEnd = netWorth(result.monthly[5]!)
    // Employment scenario nets $5,000/mo surplus; June ends at 100,000 + 6*5,000
    expect(juneEnd).toBeCloseTo(130_000, 6)
    // July has no income and the same $5,000 spending, funded from cash — a
    // continuation of June's ending balance, not a reset or a skipped month
    expect(netWorth(result.monthly[6]!)).toBeCloseTo(juneEnd - 5_000, 6)
  })
})

describe('14. Scenario spending changes at a boundary', () => {
  it('spending changes exactly at the Scenario boundary, no special Event required', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Two scenarios', [
      scenario({ name: 'A', start: '2026-01', end: '2026-06', parameters: { spending: 6_000, taxRate: 0 }, policies: [] }),
      scenario({ name: 'B', start: '2026-07', end: '2026-12', parameters: { spending: 9_000, taxRate: 0 }, policies: [] }),
    ])

    const result = calculate(initialState, trajectory)

    const dropMonth6 = netWorth(result.monthly[4]!) - netWorth(result.monthly[5]!)
    const dropMonth7 = netWorth(result.monthly[5]!) - netWorth(result.monthly[6]!)
    expect(dropMonth6).toBeCloseTo(6_000, 6)
    expect(dropMonth7).toBeCloseTo(9_000, 6) // changes right at the boundary
  })
})

describe('15. Scenario Policy changes at a boundary', () => {
  it('the same income/spending produce different Financial State trajectories once the Policy changes', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 },
      ],
      liabilities: [],
    }
    const income = { id: 'evt-employment', at: '2026-01', effect: { kind: 'employmentStart' as const, annualSalary: 120_000 } }
    const trajectory = createTrajectory('Two scenarios', [
      scenario({
        name: 'Invest',
        start: '2026-01',
        end: '2026-06',
        events: [income],
        parameters: { spending: 5_000, taxRate: 0, equityReturn: 0 },
        policies: [
          { id: 'p2', kind: 'investSurplus', priority: 2 },
        ],
      }),
      scenario({
        name: 'Hold cash',
        start: '2026-07',
        end: '2026-12',
        parameters: { spending: 5_000, taxRate: 0 },
        policies: [], // surplus defaults to Cash — no investSurplus
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.monthly[5]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(30_000, 6) // 6mo * $5k invested
    expect(result.monthly[5]!.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(0, 6)
    // after the boundary: employment ended with the Scenario (no employmentStart in B) too,
    // but the point of this test is the Policy — surplus/deficit now defaults to Cash
    expect(result.monthly.at(-1)!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(30_000, 6) // untouched
  })
})

describe('16. Scenario economic parameters change', () => {
  it("each tick uses the parameters belonging to its own Scenario", () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Two scenarios', [
      scenario({ name: 'A', start: '2026-01', end: '2026-06', parameters: { spending: 0, taxRate: 0, equityReturn: 0.06, inflation: 0.02 } }),
      scenario({ name: 'B', start: '2026-07', end: '2026-12', parameters: { spending: 0, taxRate: 0, equityReturn: 0.12, inflation: 0.03 } }),
    ])

    const result = calculate(initialState, trajectory)

    const juneValue = result.monthly[5]!.assets[0]!.value
    const julyGrowth = result.monthly[6]!.assets[0]!.value / juneValue - 1
    const mayGrowth = result.monthly[4]!.assets[0]!.value / result.monthly[3]!.assets[0]!.value - 1

    expect(mayGrowth).toBeCloseTo(0.06 / 12, 6) // Scenario A's rate
    expect(julyGrowth).toBeCloseTo(0.12 / 12, 6) // Scenario B's rate, applied immediately at the boundary
  })
})

describe('17. Scenario duration changes and neighbors move', () => {
  // The doc hedges: "the trajectory end moves accordingly if C's duration is
  // preserved" — this engine deliberately chose the other reading (a documented
  // decision from the Scenario/Trajectory prototype work): resize is a
  // boundary-drag between two adjacent cards, not a cascade. Only C's *start*
  // moves; its *end* stays fixed, so its own duration is what absorbs the change,
  // and the trajectory's overall end does not move. Extending B eats into C, it
  // doesn't push the whole trajectory later.
  it("extending B by three months pushes C's start back by three months, shrinking C's own duration; the trajectory end does not move", () => {
    const trajectory = createTrajectory('Three scenarios', [
      scenario({ name: 'A', start: '2026-01', end: '2026-06' }),
      scenario({ name: 'B', start: '2026-07', end: '2026-12' }),
      scenario({ name: 'C', start: '2027-01', end: '2027-06' }),
    ])

    const updated = resizeScenario(trajectory, trajectory.scenarios[1]!.id, 9) // 6 -> 9 months

    expect(updated.scenarios[0]!).toEqual(trajectory.scenarios[0]!) // A untouched
    expect(updated.scenarios[1]!.end).toBe('2027-03')
    expect(updated.scenarios[2]!.start).toBe('2027-04') // C pushed back 3 months
    expect(updated.scenarios[2]!.end).toBe('2027-06') // C's own end is unchanged...
    expect(updated.scenarios[2]!.end).toBe(trajectory.scenarios[2]!.end) // ...so the trajectory end doesn't move
  })
})

describe('18. A trajectory may end at an arbitrary date', () => {
  it('calculation stops exactly at the final Scenario\'s end — no artificial terminal date', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2031-10' })])

    const result = calculate(initialState, trajectory)

    expect(result.monthly.at(-1)!.asOf).toBe('2031-10')
    expect(result.monthly).toHaveLength(70) // 2026-01 .. 2031-10 inclusive, not padded to year-end
  })
})
