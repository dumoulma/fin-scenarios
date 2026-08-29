import { addMonths, compareYearMonth, yearOf, type YearMonth } from '../domain/dates.ts'
import { assertFinancialStateCurrency, CurrencyInvariantError, type Asset, type CalculationResult, type FinancialState, type Scenario, type Trajectory } from '../domain/types.ts'
import { applyAssetTypeBehavior, applyLiabilityBehavior, type GetParam } from './assetTypeBehaviors.ts'
import { activeAnnualSalaryAt, activeEmploymentMatchAt, applyPointEvent, isPointEventActiveAt } from './eventTypeBehaviors.ts'
import { reconcile } from './policies.ts'

export class TrajectoryInvariantError extends Error {}
export { CurrencyInvariantError }

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

function scenarioForTick(trajectory: Trajectory, tick: YearMonth): Scenario {
  const scenario = trajectory.scenarios.find((s) => compareYearMonth(tick, s.start) >= 0 && compareYearMonth(tick, s.end) <= 0)
  if (!scenario) throw new TrajectoryInvariantError(`No Scenario covers tick ${tick}`)
  return scenario
}

export type ParameterProvider = (name: string, scenario: Scenario, tick: YearMonth) => number

export const constantParameterProvider: ParameterProvider = (name, scenario) => scenario.parameters[name] ?? 0

// Tax-advantaged containers defer (Traditional) or exempt (Roth, HSA) their
// distributions from tax at the point of distribution — docs/test-scenarios.md
// #21-23: "Asset behavior vs. tax wrapper separation." An asset held outside any
// wrapper ('none') is treated as ordinary taxable — no special account, no
// special treatment.
function isDistributionTaxable(holdingContext: Asset['holdingContext']): boolean {
  return holdingContext === 'none' || holdingContext === 'taxableBrokerage'
}

function deriveAnnualSnapshots(monthly: FinancialState[]): FinancialState[] {
  // Last month of each calendar year wins — annual snapshots are derived from the
  // monthly result, never computed independently (docs/domain/CONTEXT.md's Annual
  // Financial Snapshot).
  const byYear = new Map<number, FinancialState>()
  for (const snapshot of monthly) byYear.set(yearOf(snapshot.asOf), snapshot)
  return [...byYear.values()]
}

/**
 * calculate(initialState, trajectory, inputs) -> CalculationResult
 *
 * One tick per month, structured to visibly match docs/architecture.md's 9-step
 * Calculation Engine description:
 *   1. identify the Scenario covering the tick
 *   2. apply this tick's Events
 *   3. apply Asset/Liability Type behavior
 *   4-5. apply Scenario Parameters -> calculate gross cash inflow (active employment)
 *   6. apply Scenario Spending
 *   7. apply taxes
 *   8. apply Policies to reconcile the remaining surplus/deficit
 *   9. produce the next Financial State
 */
export function calculate(
  initialState: FinancialState,
  trajectory: Trajectory,
  inputs: { parameterProvider: ParameterProvider } = { parameterProvider: constantParameterProvider },
): CalculationResult {
  validateTrajectory(trajectory.scenarios)
  assertFinancialStateCurrency(initialState)

  const monthly: FinancialState[] = []
  let state = initialState
  const lastTick = trajectory.scenarios.at(-1)!.end
  let tick = trajectory.scenarios[0]!.start

  while (compareYearMonth(tick, lastTick) <= 0) {
    // 1. identify the Scenario covering this tick
    const scenario = scenarioForTick(trajectory, tick)
    const getParam: GetParam = (name) => inputs.parameterProvider(name, scenario, tick)

    // 2. this tick's point Events (buy/sell property, one-time cash flow, Whole
    // Life loan/withdrawal) apply unconditionally, before behavior/reconciliation
    state = scenario.events.filter((event) => isPointEventActiveAt(event, tick)).reduce((s, event) => applyPointEvent(s, event), state)
    assertFinancialStateCurrency(state)

    // 3. Asset/Liability Type behavior (growth stays internal; a liability's
    // scheduled payment and an asset's distribution are real cash flows)
    let pool = 0
    let taxableCashFlow = 0
    const assets = state.assets.map((asset) => {
      const result = applyAssetTypeBehavior(asset, tick, getParam)
      pool += result.cashFlow
      if (result.cashFlow > 0 && isDistributionTaxable(asset.holdingContext)) taxableCashFlow += result.cashFlow
      return result.asset
    })
    const liabilities = state.liabilities.map((liability) => {
      const result = applyLiabilityBehavior(liability, getParam)
      pool += result.cashFlow
      return result.liability
    })
    state = { ...state, assets, liabilities, asOf: tick }

    // 4-5. Scenario Parameters bound via getParam; gross cash inflow this tick is
    // whatever employment is currently active (scanning this Scenario's Events —
    // never stored as a duration on the Event itself). Salary is always taxable
    // in this simplified model.
    const grossIncome = activeAnnualSalaryAt(scenario.events, tick) / 12
    const { matchRate, matchLimitPercentOfSalary } = activeEmploymentMatchAt(scenario.events, tick)
    pool += grossIncome
    taxableCashFlow += grossIncome

    // 6-7. Spending and tax are both applied before Policies reconcile what's left
    // — matches architecture.md's literal step order, and keeps "tax" a flat,
    // approximate outflow rather than something Policy priority can affect. Only
    // taxable cash flow is taxed — a point Event (gift, inheritance) never touches
    // this at all, and a tax-advantaged container's distribution is excluded above.
    const tax = taxableCashFlow * getParam('taxRate')
    const spending = getParam('spending')
    pool -= spending + tax

    // 8. Policies reconcile the remaining pool in priority order.
    const { pool: remainingPool, state: afterPolicies } = reconcile(pool, state, scenario.policies, getParam, {
      spendingAmount: spending,
      grossIncome,
      matchRate,
      matchLimitPercentOfSalary,
    })

    // 9. whatever's left (or short) defaults to cash — the next Financial State
    const cash = afterPolicies.assets.find((asset) => asset.assetType === 'cash')
    state = {
      ...afterPolicies,
      assets: cash ? afterPolicies.assets.map((asset) => (asset.id === cash.id ? { ...asset, value: asset.value + remainingPool } : asset)) : afterPolicies.assets,
    }

    monthly.push(state)
    tick = addMonths(tick, 1)
  }

  return { monthly, annual: deriveAnnualSnapshots(monthly) }
}
