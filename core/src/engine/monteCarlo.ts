import { netWorth, type CalculationResult, type FinancialState, type Trajectory } from '../domain/types.ts'
import { calculate, type ParameterProvider } from './calculate.ts'

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
