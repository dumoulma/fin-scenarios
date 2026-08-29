// docs/test-scenarios.md, Level 1 — Core mechanics (tests 01-10).
//
// Per docs/architecture.md's Testing Strategy: "tested through its public
// calculation interface rather than internal implementation functions." These
// tests call calculate() and inspect the resulting FinancialState sequence — they
// don't reach into engine internals.
import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState } from '../src/domain/types.ts'
import { calculate } from '../src/engine/calculate.ts'

describe('01. Empty trajectory preserves state', () => {
  it('leaves $100,000 cash unchanged after one month with no spending, events, or policies', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({ name: 'A', start: '2026-01', end: '2026-01', events: [], parameters: { spending: 0, taxRate: 0 }, policies: [] }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.monthly).toHaveLength(1)
    expect(netWorth(result.monthly[0]!)).toBe(100_000)
    expect(result.monthly[0]!.assets).toEqual(initialState.assets)
  })
})

describe('Spending is a Scenario Parameter', () => {
  it('reduces Financial State even when no Policy is present', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD',
      assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 1_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Spending without disposition rules', [
      createScenario({ name: 'One month', start: '2026-01', end: '2026-01', events: [], parameters: { spending: 250, taxRate: 0 }, policies: [] }),
    ])

    expect(calculate(initialState, trajectory).monthly[0]!.assets[0]!.value).toBe(750)
  })
})

describe('02. One equity asset grows', () => {
  it('compounds $100,000 equity at a fixed 12% annual return, monthly, over one year', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({ name: 'A', start: '2026-01', end: '2026-12', events: [], parameters: { spending: 0, taxRate: 0, equityReturn: 0.12 }, policies: [] }),
    ])

    const result = calculate(initialState, trajectory)

    const expected = 100_000 * (1 + 0.12 / 12) ** 12
    expect(netWorth(result.monthly.at(-1)!)).toBeCloseTo(expected, 6)
    // deterministic, monthly convention — every month compounds by the same factor
    expect(netWorth(result.monthly[0]!)).toBeCloseTo(100_000 * (1 + 0.12 / 12), 6)
  })
})

describe('03. Cash earns interest', () => {
  it('compounds $100,000 cash at a fixed 4% annual rate, monthly, over one year', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({ name: 'A', start: '2026-01', end: '2026-12', events: [], parameters: { spending: 0, taxRate: 0, cashApy: 0.04 }, policies: [] }),
    ])

    const result = calculate(initialState, trajectory)

    const expected = 100_000 * (1 + 0.04 / 12) ** 12
    expect(netWorth(result.monthly.at(-1)!)).toBeCloseTo(expected, 6)
  })
})

describe('04. Equity distribution creates cash inflow', () => {
  it('generates $4,000 of cash over the year from a 4% distribution, leaving the $100,000 principal untouched (0% growth), landing in Cash not Equity', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 },
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        events: [],
        parameters: { spending: 0, taxRate: 0, equityReturn: 0, equityDistributionRate: 0.04 },
        policies: [], // no policy claims the surplus — it defaults to Cash
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(100_000, 6) // 0% growth, unchanged
    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(4_000, 6) // distribution, not reinvested
  })
})

describe('05. Positive cash flow is invested', () => {
  it('transfers the $2,000/month surplus into Equity; Cash does not accumulate it', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        // a simple recurring income Event — the same mechanism Level 2 names
        // "Employment," used generically here since Level 1 doesn't need the
        // start/end pairing, only that income recurs while the Scenario is active
        events: [{ id: 'evt-income', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }],
        parameters: { spending: 8_000, taxRate: 0, cashApy: 0, equityReturn: 0 },
        policies: [
          { id: 'pol-invest', kind: 'investSurplus', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(100_000, 6) // unchanged
    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(2_000, 6)
  })
})

describe('06. Positive cash flow accumulates in cash', () => {
  it('the same setup as 05, but with no invest policy, leaves the $2,000 surplus in Cash', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        events: [{ id: 'evt-income', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }],
        parameters: { spending: 8_000, taxRate: 0, cashApy: 0, equityReturn: 0 },
        policies: [],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(102_000, 6)
    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(0, 6)
  })
})

describe('07. Negative cash flow is funded by selling an asset', () => {
  it('converts $3,000/month of Equity to Cash to cover the deficit, remaining solvent', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        events: [{ id: 'evt-income', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 60_000 } }], // $5,000/mo
        parameters: { spending: 8_000, taxRate: 0, equityReturn: 0 },
        policies: [
          { id: 'pol-sell', kind: 'fundDeficitFromEquitySale', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(97_000, 6)
    expect(netWorth(final)).toBeCloseTo(97_000, 6) // solvent — no negative cash, no debt
  })
})

describe('08. Negative cash flow increases debt', () => {
  it('draws Cash down to $0, then borrows for subsequent deficits', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 10_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({
        name: 'A',
        start: '2026-01',
        end: '2026-04', // 2 months draining cash, 2 months needing debt
        events: [],
        parameters: { spending: 5_000, taxRate: 0, cashApy: 0 },
        policies: [
          { id: 'pol-cash', kind: 'fundDeficitFromCash', priority: 2 },
          { id: 'pol-debt', kind: 'fundDeficitFromDebt', priority: 3 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.monthly[0]!.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(5_000, 6)
    expect(result.monthly[1]!.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(0, 6)
    expect(result.monthly[1]!.liabilities).toHaveLength(0) // cash still covered it

    const final = result.monthly.at(-1)!
    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(0, 6) // floor
    expect(final.liabilities.find((l) => l.kind === 'other')!.balance).toBeCloseTo(10_000, 6) // 2 months of $5k deficit
  })
})

describe('09. One-time income Event', () => {
  it('increases Financial State by exactly $50,000 at the inheritance tick, and holds afterward', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        events: [{ id: 'evt-inheritance', at: '2026-06', effect: { kind: 'oneTimeCashFlow', amount: 50_000 } }],
        parameters: { spending: 0, taxRate: 0, cashApy: 0 },
        policies: [],
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(netWorth(result.monthly[4]!)).toBeCloseTo(100_000, 6) // May — before the Event
    expect(netWorth(result.monthly[5]!)).toBeCloseTo(150_000, 6) // June — the Event's tick
    expect(netWorth(result.monthly.at(-1)!)).toBeCloseTo(150_000, 6) // holds afterward
  })
})

describe('10. One-time spending embedded in a Scenario', () => {
  it('leaves the $5,000/month Scenario spending unchanged and applies the extra $20,000 only in its own month', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      createScenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        events: [{ id: 'evt-travel', at: '2026-06', effect: { kind: 'oneTimeCashFlow', amount: -20_000 } }],
        parameters: { spending: 5_000, taxRate: 0, cashApy: 0 },
        policies: [],
      }),
    ])

    const result = calculate(initialState, trajectory)

    // every month drops by exactly 5,000 from ordinary spending...
    expect(netWorth(result.monthly[0]!)).toBeCloseTo(95_000, 6)
    expect(netWorth(result.monthly[3]!)).toBeCloseTo(100_000 - 4 * 5_000, 6)
    // ...except June, which also takes the extra $20,000
    expect(netWorth(result.monthly[5]!)).toBeCloseTo(100_000 - 6 * 5_000 - 20_000, 6)
    // and July resumes the ordinary $5,000/month rate, not a permanently changed one
    expect(netWorth(result.monthly[5]!) - netWorth(result.monthly[6]!)).toBeCloseTo(5_000, 6)
  })
})
