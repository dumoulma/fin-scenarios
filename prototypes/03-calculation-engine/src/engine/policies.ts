import type { GetParam } from './assetBehavior.ts'
import type { FinancialState, Policy, PolicyKind } from '../domain/types.ts'

export type PolicyContext = { spendingAmount: number }
export type PolicyHandler = (pool: number, state: FinancialState, getParam: GetParam, ctx: PolicyContext) => { pool: number; state: FinancialState }

/**
 * Each handler only knows how to claim from a generic cash pool and move money
 * between generic assets/liabilities — none of them know anything Asset-specific
 * beyond "find the cash asset" / "find a mortgage." This is what keeps Policy logic
 * out of Asset behavior.
 */
const policyHandlers: Record<PolicyKind, PolicyHandler> = {
  spending: (pool, state, _getParam, ctx) => ({ pool: pool - ctx.spendingAmount, state }),

  maintainCashReserve: (pool, state, getParam) => {
    if (pool <= 0) return { pool, state }
    const cash = state.assets.find((a) => a.kind === 'cash')
    if (!cash) return { pool, state }
    const shortfall = Math.max(0, getParam('cashReserveTarget') - cash.balance)
    const claim = Math.min(pool, shortfall)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.kind === 'cash' ? { ...a, balance: a.balance + claim } : a))
    return { pool: pool - claim, state: { ...state, assets } }
  },

  payMortgage: (pool, state) => {
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
    const brokerage = state.assets.find((a) => a.kind === 'taxableBrokerage')
    if (!brokerage) return { pool, state } // nowhere to invest — stays in cash via the engine's leftover-pool step
    const assets = state.assets.map((a) => (a.kind === 'taxableBrokerage' ? { ...a, balance: a.balance + pool } : a))
    return { pool: 0, state: { ...state, assets } }
  },
}

export function runPolicies(pool: number, state: FinancialState, policies: Policy[], getParam: GetParam, ctx: PolicyContext): { pool: number; state: FinancialState } {
  const sorted = [...policies].sort((a, b) => a.priority - b.priority)
  let currentPool = pool
  let currentState = state
  for (const policy of sorted) {
    const result = policyHandlers[policy.kind](currentPool, currentState, getParam, ctx)
    currentPool = result.pool
    currentState = result.state
  }
  return { pool: currentPool, state: currentState }
}
