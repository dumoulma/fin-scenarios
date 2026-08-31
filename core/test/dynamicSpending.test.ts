// docs/design/dynamic-spending.md's Initial Test Progression (1-12), through the
// public calculate() interface only — no mocks, no internal wiring touched directly.
import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Policy, type Scenario, type ScenarioParameters, type SpendingPolicy } from '../src/domain/types.ts'
import { calculate, type ParameterProvider } from '../src/engine/calculate.ts'

function retirementState(overrides: Partial<{ cash: number; bonds: number; equity: number }> = {}): FinancialState {
  return {
    asOf: '2026-01',
    reportingCurrency: 'USD',
    assets: [
      { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: overrides.cash ?? 50_000 },
      { id: 'bonds', name: 'Bonds', assetType: 'fixedIncome', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: overrides.bonds ?? 300_000 },
      { id: 'equity', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: overrides.equity ?? 650_000 },
    ],
    liabilities: [],
  }
}

const noGrowth = { taxRate: 0, cashApy: 0, fixedIncomeReturn: 0, equityReturn: 0, equityDistributionRate: 0 }

function retirementScenario(overrides: Partial<Scenario> & { end: string; policies: Policy[]; parameters: ScenarioParameters; spendingPolicy?: SpendingPolicy }): Scenario {
  return createScenario({ name: 'Retirement', start: '2026-01', events: [], ...overrides })
}

describe('1. Fixed spending during retirement', () => {
  it('deducts exactly the fixed Scenario spending, funded from cash, with no policy logic involved', () => {
    const trajectory = createTrajectory('Solo', [
      retirementScenario({ end: '2026-01', parameters: { spending: 4_000, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromCash', priority: 1 }] }),
    ])
    const result = calculate(retirementState(), trajectory)
    expect(result.monthly[0]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(50_000 - 4_000, 6)
  })
})

describe('2. Fixed spending with a simple asset drawdown Policy', () => {
  it('funds the deficit from equity when cash is unavailable', () => {
    const trajectory = createTrajectory('Solo', [
      retirementScenario({ end: '2026-01', parameters: { spending: 4_000, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromEquitySale', priority: 1 }] }),
    ])
    const result = calculate(retirementState({ cash: 0 }), trajectory)
    expect(result.monthly[0]!.assets.find((a) => a.id === 'equity')!.value).toBeCloseTo(650_000 - 4_000, 6)
    expect(result.monthly[0]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(0, 6)
  })
})

describe('3. Cash-first bucket strategy', () => {
  it('drains cash before touching equity', () => {
    const trajectory = createTrajectory('Solo', [
      retirementScenario({
        end: '2026-01',
        parameters: { spending: 60_000, ...noGrowth },
        policies: [
          { id: 'p1', kind: 'fundDeficitFromCash', priority: 1 },
          { id: 'p2', kind: 'fundDeficitFromEquitySale', priority: 2 },
        ],
      }),
    ])
    const result = calculate(retirementState({ cash: 50_000 }), trajectory)
    const after = result.monthly[0]!
    expect(after.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(0, 6)
    expect(after.assets.find((a) => a.id === 'equity')!.value).toBeCloseTo(650_000 - 10_000, 6) // the remaining 10,000 deficit
  })
})

describe('4. Cash → bonds → equity bucket strategy', () => {
  it('exhausts cash, then bonds, before equity is touched', () => {
    const trajectory = createTrajectory('Solo', [
      retirementScenario({
        end: '2026-01',
        parameters: { spending: 100_000, ...noGrowth },
        policies: [
          { id: 'p1', kind: 'fundDeficitFromCash', priority: 1 },
          { id: 'p2', kind: 'fundDeficitFromFixedIncomeSale', priority: 2 },
          { id: 'p3', kind: 'fundDeficitFromEquitySale', priority: 3 },
        ],
      }),
    ])
    const result = calculate(retirementState({ cash: 50_000, bonds: 300_000 }), trajectory)
    const after = result.monthly[0]!
    expect(after.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(0, 6)
    expect(after.assets.find((a) => a.id === 'bonds')!.value).toBeCloseTo(300_000 - 50_000, 6) // the remaining 50,000 deficit
    expect(after.assets.find((a) => a.id === 'equity')!.value).toBeCloseTo(650_000, 6) // untouched
  })
})

describe('5. Bucket replenishment', () => {
  it('tops the cash reserve back up from surplus once income resumes, using the existing maintainCashReserve Policy — no new mechanism needed', () => {
    const trajectory = createTrajectory('Solo', [
      retirementScenario({
        end: '2026-02',
        events: [{ id: 'evt-windfall', at: '2026-02', effect: { kind: 'oneTimeCashFlow', amount: 40_000 } }],
        parameters: { spending: 8_000, cashReserveMonths: 6, ...noGrowth },
        policies: [
          { id: 'p1', kind: 'fundDeficitFromCash', priority: 1 },
          { id: 'p2', kind: 'maintainCashReserve', priority: 2 },
        ],
      }),
    ])
    const result = calculate(retirementState({ cash: 8_000 }), trajectory)
    expect(result.monthly[0]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(0, 6) // drained in month 1
    // month 2: +40,000 windfall - 8,000 spending = 32,000 surplus, claimed by maintainCashReserve up to the 48,000 target
    expect(result.monthly[1]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(32_000, 6)
  })
})

describe('6. Poor sequence of returns', () => {
  it('cuts guardrail spending after an early crash raises the withdrawal rate above the upper band', () => {
    const spendingPolicy: SpendingPolicy = { kind: 'guardrails', cadenceMonths: 12, baseAnnualSpending: 50_000, upperGuardrail: 0.055, lowerGuardrail: 0.03, adjustmentPercent: 0.1 }
    const trajectory = createTrajectory('Solo', [
      retirementScenario({ end: '2027-12', parameters: { spending: 0, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromEquitySale', priority: 1 }], spendingPolicy }),
    ])
    // The crash runs Feb-Dec 2026 (11 months) and stops before the Jan 2027 tick
    // where the annual recompute happens — so that tick's own asset behavior is
    // flat, and the total-asset delta across it reflects spending alone, applied
    // against the already-crashed (but not further declining) portfolio.
    const crashThenFlat: ParameterProvider = (name, scenario, tick) => (name === 'equityReturn' && tick >= '2026-02' && tick <= '2026-12' ? -0.5 : (scenario.parameters[name] ?? 0))
    const result = calculate(retirementState(), trajectory, { parameterProvider: crashThenFlat })

    const month1Spending = netWorth(retirementState()) - netWorth(result.monthly[0]!)
    expect(month1Spending).toBeCloseTo(50_000 / 12, 6) // clean baseline, no crash yet, no adjustment
    expect(result.monthly[12]!.asOf).toBe('2027-01')
    const spendingAtMonth13 = result.monthly[11]!.assets.reduce((s, a) => s + a.value, 0) - result.monthly[12]!.assets.reduce((s, a) => s + a.value, 0)
    expect(spendingAtMonth13).toBeGreaterThan(0) // still spending something after the cut
    expect(spendingAtMonth13).toBeLessThan(50_000 / 12) // but less than the original monthly amount, thanks to the guardrail cut
  })
})

describe('7. Favorable sequence of returns', () => {
  it('raises guardrail spending after a strong first year drops the withdrawal rate below the lower band', () => {
    const spendingPolicy: SpendingPolicy = { kind: 'guardrails', cadenceMonths: 12, baseAnnualSpending: 50_000, upperGuardrail: 0.055, lowerGuardrail: 0.045, adjustmentPercent: 0.1 }
    const trajectory = createTrajectory('Solo', [
      retirementScenario({ end: '2027-01', parameters: { spending: 0, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromEquitySale', priority: 1 }], spendingPolicy }),
    ])
    const boomThenFlat: ParameterProvider = (name, scenario, tick) => (name === 'equityReturn' && tick <= '2026-12' ? 0.5 : (scenario.parameters[name] ?? 0))
    const result = calculate(retirementState(), trajectory, { parameterProvider: boomThenFlat })

    const spendingAtMonth13 = result.monthly[11]!.assets.reduce((s, a) => s + a.value, 0) - result.monthly[12]!.assets.reduce((s, a) => s + a.value, 0)
    expect(spendingAtMonth13).toBeGreaterThan(50_000 / 12) // the strong year earned a raise
  })
})

describe('8. Dynamic spending with a simple rule (percentOfPortfolio)', () => {
  it('spends a fixed percentage of the current investable portfolio each recompute', () => {
    const spendingPolicy: SpendingPolicy = { kind: 'percentOfPortfolio', cadenceMonths: 1, baseAnnualSpending: 0, withdrawalPercent: 0.04 }
    const trajectory = createTrajectory('Solo', [
      retirementScenario({ end: '2026-01', parameters: { spending: 0, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromCash', priority: 1 }], spendingPolicy }),
    ])
    const result = calculate(retirementState(), trajectory) // portfolio = 1,000,000
    expect(result.monthly[0]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(50_000 - (1_000_000 * 0.04) / 12, 6)
  })
})

describe('9. Guardrail spending based on portfolio state', () => {
  it('cuts spending immediately when the seeded amount already exceeds the upper guardrail', () => {
    const spendingPolicy: SpendingPolicy = { kind: 'guardrails', cadenceMonths: 1, baseAnnualSpending: 60_000, upperGuardrail: 0.055, lowerGuardrail: 0.03, adjustmentPercent: 0.1 }
    const trajectory = createTrajectory('Solo', [
      retirementScenario({ end: '2026-01', parameters: { spending: 0, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromCash', priority: 1 }], spendingPolicy }),
    ])
    const result = calculate(retirementState(), trajectory) // portfolio = 1,000,000; 60k/yr = 6% > 5.5% upper
    const expectedSpending = (60_000 / 12) * 0.9 // cut by the 10% adjustment
    expect(result.monthly[0]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(50_000 - expectedSpending, 6)
  })
})

describe('10. Guardrail spending combined with bucket drawdown', () => {
  it('funds the guardrail-determined deficit through the cash → bonds → equity order', () => {
    const spendingPolicy: SpendingPolicy = { kind: 'guardrails', cadenceMonths: 1, baseAnnualSpending: 60_000, upperGuardrail: 0.055, lowerGuardrail: 0.03, adjustmentPercent: 0.1 }
    const trajectory = createTrajectory('Solo', [
      retirementScenario({
        end: '2026-01',
        parameters: { spending: 0, ...noGrowth },
        policies: [
          { id: 'p1', kind: 'fundDeficitFromCash', priority: 1 },
          { id: 'p2', kind: 'fundDeficitFromFixedIncomeSale', priority: 2 },
          { id: 'p3', kind: 'fundDeficitFromEquitySale', priority: 3 },
        ],
        spendingPolicy,
      }),
    ])
    const result = calculate(retirementState({ cash: 1_000 }), trajectory)
    const after = result.monthly[0]!
    const expectedSpending = (60_000 / 12) * 0.9
    expect(after.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(0, 6)
    expect(after.assets.find((a) => a.id === 'bonds')!.value).toBeCloseTo(300_000 - (expectedSpending - 1_000), 6)
    expect(after.assets.find((a) => a.id === 'equity')!.value).toBeCloseTo(650_000, 6) // untouched — bonds covered the rest
  })
})

describe('11. Working → retirement Scenario transition', () => {
  it('spends the fixed working-Scenario amount, then switches cleanly to the dynamic policy at retirement', () => {
    const spendingPolicy: SpendingPolicy = { kind: 'percentOfPortfolio', cadenceMonths: 1, baseAnnualSpending: 0, withdrawalPercent: 0.04 }
    const trajectory = createTrajectory('Life', [
      createScenario({
        name: 'Working',
        start: '2026-01',
        end: '2026-01',
        events: [{ id: 'evt-job', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 120_000 } }],
        parameters: { spending: 5_000, ...noGrowth },
        policies: [{ id: 'p', kind: 'investSurplus', priority: 1 }],
      }),
      retirementScenario({ name: 'Retirement', start: '2026-02', end: '2026-02', parameters: { spending: 0, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromCash', priority: 1 }], spendingPolicy }),
    ])
    const result = calculate(retirementState(), trajectory)
    const workingSurplus = 120_000 / 12 - 5_000
    // investSurplus claims the first taxableBrokerage-holdingContext Asset it finds,
    // which is "bonds" in retirementState()'s asset order, not "equity"
    expect(result.monthly[0]!.assets.find((a) => a.id === 'bonds')!.value).toBeCloseTo(300_000 + workingSurplus, 6) // fixed spending, working Scenario
    const retirementSpending = ((1_000_000 + workingSurplus) * 0.04) / 12
    expect(result.monthly[1]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(50_000 - retirementSpending, 6)
  })
})

describe('12. Multiple retirement Scenarios with different spending Policies', () => {
  it("each Scenario's own spendingPolicy governs only its own ticks, seeding fresh at the boundary rather than inheriting state", () => {
    const earlyPolicy: SpendingPolicy = { kind: 'percentOfPortfolio', cadenceMonths: 1, baseAnnualSpending: 0, withdrawalPercent: 0.05 }
    const latePolicy: SpendingPolicy = { kind: 'guardrails', cadenceMonths: 1, baseAnnualSpending: 40_000, upperGuardrail: 0.9, lowerGuardrail: 0, adjustmentPercent: 0.1 } // guardrails never trip — isolates the seeding behavior
    const trajectory = createTrajectory('Retirement phases', [
      retirementScenario({ name: 'Early Retirement', end: '2026-01', parameters: { spending: 0, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromCash', priority: 1 }], spendingPolicy: earlyPolicy }),
      retirementScenario({ name: 'Late Retirement', start: '2026-02', end: '2026-02', parameters: { spending: 0, ...noGrowth }, policies: [{ id: 'p', kind: 'fundDeficitFromCash', priority: 1 }], spendingPolicy: latePolicy }),
    ])
    const result = calculate(retirementState({ cash: 200_000 }), trajectory) // portfolio = 200,000 + 300,000 + 650,000 = 1,150,000
    const earlySpending = (1_150_000 * 0.05) / 12
    expect(result.monthly[0]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(200_000 - earlySpending, 6)
    const lateSpending = 40_000 / 12 // seeded fresh from Late Retirement's own baseAnnualSpending, unrelated to earlyPolicy's 5%
    expect(result.monthly[1]!.assets.find((a) => a.id === 'cash')!.value).toBeCloseTo(200_000 - earlySpending - lateSpending, 6)
  })
})
