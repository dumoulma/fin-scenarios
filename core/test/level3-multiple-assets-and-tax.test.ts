// docs/test-scenarios.md, Level 3 — Multiple assets, wrappers, and flows (19-25).
import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Scenario } from '../src/domain/types.ts'
import { calculate } from '../src/engine/calculate.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ events: [], parameters: { spending: 0, taxRate: 0 }, policies: [], ...overrides })
}

describe('19. Equity and Fixed Income grow independently', () => {
  it('each Asset Type applies its own behavior and the combined state reflects both', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'eq', name: 'US Equity', assetType: 'equity', holdingContext: 'none', value: 100_000 },
        { id: 'bond', name: 'Bonds', assetType: 'fixedIncome', holdingContext: 'none', value: 100_000 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 0, taxRate: 0, equityReturn: 0.08, fixedIncomeReturn: 0.04 } })])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(100_000 * (1 + 0.08 / 12) ** 12, 6)
    expect(final.assets.find((a) => a.assetType === 'fixedIncome')!.value).toBeCloseTo(100_000 * (1 + 0.04 / 12) ** 12, 6)
  })
})

describe('20. Two Equity positions with different behavior', () => {
  it('positions evolve independently and produce different cash inflows despite sharing the Equity Asset Type', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'sp500', name: 'S&P 500', assetType: 'equity', holdingContext: 'none', value: 100_000, growthRate: 0.08, distributionRate: 0.015 },
        { id: 'div', name: 'High-dividend', assetType: 'equity', holdingContext: 'none', value: 100_000, growthRate: 0.05, distributionRate: 0.04 },
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 0, taxRate: 0 } })])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    expect(final.assets.find((a) => a.id === 'sp500')!.value).toBeCloseTo(100_000 * (1 + 0.08 / 12) ** 12, 6)
    expect(final.assets.find((a) => a.id === 'div')!.value).toBeCloseTo(100_000 * (1 + 0.05 / 12) ** 12, 6)

    // Distributions from both accumulate in cash (no invest policy), each at its own
    // rate — computed monthly off that month's (compounding) value, per the engine's
    // stated convention, not a flat principal * annual-rate shortcut.
    function totalDistribution(principal: number, growthRate: number, distributionRate: number): number {
      let value = principal
      let total = 0
      for (let month = 0; month < 12; month++) {
        total += value * (distributionRate / 12)
        value *= 1 + growthRate / 12
      }
      return total
    }
    const expectedCash = totalDistribution(100_000, 0.08, 0.015) + totalDistribution(100_000, 0.05, 0.04)
    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(expectedCash, 6)
  })
})

describe('21. Tax wrappers do not change growth behavior', () => {
  it('identical Equity positions grow identically regardless of holdingContext', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'taxable', name: 'Taxable', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 100_000 },
        { id: '401k', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', value: 100_000 },
        { id: 'roth', name: 'Roth', assetType: 'equity', holdingContext: 'rothRetirement', value: 100_000 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 0, taxRate: 0, equityReturn: 0.08 } })])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    const values = final.assets.map((a) => a.value)
    expect(values[0]).toBeCloseTo(values[1]!, 6)
    expect(values[1]).toBeCloseTo(values[2]!, 6)
  })
})

describe('22. Taxable distribution', () => {
  it('a 20% tax removes $800 of the $4,000 gross distribution, leaving $3,200 available', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'eq', name: 'Taxable Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 100_000, growthRate: 0, distributionRate: 0.04 },
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 0, taxRate: 0.2 } })])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(3_200, 2)
  })
})

describe('23. Roth distribution is not taxed', () => {
  it('the same distribution held in a Roth container is untaxed — full $4,000 available', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'eq', name: 'Roth Equity', assetType: 'equity', holdingContext: 'rothRetirement', value: 100_000, growthRate: 0, distributionRate: 0.04 },
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 0, taxRate: 0.2 } })])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(4_000, 2)
  })
})

describe('24. Tax on employment income', () => {
  it('$10,000/mo gross taxed at 30% leaves $7,000/mo after tax, $2,000/mo surplus after $5,000 spending', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 0 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        events: [{ id: 'evt', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }],
        parameters: { spending: 5_000, taxRate: 0.3 },
        policies: [{ id: 'p', kind: 'spending', priority: 1 }],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(2_000, 6)
  })
})

describe('25. Mixed income sources are summed', () => {
  it('combines salary, interest, dividends, and a one-time gift correctly, taxing only salary and dividends', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 100_000 }, // -> $500/mo interest @ 6% APY
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', value: 100_000, growthRate: 0, distributionRate: 0.036 }, // -> $300/mo dividend
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        events: [
          { id: 'evt-salary', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }, // -> $10,000/mo
          { id: 'evt-gift', at: '2026-01', effect: { kind: 'oneTimeCashFlow', amount: 20_000 } },
        ],
        parameters: { spending: 5_000, taxRate: 0.25, cashApy: 0.06 },
        policies: [{ id: 'p', kind: 'spending', priority: 1 }],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    // Point Events apply before this tick's Asset behavior (docs/architecture.md's
    // step order), so the $20,000 gift is already in Cash by the time interest is
    // computed — interest accrues on $120,000, not $100,000. That's the engine's
    // stated convention, not an approximation in this test.
    const cashAfterGift = 100_000 + 20_000
    const interest = cashAfterGift * (0.06 / 12)
    const dividend = 100_000 * (0.036 / 12)
    const salary = 120_000 / 12
    const taxableIncome = salary + dividend // interest and the gift are never taxed
    const tax = taxableIncome * 0.25
    const surplus = salary + dividend - tax - 5_000
    const expectedCash = cashAfterGift + interest + surplus

    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(expectedCash, 6)
    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(100_000, 6) // 0% growth, dividend paid out not reinvested
  })

  it('the gift does not recur into a second month', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 0 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-02',
        events: [{ id: 'evt-gift', at: '2026-01', effect: { kind: 'oneTimeCashFlow', amount: 20_000 } }],
        parameters: { spending: 0, taxRate: 0 },
        policies: [],
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.monthly[0]!.assets[0]!.value).toBe(20_000)
    expect(result.monthly[1]!.assets[0]!.value).toBe(20_000) // unchanged — not treated as recurring
  })
})
