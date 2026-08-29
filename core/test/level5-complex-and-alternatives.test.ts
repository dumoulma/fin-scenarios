// docs/test-scenarios.md, Level 5 — Complex trajectories and alternative planning
// (tests 36-50).
import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory, duplicateTrajectory, modifyScenario, replaceScenario } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Scenario } from '../src/domain/types.ts'
import { calculate, type ParameterProvider } from '../src/engine/calculate.ts'
import { runMonteCarlo } from '../src/engine/monteCarlo.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ events: [], parameters: { spending: 0, taxRate: 0 }, policies: [], ...overrides })
}

describe('36. Three-scenario life trajectory', () => {
  it('produces one continuous Financial State history across work, travel, and retirement with no special handling', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 50_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Life', [
      scenario({
        name: 'Work in USA',
        start: '2026-01',
        end: '2035-12', // 10 years, "age 48-58"
        events: [{ id: 'evt-job', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 150_000 } }],
        parameters: { spending: 6_000, taxRate: 0.2 },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
        ],
      }),
      scenario({
        name: 'Travel',
        start: '2036-01',
        end: '2036-12', // "age 58-59"
        parameters: { spending: 15_000, taxRate: 0 },
        policies: [{ id: 'p1', kind: 'spending', priority: 1 }, { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 }],
      }),
      scenario({
        name: 'Retirement in Japan',
        start: '2037-01',
        end: '2040-12', // "age 59-63"
        events: [{ id: 'evt-ss', at: '2037-01', effect: { kind: 'employmentStart', annualSalary: 30_000 } }], // Social Security stand-in
        parameters: { spending: 5_000, taxRate: 0.1 },
        policies: [{ id: 'p1', kind: 'spending', priority: 1 }, { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 }],
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.monthly).toHaveLength(15 * 12) // 2026-01 .. 2040-12
    expect(new Set(result.monthly.map((s) => s.asOf)).size).toBe(15 * 12) // every month exactly once, contiguous
    expect(result.monthly.every((s) => Number.isFinite(netWorth(s)))).toBe(true) // no NaN/undefined leaking through boundaries
  })
})

describe('37. Scenario starts with a major Event', () => {
  it('executes the property sale and moving cost at the Scenario boundary tick, then calculates B from the result', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 0 },
        { id: 'condo', name: 'Condo', assetType: 'realEstate', holdingContext: 'none', value: 500_000 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 200_000, linkedAssetId: 'condo' }],
    }
    const trajectory = createTrajectory('Move', [
      scenario({ name: 'Before', start: '2026-01', end: '2026-06', parameters: { spending: 0, taxRate: 0 } }),
      scenario({
        name: 'After the move',
        start: '2026-07',
        end: '2026-12',
        events: [
          { id: 'evt-sell', at: '2026-07', effect: { kind: 'sellProperty', assetId: 'condo' } },
          { id: 'evt-move-cost', at: '2026-07', effect: { kind: 'oneTimeCashFlow', amount: -10_000 } },
        ],
        parameters: { spending: 4_000, taxRate: 0 },
        policies: [{ id: 'p', kind: 'spending', priority: 1 }, { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 }],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const boundaryTick = result.monthly[6]! // July

    expect(boundaryTick.assets.some((a) => a.id === 'condo')).toBe(false)
    expect(boundaryTick.liabilities).toHaveLength(0)
    // 500,000 sale - 200,000 payoff - 10,000 moving cost - 4,000 spending
    expect(netWorth(boundaryTick)).toBeCloseTo(500_000 - 200_000 - 10_000 - 4_000, 6)
  })
})

describe('38. Employment + property + investment portfolio', () => {
  it('combines property appreciation, mortgage amortization, taxable/Roth equity, employment, taxes, and an invest Policy into one coherent sequence', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 20_000 },
        { id: 'home', name: 'Home', assetType: 'realEstate', holdingContext: 'none', value: 500_000 },
        { id: 'taxable', name: 'Taxable Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 50_000, growthRate: 0.07, distributionRate: 0.015 },
        { id: 'roth', name: 'Roth Equity', assetType: 'equity', holdingContext: 'rothRetirement', value: 30_000, growthRate: 0.07, distributionRate: 0 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 350_000, interestRate: 0.06, monthlyPayment: 2_100, linkedAssetId: 'home' }],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        events: [{ id: 'evt-job', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 140_000 } }],
        parameters: { spending: 6_000, taxRate: 0.22, propertyAppreciation: 0.03 },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'investSurplus', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    // every independent behavior actually moved, and nothing produced NaN/undefined
    expect(final.assets.find((a) => a.id === 'home')!.value).toBeGreaterThan(500_000)
    expect(final.liabilities[0]!.balance).toBeLessThan(350_000)
    expect(final.assets.find((a) => a.id === 'taxable')!.value).toBeGreaterThan(50_000)
    expect(final.assets.find((a) => a.id === 'roth')!.value).toBeGreaterThan(30_000)
    expect(Number.isFinite(netWorth(final))).toBe(true)
  })
})

describe('39. Large spending Event while accumulating', () => {
  it('funds a temporary $75,000 deficit per Policy priority, then resumes normal accumulation', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 30_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 0, growthRate: 0 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2029-12', // 4 years — car purchase lands in "year 4"
        events: [
          { id: 'evt-job', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 96_000 } }, // $8,000/mo
          { id: 'evt-car', at: '2029-06', effect: { kind: 'oneTimeCashFlow', amount: -75_000 } },
        ],
        parameters: { spending: 3_000, taxRate: 0 }, // $5,000/mo surplus normally
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'investSurplus', priority: 2 },
          { id: 'p3', kind: 'fundDeficitFromCash', priority: 3 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    const beforeCar = result.monthly[40]! // 2029-05
    const carMonth = result.monthly[41]! // 2029-06
    const later = result.monthly[42]! // 2029-07

    expect(netWorth(carMonth)).toBeLessThan(netWorth(beforeCar)) // the car event creates a real dent
    // normal accumulation resumes immediately afterward — same $5,000/mo surplus rate
    expect(netWorth(later) - netWorth(carMonth)).toBeCloseTo(5_000, 6)
  })
})

describe('40. Long travel Scenario with zero income', () => {
  it('declines predictably by the drawdown Policy funding the monthly deficit', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 200_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'Travel',
        start: '2026-01',
        end: '2026-12',
        parameters: { spending: 12_000, taxRate: 0, cashApy: 0 },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    for (let i = 0; i < 12; i++) {
      expect(netWorth(result.monthly[i]!)).toBeCloseTo(200_000 - 12_000 * (i + 1), 6)
    }
  })
})

describe('41. Gift plus investment income plus spending', () => {
  it('aggregates dividends, interest, salary, and a one-time gift correctly, investing the surplus', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 50_000 }, // interest source
        { id: 'div-eq', name: 'Dividend Equity', assetType: 'equity', holdingContext: 'none', value: 100_000, growthRate: 0, distributionRate: 0.036 }, // $300/mo
        { id: 'brokerage', name: 'Brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 0, growthRate: 0 }, // investSurplus target
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        events: [
          { id: 'evt-salary', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }, // $10,000/mo
          { id: 'evt-gift', at: '2026-01', effect: { kind: 'oneTimeCashFlow', amount: 100_000 } },
        ],
        parameters: { spending: 4_000, taxRate: 0, cashApy: 0.12 }, // -> $500/mo interest on the pre-gift $50,000 base... see note below
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'investSurplus', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    // Cash itself: starting 50,000 + gift 100,000, then this tick's interest accrues
    // on that post-gift balance (Events apply before Asset behavior) — the gift
    // never leaves Cash (only the dividend/salary surplus gets invested).
    const cashAfterGift = 50_000 + 100_000
    const interest = cashAfterGift * (0.12 / 12)
    expect(final.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(cashAfterGift + interest, 6)

    // dividend (300) + salary (10,000) - spending (4,000) = 6,300 invested
    expect(final.assets.find((a) => a.id === 'brokerage')!.value).toBeCloseTo(300 + 10_000 - 4_000, 6)
  })
})

describe('42. Copying a Scenario preserves its behavior', () => {
  it('duplicates Events/Policies/Parameters unchanged, and a subsequent spending-only change leaves everything else intact', () => {
    const original = scenario({
      name: 'Working',
      start: '2026-01',
      end: '2026-12',
      events: [{ id: 'evt', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 100_000 } }],
      parameters: { spending: 5_000, taxRate: 0.2, equityReturn: 0.07 },
      policies: [{ id: 'p', kind: 'investSurplus', priority: 1 }],
    })

    const changed = modifyScenario(original, { parameters: { ...original.parameters, spending: 7_000 } })

    expect(changed.id).not.toBe(original.id) // a real, independent copy
    expect(changed.events).toEqual(original.events)
    expect(changed.policies).toEqual(original.policies)
    expect(changed.parameters.taxRate).toBe(original.parameters.taxRate)
    expect(changed.parameters.equityReturn).toBe(original.parameters.equityReturn)
    expect(changed.parameters.spending).toBe(7_000) // only the intended change took effect
    expect(original.parameters.spending).toBe(5_000) // the original is untouched
  })
})

describe('43. Alternative Trajectory diverges from Master', () => {
  it('shares the Initial State and unchanged preceding Scenarios, diverging only where the copied Scenario was changed', () => {
    const master = createTrajectory('Master', [
      scenario({ name: 'Working', start: '2026-01', end: '2038-12' }),
      scenario({ name: 'Retire at 63', start: '2039-01', end: '2050-12', parameters: { spending: 6_000, taxRate: 0 } }),
    ])

    const alternative = duplicateTrajectory(master, 'Work to 65')
    const retirementScenario = alternative.scenarios[1]!
    const extendedWork = modifyScenario(alternative.scenarios[0]!, { end: '2040-12' })
    // Replacing "Working" with a longer version and "Retire at 63" with a shorter
    // retirement, keeping everything else about each Scenario the same
    const withLongerWork = replaceScenario(alternative, alternative.scenarios[0]!.id, extendedWork)
    const final = replaceScenario(withLongerWork, retirementScenario.id, modifyScenario(retirementScenario, { start: '2041-01' }))

    expect(final.scenarios[0]!.end).toBe('2040-12') // diverged
    expect(master.scenarios[0]!.end).toBe('2038-12') // Master untouched
    expect(final.scenarios[1]!.parameters).toEqual(master.scenarios[1]!.parameters) // unchanged aspects preserved
  })
})

describe('44. Arbitrary trajectory comparison', () => {
  it('produces the same raw CalculationResult shape for materially different Trajectories', () => {
    const initialState: FinancialState = { asOf: '2026-01', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 100_000 }], liabilities: [] }

    const spendPolicy = [{ id: 'p', kind: 'spending' as const, priority: 1 }]
    const retireAt60 = createTrajectory('Retire at 60 in USA', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 5_000, taxRate: 0 }, policies: spendPolicy })])
    const travelThenJapan = createTrajectory('Travel then Japan', [
      scenario({ name: 'Travel', start: '2026-01', end: '2026-06', parameters: { spending: 8_000, taxRate: 0 }, policies: spendPolicy }),
      scenario({ name: 'Japan', start: '2026-07', end: '2026-12', parameters: { spending: 3_000, taxRate: 0 }, policies: spendPolicy }),
    ])
    const workTo65 = createTrajectory('Work to 65', [
      scenario({ name: 'A', start: '2026-01', end: '2026-12', events: [{ id: 'e', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 100_000 } }], parameters: { spending: 5_000, taxRate: 0.2 }, policies: spendPolicy }),
    ])

    const results = [retireAt60, travelThenJapan, workTo65].map((t) => calculate(initialState, t))

    for (const result of results) {
      expect(result).toHaveProperty('monthly')
      expect(result).toHaveProperty('annual')
      expect(result.monthly).toHaveLength(12)
      expect(result.annual).toHaveLength(1)
      expect(Number.isFinite(netWorth(result.annual[0]!))).toBe(true)
    }
    // and they're meaningfully different, not just structurally identical
    const netWorths = results.map((r) => netWorth(r.annual[0]!))
    expect(new Set(netWorths.map((n) => n.toFixed(2))).size).toBe(3)
  })
})

describe('45. Same trajectory, changed economic parameters', () => {
  it('keeps the event/scenario structure identical while producing a different resulting Financial State', () => {
    const initialState: FinancialState = { asOf: '2026-01', assets: [{ id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', value: 100_000 }], liabilities: [] }
    const conservative = createTrajectory('Conservative', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 0, taxRate: 0, equityReturn: 0.05, inflation: 0.02 } })])

    const aggressive = duplicateTrajectory(conservative, 'Aggressive')
    const changed = replaceScenario(aggressive, aggressive.scenarios[0]!.id, modifyScenario(aggressive.scenarios[0]!, { parameters: { spending: 0, taxRate: 0, equityReturn: 0.12, inflation: 0.02 } }))

    expect(changed.scenarios[0]!.events).toEqual(conservative.scenarios[0]!.events)
    expect(changed.scenarios.length).toBe(conservative.scenarios.length)

    const conservativeResult = calculate(initialState, conservative)
    const aggressiveResult = calculate(initialState, changed)
    expect(netWorth(aggressiveResult.annual[0]!)).toBeGreaterThan(netWorth(conservativeResult.annual[0]!))
  })
})

describe('46. Deterministic repeatability', () => {
  it('is value-for-value equivalent across two runs of the same Initial State, Trajectory, and Parameters', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 50_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 100_000 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2027-12',
        events: [{ id: 'e', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 100_000 } }],
        parameters: { spending: 5_000, taxRate: 0.2, equityReturn: 0.07, cashApy: 0.02 },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'investSurplus', priority: 2 },
        ],
      }),
    ])

    const first = calculate(initialState, trajectory)
    const second = calculate(initialState, trajectory)
    expect(first).toEqual(second)
  })
})

describe('47. Monte Carlo preserves domain inputs', () => {
  it('uses the same Trajectory and Initial State while an Input Generator supplies different equity returns per run', () => {
    const initialState: FinancialState = { asOf: '2026-01', assets: [{ id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', value: 100_000 }], liabilities: [] }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2026-12', parameters: { spending: 0, taxRate: 0 } })])

    // a trivial "generator": a fixed sequence per call index, standing in for a real
    // distribution — the point is the seam, not the statistics (that's test 48)
    function makeGenerator(fixedReturn: number): ParameterProvider {
      return (name, s) => (name === 'equityReturn' ? fixedReturn : s.parameters[name] ?? 0)
    }

    const runReturns = [0.02, 0.08, 0.15]
    const results = runReturns.map((r) => calculate(initialState, trajectory, { parameterProvider: makeGenerator(r) }))

    // same domain Trajectory/Initial State every time — only the generated input differs
    const netWorths = results.map((r) => netWorth(r.annual[0]!))
    expect(netWorths[0]!).toBeLessThan(netWorths[1]!)
    expect(netWorths[1]!).toBeLessThan(netWorths[2]!)
    for (const result of results) {
      expect(result.monthly).toHaveLength(12) // same structure regardless of the generated input
    }
  })
})

describe('48. Monte Carlo produces an outcome distribution', () => {
  it('runs many simulations, each retaining the Financial-State-by-time shape, aggregated into median/mean/stdDev', () => {
    const initialState: FinancialState = { asOf: '2026-01', assets: [{ id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', value: 100_000 }], liabilities: [] }
    const trajectory = createTrajectory('Solo', [scenario({ name: 'A', start: '2026-01', end: '2035-12', parameters: { spending: 0, taxRate: 0 } })])

    // deterministic "randomness" for a reproducible test — a fixed sequence of
    // varying annual returns fed in per run, not a call to Math.random()
    const fixedReturnsByRun = [0.02, 0.05, 0.08, 0.11, 0.14, -0.03, 0.2, 0.06, 0.09, 0.01]
    const generateParameterProvider = (runIndex: number): ParameterProvider => (name, s) => (name === 'equityReturn' ? fixedReturnsByRun[runIndex % fixedReturnsByRun.length]! : s.parameters[name] ?? 0)

    const outcome = runMonteCarlo(initialState, trajectory, generateParameterProvider, fixedReturnsByRun.length)

    expect(outcome.results).toHaveLength(fixedReturnsByRun.length)
    for (const result of outcome.results) {
      expect(result.monthly).toHaveLength(10 * 12) // same Financial-State-by-time shape every run
    }
    expect(outcome.finalNetWorths).toHaveLength(fixedReturnsByRun.length)
    expect(outcome.median).toBeGreaterThan(0)
    expect(outcome.mean).toBeGreaterThan(0)
    expect(outcome.stdDev).toBeGreaterThan(0) // returns varied, so outcomes vary
  })
})

describe('49. Complex realistic trajectory', () => {
  it('produces a continuous monthly history across employment, property, a move, a travel year, and retirement with no special cases', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 40_000 },
        { id: 'home', name: 'Home', assetType: 'realEstate', holdingContext: 'none', value: 550_000 },
        { id: 'taxable', name: 'Taxable Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 80_000, growthRate: 0.07, distributionRate: 0.015 },
        { id: '401k', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', value: 150_000, growthRate: 0.07 },
        { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', value: 60_000 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 320_000, interestRate: 0.06, monthlyPayment: 2_000, linkedAssetId: 'home' }],
    }
    const commonWl = { wholeLifeCreditingRate: 0.04, wholeLifeDividendRate: 0.015, wholeLifePolicyFee: 20, traditionalRetirementAnnualLimit: 23_000 }

    const trajectory = createTrajectory('Realistic life', [
      scenario({
        name: 'Working, owns home',
        start: '2026-01',
        end: '2030-12',
        events: [
          { id: 'evt-job', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 180_000 } },
          { id: 'evt-trip', at: '2028-06', effect: { kind: 'oneTimeCashFlow', amount: -25_000 } }, // a big trip
        ],
        parameters: { spending: 7_000, taxRate: 0.24, propertyAppreciation: 0.03, ...commonWl },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'contributeUpToLimit', priority: 2, targetHoldingContext: 'traditionalRetirement' },
          { id: 'p3', kind: 'investSurplus', priority: 3 },
        ],
      }),
      scenario({
        name: 'Move (sell, rent)',
        start: '2031-01',
        end: '2031-12',
        events: [
          { id: 'evt-sell', at: '2031-01', effect: { kind: 'sellProperty', assetId: 'home' } },
          { id: 'evt-job2', at: '2031-01', effect: { kind: 'employmentStart', annualSalary: 190_000 } },
        ],
        parameters: { spending: 6_500, taxRate: 0.24, ...commonWl },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'investSurplus', priority: 2 },
        ],
      }),
      scenario({
        name: 'Travel year',
        start: '2032-01',
        end: '2032-12',
        parameters: { spending: 10_000, taxRate: 0, ...commonWl },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
        ],
      }),
      scenario({
        name: 'Retirement',
        start: '2033-01',
        end: '2040-12',
        events: [
          { id: 'evt-ss', at: '2033-01', effect: { kind: 'employmentStart', annualSalary: 36_000 } }, // Social Security stand-in
          { id: 'evt-wl-withdrawal', at: '2035-06', effect: { kind: 'wholeLifeWithdrawal', assetId: 'wl', amount: 15_000 } },
        ],
        parameters: { spending: 7_500, taxRate: 0.1, ...commonWl },
        policies: [
          { id: 'p1', kind: 'spending', priority: 1 },
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
          { id: 'p3', kind: 'fundDeficitFromWholeLifeLoan', priority: 3 },
          { id: 'p4', kind: 'fundDeficitFromEquitySale', priority: 4 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    expect(result.monthly).toHaveLength(15 * 12) // 2026-01 .. 2040-12
    expect(new Set(result.monthly.map((s) => s.asOf)).size).toBe(15 * 12) // contiguous, no gap/duplicate
    expect(result.monthly.every((s) => Number.isFinite(netWorth(s)))).toBe(true) // never NaN, through every transition

    // the move actually happened
    expect(result.monthly.some((s) => s.assets.some((a) => a.id === 'home'))).toBe(true) // present before the move
    expect(result.monthly.at(-1)!.assets.some((a) => a.id === 'home')).toBe(false) // gone after
    // the whole life withdrawal actually happened
    const beforeWithdrawal = result.monthly.find((s) => s.asOf === '2035-05')!.assets.find((a) => a.id === 'wl')!
    const afterWithdrawal = result.monthly.find((s) => s.asOf === '2035-06')!.assets.find((a) => a.id === 'wl')!
    expect(afterWithdrawal.value).toBeLessThan(beforeWithdrawal.value)
  })
})

describe('50. Master plan and multiple what-ifs', () => {
  it('calculates a Master plus three Alternatives with the same engine and the same output shape, comparable directly', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', value: 30_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 100_000 }, // no per-asset override — uses the Scenario's equityReturn
      ],
      liabilities: [],
    }
    const spendPolicies = [
      { id: 'p1', kind: 'spending' as const, priority: 1 },
      { id: 'p2', kind: 'investSurplus' as const, priority: 2 },
    ]
    const master = createTrajectory('Master', [
      scenario({
        name: 'Working',
        start: '2026-01',
        end: '2027-12',
        events: [{ id: 'e', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }],
        parameters: { spending: 6_000, taxRate: 0.2, equityReturn: 0.07 },
        policies: spendPolicies,
      }),
    ])

    // Alternative A: lower spending
    const altA = replaceScenario(duplicateTrajectory(master, 'Lower spending'), master.scenarios[0]!.id, modifyScenario(master.scenarios[0]!, { parameters: { ...master.scenarios[0]!.parameters, spending: 4_000 } }))
    // Alternative B: higher salary
    const altB = replaceScenario(
      duplicateTrajectory(master, 'Higher salary'),
      master.scenarios[0]!.id,
      modifyScenario(master.scenarios[0]!, { events: [{ id: 'e', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 160_000 } }] }),
    )
    // Alternative C: different economic assumptions
    const altC = replaceScenario(duplicateTrajectory(master, 'Better returns'), master.scenarios[0]!.id, modifyScenario(master.scenarios[0]!, { parameters: { ...master.scenarios[0]!.parameters, equityReturn: 0.14 } }))

    const plans = { master, altA, altB, altC }
    const results = Object.fromEntries(Object.entries(plans).map(([name, trajectory]) => [name, calculate(initialState, trajectory)]))

    // same engine, same output shape for all four — that's what makes them comparable
    for (const result of Object.values(results)) {
      expect(result.monthly).toHaveLength(24)
      expect(result.annual).toHaveLength(2)
    }

    // and each what-if actually produced a different outcome from the Master
    const masterNetWorth = netWorth(results.master!.annual.at(-1)!)
    expect(netWorth(results.altA!.annual.at(-1)!)).toBeGreaterThan(masterNetWorth) // spent less
    expect(netWorth(results.altB!.annual.at(-1)!)).toBeGreaterThan(masterNetWorth) // earned more
    expect(netWorth(results.altC!.annual.at(-1)!)).toBeGreaterThan(masterNetWorth) // better returns

    // Master itself is untouched by building any of the Alternatives
    expect(master.scenarios[0]!.parameters.spending).toBe(6_000)
  })
})
