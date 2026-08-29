import type { GetParam } from './assetTypeBehaviors.ts'
import type { FinancialState, Policy, PolicyKind } from '../domain/types.ts'

export type PolicyContext = { spendingAmount: number; grossIncome: number; matchRate: number; matchLimitPercentOfSalary: number }
export type PolicyHandler = (pool: number, state: FinancialState, getParam: GetParam, ctx: PolicyContext, policy: Policy) => { pool: number; state: FinancialState }

/**
 * docs/architecture.md: "reconcile(netCashPosition, financialState, policies)"
 * without needing to understand individual policy mechanics. Each handler only
 * knows how to claim from a generic pool and move money to/from a generically-
 * located asset (by holdingContext) or liability (by kind) — none of them know
 * anything Asset-Type-specific. This is what keeps Policy logic out of Asset
 * behavior, and what makes "swap two policies' priority" change the outcome
 * without changing this function.
 */
const policyHandlers: Record<PolicyKind, PolicyHandler> = {
  maintainCashReserve: (pool, state, getParam, ctx) => {
    if (pool <= 0) return { pool, state }
    const cash = state.assets.find((a) => a.assetType === 'cash')
    if (!cash) return { pool, state }
    const target = getParam('cashReserveMonths') * ctx.spendingAmount
    const shortfall = Math.max(0, target - cash.value)
    const claim = Math.min(pool, shortfall)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((asset) => (asset.id === cash.id ? { ...asset, value: asset.value + claim } : asset))
    return { pool: pool - claim, state: { ...state, assets } }
  },

  // Claims the employee's match-eligible contribution from the pool, then adds the
  // employer match on top for free (the match itself never touches the pool — it's
  // not the household's cash). targetHoldingContext is what makes this generic:
  // point it at a 401(k) or a Roth 401(k), same mechanism.
  contributeUpToMatch: (pool, state, _getParam, ctx, policy) => {
    if (pool <= 0 || !policy.targetHoldingContext) return { pool, state }
    const account = state.assets.find((a) => a.holdingContext === policy.targetHoldingContext)
    if (!account) return { pool, state }
    const matchEligible = ctx.grossIncome * ctx.matchLimitPercentOfSalary
    const employeeContribution = Math.min(pool, matchEligible)
    if (employeeContribution <= 0) return { pool, state }
    const employerMatch = employeeContribution * ctx.matchRate
    const assets = state.assets.map((a) => (a.id === account.id ? { ...a, value: a.value + employeeContribution + employerMatch } : a))
    return { pool: pool - employeeContribution, state: { ...state, assets } }
  },

  // Claims up to the monthly-equivalent of the bucket's own annual contribution
  // limit — `${targetHoldingContext}AnnualLimit` — so a 401(k) and a Roth IRA are
  // the same policy kind with different caps, not different code.
  contributeUpToLimit: (pool, state, getParam, _ctx, policy) => {
    if (pool <= 0 || !policy.targetHoldingContext) return { pool, state }
    const account = state.assets.find((a) => a.holdingContext === policy.targetHoldingContext)
    if (!account) return { pool, state }
    const monthlyLimit = getParam(`${policy.targetHoldingContext}AnnualLimit`) / 12
    const claim = Math.min(pool, monthlyLimit)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.id === account.id ? { ...a, value: a.value + claim } : a))
    return { pool: pool - claim, state: { ...state, assets } }
  },

  payMortgageExtra: (pool, state) => {
    if (pool <= 0) return { pool, state }
    const mortgage = state.liabilities.find((l) => l.kind === 'mortgage' && l.balance > 0)
    if (!mortgage) return { pool, state }
    const claim = Math.min(pool, mortgage.balance)
    if (claim <= 0) return { pool, state }
    const liabilities = state.liabilities.map((l) => (l.id === mortgage.id ? { ...l, balance: l.balance - claim } : l))
    return { pool: pool - claim, state: { ...state, liabilities } }
  },

  investSurplus: (pool, state) => {
    if (pool <= 0) return { pool, state }
    const brokerage = state.assets.find((a) => a.holdingContext === 'taxableBrokerage')
    if (!brokerage) return { pool, state } // nowhere to invest — stays in cash via the engine's leftover-pool step
    const assets = state.assets.map((a) => (a.id === brokerage.id ? { ...a, value: a.value + pool } : a))
    return { pool: 0, state: { ...state, assets } }
  },

  // Deficit-funding policies only act when the pool is negative — the mirror image
  // of the surplus-allocation policies above. Each claims up to what its source can
  // provide and moves the pool toward (never past) zero. Ordering these by
  // priority is what makes "cash first, then a policy loan, then sell equity"
  // (docs/test-scenarios.md #32) just a matter of picking priorities, not new code.
  fundDeficitFromCash: (pool, state) => {
    if (pool >= 0) return { pool, state }
    const cash = state.assets.find((a) => a.assetType === 'cash')
    if (!cash) return { pool, state }
    const claim = Math.min(-pool, cash.value)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.id === cash.id ? { ...a, value: a.value - claim } : a))
    return { pool: pool + claim, state: { ...state, assets } }
  },

  // Caps the loan at the policy's available cash value (net of any existing loan) —
  // a real Whole Life loan can't exceed that. The cash value itself is untouched;
  // only `policyLoanBalance` grows, same asymmetry `applyPointEvent`'s
  // wholeLifePolicyLoan effect already relies on.
  fundDeficitFromWholeLifeLoan: (pool, state) => {
    if (pool >= 0) return { pool, state }
    const policy = state.assets.find((a) => a.assetType === 'wholeLifeInsurance')
    if (!policy) return { pool, state }
    const available = policy.value - (policy.policyLoanBalance ?? 0)
    const claim = Math.min(-pool, available)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.id === policy.id ? { ...a, policyLoanBalance: (a.policyLoanBalance ?? 0) + claim } : a))
    return { pool: pool + claim, state: { ...state, assets } }
  },

  fundDeficitFromEquitySale: (pool, state) => {
    if (pool >= 0) return { pool, state }
    const equity = state.assets.find((a) => a.assetType === 'equity')
    if (!equity) return { pool, state }
    const claim = Math.min(-pool, equity.value)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.id === equity.id ? { ...a, value: a.value - claim } : a))
    return { pool: pool + claim, state: { ...state, assets } }
  },

  // Uncapped — debt can always cover the remainder. Reuses an existing 'other'
  // liability if one exists, otherwise opens one; a real product would let the
  // user name/rate this, but no test yet requires that.
  fundDeficitFromDebt: (pool, state) => {
    if (pool >= 0) return { pool, state }
    const deficit = -pool
    const existing = state.liabilities.find((l) => l.kind === 'other')
    const liabilities = existing
      ? state.liabilities.map((l) => (l.id === existing.id ? { ...l, balance: l.balance + deficit } : l))
      : [...state.liabilities, { id: 'auto-debt', name: 'Borrowed funds', kind: 'other' as const, balance: deficit }]
    return { pool: 0, state: { ...state, liabilities } }
  },

  // Claims up to the monthly-equivalent of wholeLifePuaAnnualMax — the real limit a
  // rider (or an uploaded illustration, eventually) sets specifically to keep the
  // policy from becoming a Modified Endowment Contract. Capping contributions here
  // *is* the MEC-avoidance mechanism; nothing else needs to model the 7-pay test.
  // Nets out the rider's load (wholeLifePuaChargeRate) before it reaches cash value.
  contributeToWholeLifePUA: (pool, state, getParam) => {
    if (pool <= 0) return { pool, state }
    const policy = state.assets.find((a) => a.assetType === 'wholeLifeInsurance')
    if (!policy) return { pool, state }
    const monthlyMax = getParam('wholeLifePuaAnnualMax') / 12
    const claim = Math.min(pool, monthlyMax)
    if (claim <= 0) return { pool, state }
    const netToValue = claim * (1 - getParam('wholeLifePuaChargeRate'))
    const assets = state.assets.map((a) => (a.id === policy.id ? { ...a, value: a.value + netToValue } : a))
    return { pool: pool - claim, state: { ...state, assets } }
  },
}

export function reconcile(pool: number, state: FinancialState, policies: Policy[], getParam: GetParam, ctx: PolicyContext): { pool: number; state: FinancialState } {
  const sorted = [...policies].sort((a, b) => a.priority - b.priority)
  let currentPool = pool
  let currentState = state
  for (const policy of sorted) {
    const result = policyHandlers[policy.kind](currentPool, currentState, getParam, ctx, policy)
    currentPool = result.pool
    currentState = result.state
  }
  return { pool: currentPool, state: currentState }
}
