import { compareYearMonth, type YearMonth } from '../domain/dates.ts'
import type { Event, FinancialState } from '../domain/types.ts'

/**
 * Employment has no duration on the Event record (docs/domain/CONTEXT.md: "An Event
 * has one timestamp; recurrence and duration are behavior"). Instead, scan the
 * Scenario's events for the most recent employmentStart at or before `tick` that
 * hasn't been matched by a later employmentEnd. Deliberately scoped to a single
 * Scenario's events — active employment never carries across a Scenario boundary,
 * so a new job simply means a new Scenario with its own employmentStart.
 */
function activeEmploymentStartAt(scenarioEvents: Event[], tick: YearMonth): Extract<Event['effect'], { kind: 'employmentStart' }> | undefined {
  const sorted = [...scenarioEvents].sort((a, b) => compareYearMonth(a.at, b.at))
  let active: Extract<Event['effect'], { kind: 'employmentStart' }> | undefined
  for (const event of sorted) {
    if (compareYearMonth(event.at, tick) > 0) break
    if (event.effect.kind === 'employmentStart') active = event.effect
    else if (event.effect.kind === 'employmentEnd') active = undefined
  }
  return active
}

export function activeAnnualSalaryAt(scenarioEvents: Event[], tick: YearMonth): number {
  return activeEmploymentStartAt(scenarioEvents, tick)?.annualSalary ?? 0
}

/** Employer-match terms come from the same active employmentStart — a policy
 * reconciling the pool doesn't know about Events or Scenarios, so this is how
 * that info reaches PolicyContext. */
export function activeEmploymentMatchAt(scenarioEvents: Event[], tick: YearMonth): { matchRate: number; matchLimitPercentOfSalary: number } {
  const active = activeEmploymentStartAt(scenarioEvents, tick)
  return { matchRate: active?.matchRate ?? 0, matchLimitPercentOfSalary: active?.matchLimitPercentOfSalary ?? 0 }
}

export function isPointEventActiveAt(event: Event, tick: YearMonth): boolean {
  return event.at === tick
}

/** Unconditional — point events create/remove/adjust positions exactly as
 * specified, never gated or redirected by Policies (unlike the calculated cash
 * inflow from active employment, which flows through the shared reconciliation
 * pool). employmentStart/employmentEnd have no state-transforming effect here —
 * their only job is marking the active-employment window read by
 * activeAnnualSalaryAt above. */
export function applyPointEvent(state: FinancialState, event: Event): FinancialState {
  const effect = event.effect

  switch (effect.kind) {
    case 'employmentStart':
    case 'employmentEnd':
      return state

    case 'oneTimeCashFlow': {
      const assets = state.assets.map((a) => (a.assetType === 'cash' ? { ...a, value: a.value + effect.amount } : a))
      return { ...state, assets }
    }

    case 'buyProperty': {
      const cashOut = effect.downPayment + (effect.transactionCost ?? 0)
      const assets = state.assets.map((a) => (a.assetType === 'cash' ? { ...a, value: a.value - cashOut } : a)).concat(effect.asset)
      const liabilities = effect.mortgage ? [...state.liabilities, effect.mortgage] : state.liabilities
      return { ...state, assets, liabilities }
    }

    case 'sellProperty': {
      const property = state.assets.find((a) => a.id === effect.assetId)
      if (!property || property.assetType !== 'realEstate') return state
      const mortgage = state.liabilities.find((l) => l.linkedAssetId === effect.assetId)
      const netProceeds = property.value - (mortgage?.balance ?? 0)
      const assets = state.assets
        .filter((a) => a.id !== effect.assetId)
        .map((a) => (a.assetType === 'cash' ? { ...a, value: a.value + netProceeds } : a))
      const liabilities = state.liabilities.filter((l) => l.linkedAssetId !== effect.assetId)
      return { ...state, assets, liabilities }
    }

    case 'wholeLifePolicyLoan': {
      const withLoan = state.assets.map((a) =>
        a.id === effect.assetId && a.assetType === 'wholeLifeInsurance' ? { ...a, policyLoanBalance: (a.policyLoanBalance ?? 0) + effect.amount } : a,
      )
      const assets = withLoan.map((a) => (a.assetType === 'cash' ? { ...a, value: a.value + effect.amount } : a))
      return { ...state, assets }
    }

    case 'wholeLifeWithdrawal': {
      const withdrawn = state.assets.map((a) => (a.id === effect.assetId && a.assetType === 'wholeLifeInsurance' ? { ...a, value: a.value - effect.amount } : a))
      const assets = withdrawn.map((a) => (a.assetType === 'cash' ? { ...a, value: a.value + effect.amount } : a))
      return { ...state, assets }
    }
  }
}
