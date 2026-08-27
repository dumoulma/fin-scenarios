import { addMonths, compareYearMonth, yearOf, type YearMonth } from '../domain/dates.ts'
import type { CalculationResult, FinancialState, Scenario, Trajectory } from '../domain/types.ts'
import { applyAssetBehavior, applyLiabilityBehavior, type GetParam } from './assetBehavior.ts'
import { applyEvent, isEventActive } from './events.ts'
import { runPolicies } from './policies.ts'

export class TrajectoryInvariantError extends Error {}

function validateTrajectory(scenarios: Scenario[]): void {
  if (scenarios.length === 0) {
    throw new TrajectoryInvariantError('A Trajectory must contain at least one Scenario')
  }
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!
    if (compareYearMonth(scenario.end, scenario.start) < 0) {
      throw new TrajectoryInvariantError(`Scenario "${scenario.name}" ends before it starts`)
    }
    if (i > 0) {
      const previous = scenarios[i - 1]!
      const expectedStart = addMonths(previous.end, 1)
      if (scenario.start !== expectedStart) {
        throw new TrajectoryInvariantError(
          `Scenario "${scenario.name}" starts at ${scenario.start}, expected ${expectedStart} to stay contiguous with "${previous.name}"`,
        )
      }
    }
  }
}

function scenarioForMonth(trajectory: Trajectory, month: YearMonth): Scenario {
  const scenario = trajectory.scenarios.find((s) => compareYearMonth(month, s.start) >= 0 && compareYearMonth(month, s.end) <= 0)
  if (!scenario) throw new TrajectoryInvariantError(`No Scenario covers month ${month}`)
  return scenario
}

export type ParameterProvider = (name: string, scenario: Scenario, month: YearMonth) => number

export const constantParameterProvider: ParameterProvider = (name, scenario) => scenario.parameters[name] ?? 0

function taxableIncomeFlow(scenario: Scenario, getParam: GetParam): number {
  const taxRate = getParam('incomeTaxRate')
  return scenario.income.reduce((sum, income) => sum + income.monthlyAmount * (income.taxable ? 1 - taxRate : 1), 0)
}

function totalSpending(scenario: Scenario): number {
  return scenario.spending.reduce((sum, spending) => sum + spending.monthlyAmount, 0)
}

function deriveAnnualSnapshots(monthly: FinancialState[]): FinancialState[] {
  // Last month of each calendar year wins — annual snapshots are derived from the
  // monthly result, never computed independently.
  const byYear = new Map<number, FinancialState>()
  for (const snapshot of monthly) byYear.set(yearOf(snapshot.asOf), snapshot)
  return [...byYear.values()]
}

export function calculate(
  initialState: FinancialState,
  trajectory: Trajectory,
  inputs: { parameterProvider: ParameterProvider } = { parameterProvider: constantParameterProvider },
): CalculationResult {
  validateTrajectory(trajectory.scenarios)

  const monthly: FinancialState[] = []
  let state = initialState
  const lastMonth = trajectory.scenarios.at(-1)!.end
  let month = trajectory.scenarios[0]!.start

  while (compareYearMonth(month, lastMonth) <= 0) {
    const scenario = scenarioForMonth(trajectory, month)
    const getParam: GetParam = (name) => inputs.parameterProvider(name, scenario, month)

    const assets = state.assets.map((asset) => applyAssetBehavior(asset, month, getParam).asset)
    let pool = 0
    const liabilities = state.liabilities.map((liability) => {
      const result = applyLiabilityBehavior(liability, month, getParam)
      pool += result.flows.reduce((sum, flow) => sum + flow.amount, 0)
      return result.liability
    })
    state = { ...state, assets, liabilities, asOf: month }

    state = scenario.events.filter((event) => isEventActive(event, month)).reduce((s, event) => applyEvent(s, event), state)

    pool += taxableIncomeFlow(scenario, getParam)

    const { pool: remainingPool, state: afterPolicies } = runPolicies(pool, state, scenario.policies, getParam, {
      spendingAmount: totalSpending(scenario),
    })
    state = {
      ...afterPolicies,
      assets: afterPolicies.assets.map((asset) => (asset.kind === 'cash' ? { ...asset, balance: asset.balance + remainingPool } : asset)),
    }

    monthly.push(state)
    month = addMonths(month, 1)
  }

  return { monthly, annual: deriveAnnualSnapshots(monthly) }
}
