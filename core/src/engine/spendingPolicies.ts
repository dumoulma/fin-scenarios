import { monthsBetween, type YearMonth } from '../domain/dates.ts'
import type { AssetType, FinancialState, Scenario, SpendingPolicy } from '../domain/types.ts'

// Real estate and Whole Life cash value aren't ordinarily counted against a
// withdrawal rate — a guardrail or percent-of-portfolio rule is about the
// investable portfolio, not total net worth.
const INVESTABLE_ASSET_TYPES = new Set<AssetType>(['cash', 'fixedIncome', 'equity'])

function investablePortfolioValue(state: FinancialState): number {
  return state.assets.filter((a) => INVESTABLE_ASSET_TYPES.has(a.assetType)).reduce((sum, a) => sum + a.value, 0)
}

type SpendingPolicyHandler = (policy: SpendingPolicy, portfolioValue: number, seedMonthlyAmount: number) => number

const spendingPolicyHandlers: Record<SpendingPolicy['kind'], SpendingPolicyHandler> = {
  percentOfPortfolio: (policy, portfolioValue) => (portfolioValue * (policy.withdrawalPercent ?? 0)) / 12,

  guardrails: (policy, portfolioValue, seedMonthlyAmount) => {
    const annualWithdrawalRate = (seedMonthlyAmount * 12) / portfolioValue
    if (annualWithdrawalRate > (policy.upperGuardrail ?? Infinity)) return seedMonthlyAmount * (1 - (policy.adjustmentPercent ?? 0))
    if (annualWithdrawalRate < (policy.lowerGuardrail ?? 0)) return seedMonthlyAmount * (1 + (policy.adjustmentPercent ?? 0))
    return seedMonthlyAmount
  },
}

/** Carries a Spending Policy's last computed amount across ticks within one
 * calculate() run — engine-internal bookkeeping, not part of FinancialState,
 * since it isn't domain data a user inspects. Resets whenever the active
 * Scenario changes, per docs/design/dynamic-spending.md's Scenario-transition
 * test: dynamic spending never carries state across a Scenario boundary. */
export type SpendingPolicyState = { scenarioId: string; lastRecomputeTick: YearMonth; monthlyAmount: number } | null

/**
 * Fixed spending (no Scenario.spendingPolicy) behaves exactly as
 * `parameters.spending` always has — this function is a no-op pass-through for
 * that case. A Scenario's first tick with a policy always recomputes (the start
 * of a Scenario is itself a cadence boundary); after that, the amount only
 * changes once `cadenceMonths` have elapsed since the last recompute.
 */
export function determineSpending(
  scenario: Scenario,
  tick: YearMonth,
  financialStateForSpending: FinancialState,
  fixedSpending: number,
  previous: SpendingPolicyState,
): { amount: number; nextState: SpendingPolicyState } {
  const policy = scenario.spendingPolicy
  if (!policy) return { amount: fixedSpending, nextState: null }

  const isFreshScenario = !previous || previous.scenarioId !== scenario.id
  const elapsedMonths = isFreshScenario ? Infinity : monthsBetween(previous!.lastRecomputeTick, tick) - 1
  const shouldRecompute = isFreshScenario || elapsedMonths >= policy.cadenceMonths

  if (!shouldRecompute) return { amount: previous!.monthlyAmount, nextState: previous }

  const portfolioValue = investablePortfolioValue(financialStateForSpending)
  const seed = isFreshScenario ? policy.baseAnnualSpending / 12 : previous!.monthlyAmount
  const amount = spendingPolicyHandlers[policy.kind](policy, portfolioValue, seed)
  return { amount, nextState: { scenarioId: scenario.id, lastRecomputeTick: tick, monthlyAmount: amount } }
}
