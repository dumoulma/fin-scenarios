import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import type { FinancialState, Policy } from '../src/domain/types.ts'
import { runStochasticMonteCarlo } from '../src/engine/monteCarlo.ts'

// A simple 10-year accumulation trajectory: salary, fixed spending, whatever's
// left invested in one equity Asset. Reused across tests below.
function accumulationTrajectory(equityReturn: number) {
  const initialState: FinancialState = {
    asOf: '2026-01',
    reportingCurrency: 'USD',
    assets: [{ id: 'brokerage', name: 'Brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 10_000 }],
    liabilities: [],
  }
  const policies: Policy[] = [{ id: 'surplus', kind: 'investSurplus', priority: 1 }]
  const trajectory = createTrajectory('Accumulation', [
    createScenario({
      name: 'Working',
      start: '2026-01',
      end: '2035-12',
      events: [{ id: 'evt-job', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 100_000 } }],
      parameters: { spending: 5_000, taxRate: 0.2, equityReturn, equityDistributionRate: 0 },
      policies,
    }),
  ])
  return { initialState, trajectory }
}

describe('runStochasticMonteCarlo', () => {
  it('with zero volatility, every trial produces the identical result and stdDev is 0 for every year', () => {
    const { initialState, trajectory } = accumulationTrajectory(0.07)
    const result = runStochasticMonteCarlo(initialState, trajectory, { trials: 5, volatility: {}, seed: 1 })

    expect(result.trials).toBe(5)
    expect(result.annualNetWorthByTrial).toHaveLength(5)
    for (const trial of result.annualNetWorthByTrial) expect(trial).toEqual(result.annualNetWorthByTrial[0])
    for (const year of result.summary) expect(year.stdDev).toBeCloseTo(0, 6)
  })

  it('with volatility, different trials diverge and later years have non-zero spread', () => {
    const { initialState, trajectory } = accumulationTrajectory(0.07)
    const result = runStochasticMonteCarlo(initialState, trajectory, { trials: 20, volatility: { equityReturn: 0.15 }, seed: 1 })

    expect(result.annualNetWorthByTrial[0]).not.toEqual(result.annualNetWorthByTrial[1])
    expect(result.summary.at(-1)!.stdDev).toBeGreaterThan(0)
  })

  it('every year of the summary satisfies p10 <= median <= p90 <= mean+range sanity', () => {
    const { initialState, trajectory } = accumulationTrajectory(0.07)
    const result = runStochasticMonteCarlo(initialState, trajectory, { trials: 50, volatility: { equityReturn: 0.15 }, seed: 3 })

    for (const year of result.summary) {
      expect(year.p10).toBeLessThanOrEqual(year.median)
      expect(year.median).toBeLessThanOrEqual(year.p90)
    }
  })

  it('the same seed reproduces the exact same result', () => {
    const { initialState, trajectory } = accumulationTrajectory(0.07)
    const config = { trials: 10, volatility: { equityReturn: 0.15 }, seed: 99 }
    const a = runStochasticMonteCarlo(initialState, trajectory, config)
    const b = runStochasticMonteCarlo(initialState, trajectory, config)
    expect(a).toEqual(b)
  })

  it('the summary covers the same years, in the same order, as a single calculate() call', () => {
    const { initialState, trajectory } = accumulationTrajectory(0.07)
    const result = runStochasticMonteCarlo(initialState, trajectory, { trials: 3, volatility: { equityReturn: 0.1 }, seed: 1 })
    expect(result.summary.map((y) => y.asOf)).toEqual(['2026', '2027', '2028', '2029', '2030', '2031', '2032', '2033', '2034', '2035'].map((y) => `${y}-12`))
  })

  it('over many trials, the mean outcome roughly tracks the zero-volatility deterministic outcome', () => {
    const { initialState, trajectory } = accumulationTrajectory(0.07)
    const deterministic = runStochasticMonteCarlo(initialState, trajectory, { trials: 1, volatility: {}, seed: 1 })
    const stochastic = runStochasticMonteCarlo(initialState, trajectory, { trials: 2_000, volatility: { equityReturn: 0.1 }, seed: 1 })

    const deterministicFinal = deterministic.summary.at(-1)!.mean
    const stochasticFinalMean = stochastic.summary.at(-1)!.mean
    // Normal noise centered on the same mean should roughly average out over
    // enough trials — not exact (compounding is nonlinear), just in the
    // right ballpark.
    expect(stochasticFinalMean).toBeGreaterThan(deterministicFinal * 0.8)
    expect(stochasticFinalMean).toBeLessThan(deterministicFinal * 1.2)
  })
})
