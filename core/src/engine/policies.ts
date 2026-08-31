import type { GetParam } from './assetTypeBehaviors.ts'
import type { FinancialState, Policy, PolicyKind } from '../domain/types.ts'

// annualContributions is engine-internal bookkeeping, not FinancialState — a
// running total per Policy-owned key, shared across whichever Policies claim into
// it (contributeUpToLimit, contributeFixedAmount, contributeToWholeLifePUAAnnually),
// so a capped account can't be over-funded by combining more than one Policy
// against it. Mutated in place by convention: calculate.ts owns one Map and
// passes the same reference through every tick's ctx, rather than threading it
// through every handler's return value for one cross-cutting concern. Each key
// resets on its OWN Policy.resetMonth (calculate.ts), not a single blanket wipe —
// a real account's cap doesn't necessarily reset on the calendar year.
export type PolicyContext = { spendingAmount: number; grossIncome: number; matchRate: number; matchLimitPercentOfSalary: number; annualContributions: Map<string, number> }
export type PolicyHandler = (pool: number, state: FinancialState, getParam: GetParam, ctx: PolicyContext, policy: Policy) => { pool: number; state: FinancialState }

// The single source of truth for "which annualContributions slot does this Policy
// own" — used both to reset a slot on its Policy's own anniversary (calculate.ts)
// and to read/write it here, so the two can never drift out of sync. undefined
// means this Policy kind doesn't use annualContributions at all.
export function annualContributionsKeyFor(policy: Policy): string | undefined {
  switch (policy.kind) {
    case 'contributeUpToLimit':
      return policy.targetHoldingContext
    case 'contributeFixedAmount':
      return policy.targetAssetId ?? policy.targetHoldingContext
    case 'contributeToWholeLifePUAAnnually':
      return policy.targetAssetId ?? 'wholeLifePUAAnnually'
    default:
      return undefined
  }
}

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
  // targetAssetId points this at one specific named cash Asset (e.g. "Chase") with
  // its own flat-dollar target (`${targetAssetId}CashReserveTarget`) — this is what
  // lets two of these Policies maintain two independent buffers. Without it, falls
  // back unchanged to the original "first cash Asset, cashReserveMonths * spending" behavior.
  maintainCashReserve: (pool, state, getParam, ctx, policy) => {
    if (pool <= 0) return { pool, state }
    const cash = policy.targetAssetId ? state.assets.find((a) => a.id === policy.targetAssetId) : state.assets.find((a) => a.assetType === 'cash')
    if (!cash) return { pool, state }
    const target = policy.targetAssetId ? getParam(`${policy.targetAssetId}CashReserveTarget`) : getParam('cashReserveMonths') * ctx.spendingAmount
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
  // the same policy kind with different caps, not different code. Also respects
  // ctx.annualContributions: if contributeFixedAmount (or another instance of this
  // same kind) already claimed part of this calendar year's room against the same
  // targetHoldingContext, only what's left of the annual cap is available here —
  // an account can't be over-funded just because two Policies both target it.
  contributeUpToLimit: (pool, state, getParam, ctx, policy) => {
    const key = annualContributionsKeyFor(policy)
    if (pool <= 0 || !key) return { pool, state }
    const account = state.assets.find((a) => a.holdingContext === policy.targetHoldingContext)
    if (!account) return { pool, state }
    const annualLimit = getParam(`${key}AnnualLimit`)
    const alreadyContributed = ctx.annualContributions.get(key) ?? 0
    const remainingCap = Math.max(0, annualLimit - alreadyContributed)
    const claim = Math.min(pool, annualLimit / 12, remainingCap)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.id === account.id ? { ...a, value: a.value + claim } : a))
    ctx.annualContributions.set(key, alreadyContributed + claim)
    return { pool: pool - claim, state: { ...state, assets } }
  },

  // Moves exactly its configured monthly amount, not the whole pool — unlike
  // investSurplus, a fixed DCA contribution shouldn't grow just because there's
  // more surplus this month. Shares the same calendar-year running total as
  // contributeUpToLimit when both target the same account, via the same
  // `${targetHoldingContext}AnnualLimit` (absent means no annual cap applies here).
  //
  // targetAssetId points this at one specific named Asset (e.g. a single ETF) with
  // its own param key, mirroring maintainCashReserve's pattern — this is what lets
  // two Assets sharing a holdingContext (e.g. two ETFs both in taxableBrokerage)
  // each get their own independent fixed monthly contribution. Without it, falls
  // back unchanged to the original holding-context-keyed behavior.
  contributeFixedAmount: (pool, state, getParam, ctx, policy) => {
    const key = annualContributionsKeyFor(policy)
    if (pool <= 0 || !key) return { pool, state }
    const account = policy.targetAssetId ? state.assets.find((a) => a.id === policy.targetAssetId) : state.assets.find((a) => a.holdingContext === policy.targetHoldingContext)
    if (!account) return { pool, state }
    const fixedAmount = getParam(`${key}FixedMonthlyAmount`)
    const annualLimit = getParam(`${key}AnnualLimit`)
    const alreadyContributed = ctx.annualContributions.get(key) ?? 0
    const remainingCap = annualLimit > 0 ? Math.max(0, annualLimit - alreadyContributed) : Infinity
    const claim = Math.min(pool, fixedAmount, remainingCap)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.id === account.id ? { ...a, value: a.value + claim } : a))
    ctx.annualContributions.set(key, alreadyContributed + claim)
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

  // Same shape as fundDeficitFromEquitySale, targeting fixedIncome instead — the
  // "bonds" rung of a cash -> bonds -> equity retirement bucket strategy is just a
  // matter of priority ordering these three, per docs/design/dynamic-spending.md.
  fundDeficitFromFixedIncomeSale: (pool, state) => {
    if (pool >= 0) return { pool, state }
    const bonds = state.assets.find((a) => a.assetType === 'fixedIncome')
    if (!bonds) return { pool, state }
    const claim = Math.min(-pool, bonds.value)
    if (claim <= 0) return { pool, state }
    const assets = state.assets.map((a) => (a.id === bonds.id ? { ...a, value: a.value - claim } : a))
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

  // A sibling of contributeToWholeLifePUA, not a replacement — that one claims a
  // smooth monthly-equivalent slice forever (no annual bookkeeping at all, so it
  // only stays under the real cap by coincidence when income is smooth). This one
  // tracks a real running total via ctx.annualContributions (resetting on its own
  // Policy.resetMonth — a Whole Life rider's policy-year anniversary, not
  // necessarily January) and claims no more than what's actually left of the
  // annual cap, with no monthly division — so a single large inflow (e.g. an
  // annual bonus) can fund the whole year's PUA room in one lump.
  contributeToWholeLifePUAAnnually: (pool, state, getParam, ctx, policy) => {
    const key = annualContributionsKeyFor(policy)!
    if (pool <= 0) return { pool, state }
    const wholeLifePolicy = policy.targetAssetId ? state.assets.find((a) => a.id === policy.targetAssetId) : state.assets.find((a) => a.assetType === 'wholeLifeInsurance')
    if (!wholeLifePolicy) return { pool, state }
    const annualMax = getParam('wholeLifePuaAnnualMax')
    const alreadyContributed = ctx.annualContributions.get(key) ?? 0
    const remainingCap = Math.max(0, annualMax - alreadyContributed)
    const claim = Math.min(pool, remainingCap)
    if (claim <= 0) return { pool, state }
    const netToValue = claim * (1 - getParam('wholeLifePuaChargeRate'))
    const assets = state.assets.map((a) => (a.id === wholeLifePolicy.id ? { ...a, value: a.value + netToValue } : a))
    ctx.annualContributions.set(key, alreadyContributed + claim)
    return { pool: pool - claim, state: { ...state, assets } }
  },

  // Moves a fraction of whatever sits above a source Asset's reserve target (the
  // same `${sourceAssetId}CashReserveTarget` param maintainCashReserve reads) into
  // a destination Asset — unlike every other Policy here, this doesn't touch pool
  // at all; it rebalances money that's already landed (e.g. a bonus that went
  // straight to cash via oneTimeCashFlow). Two instances with fractions 0.7 and
  // 1.0 split the excess 70/30 between two destinations: the first sweeps 70% of
  // the excess, the second sweeps 100% of whatever's left (exactly the remaining
  // 30% of the original excess) — no shared state needed between them beyond
  // running in priority order against the same, already-reduced source balance.
  sweepCashAboveTarget: (pool, state, getParam, _ctx, policy) => {
    if (!policy.sourceAssetId || !policy.targetAssetId) return { pool, state }
    const source = state.assets.find((a) => a.id === policy.sourceAssetId)
    const destination = state.assets.find((a) => a.id === policy.targetAssetId)
    if (!source || !destination) return { pool, state }
    const target = getParam(`${policy.sourceAssetId}CashReserveTarget`)
    const excess = Math.max(0, source.value - target)
    const fraction = getParam(`${policy.targetAssetId}SweepFraction`)
    const amount = excess * fraction
    if (amount <= 0) return { pool, state }
    const assets = state.assets.map((a) => {
      if (a.id === source.id) return { ...a, value: a.value - amount }
      if (a.id === destination.id) return { ...a, value: a.value + amount }
      return a
    })
    return { pool, state: { ...state, assets } }
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
