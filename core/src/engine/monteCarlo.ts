import type { YearMonth } from '../domain/dates.ts'
import { netWorth, type CalculationResult, type FinancialState, type Trajectory } from '../domain/types.ts'
import { calculate, type ParameterProvider } from './calculate.ts'
import { createStochasticParameterProvider, type Volatility } from './stochasticParameterProvider.ts'

export type MonteCarloResult = {
  results: CalculationResult[]
  finalNetWorths: number[]
  median: number
  mean: number
  stdDev: number
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stdDev(values: number[], avg: number): number {
  const variance = mean(values.map((v) => (v - avg) ** 2))
  return Math.sqrt(variance)
}

/**
 * docs/architecture.md: "Monte Carlo does not require a separate financial
 * calculation model. It repeatedly applies the same calculation engine with
 * different generated inputs." This is exactly that — no new calculation logic,
 * just `calculate()` called once per run with that run's own ParameterProvider,
 * then simple descriptive statistics over the ending net worths.
 */
export function runMonteCarlo(
  initialState: FinancialState,
  trajectory: Trajectory,
  generateParameterProvider: (runIndex: number) => ParameterProvider,
  runs: number,
): MonteCarloResult {
  const results: CalculationResult[] = []
  for (let i = 0; i < runs; i++) {
    results.push(calculate(initialState, trajectory, { parameterProvider: generateParameterProvider(i) }))
  }

  const finalNetWorths = results.map((r) => netWorth(r.annual.at(-1)!))
  const sorted = [...finalNetWorths].sort((a, b) => a - b)
  const avg = mean(finalNetWorths)

  return { results, finalNetWorths, median: median(sorted), mean: avg, stdDev: stdDev(finalNetWorths, avg) }
}

// --- Stochastic convenience path (normal-distribution volatility, every year
// summarized, not just the final one) ---

export type StochasticMonteCarloConfig = {
  trials: number
  volatility: Volatility
  /** Base seed — trial N uses seed + N, so every trial gets its own reproducible
   * draw sequence while the whole run stays reproducible from one number. */
  seed?: number
}

export type YearlyDistributionSummary = {
  asOf: YearMonth
  mean: number
  stdDev: number
  median: number
  p10: number
  p90: number
}

export type StochasticMonteCarloOutcome = {
  trials: number
  /** [trialIndex][yearIndex] — raw per-trial net worth series, for custom
   * aggregation or a fan chart the summary alone can't produce. */
  annualNetWorthByTrial: number[][]
  /** Per-year distribution across all trials, same order as one trial's annual
   * snapshots — richer than MonteCarloResult's final-year-only stats, for a
   * fan-chart-style visualization over the whole Trajectory. */
  summary: YearlyDistributionSummary[]
}

function percentile(sortedAscending: number[], p: number): number {
  const index = (p / 100) * (sortedAscending.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sortedAscending[lower]!
  const weight = index - lower
  return sortedAscending[lower]! * (1 - weight) + sortedAscending[upper]! * weight
}

/**
 * The normal-distribution convenience path: wires createStochasticParameterProvider
 * into runMonteCarlo, then re-aggregates every year (not just the final one) from
 * the full per-trial results runMonteCarlo already retains.
 */
export function runStochasticMonteCarlo(initialState: FinancialState, trajectory: Trajectory, config: StochasticMonteCarloConfig): StochasticMonteCarloOutcome {
  const baseSeed = config.seed ?? 1
  const outcome = runMonteCarlo(initialState, trajectory, (runIndex) => createStochasticParameterProvider(config.volatility, baseSeed + runIndex), config.trials)

  const annualNetWorthByTrial = outcome.results.map((result) => result.annual.map(netWorth))
  const asOfByYear = outcome.results[0]!.annual.map((snapshot) => snapshot.asOf)
  const summary = asOfByYear.map((asOf, yearIndex) => {
    const values = annualNetWorthByTrial.map((trial) => trial[yearIndex]!)
    const yearMean = mean(values)
    const sorted = [...values].sort((a, b) => a - b)
    return { asOf, mean: yearMean, stdDev: stdDev(values, yearMean), median: percentile(sorted, 50), p10: percentile(sorted, 10), p90: percentile(sorted, 90) }
  })

  return { trials: config.trials, annualNetWorthByTrial, summary }
}
