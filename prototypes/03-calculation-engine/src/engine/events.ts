import { compareYearMonth, type YearMonth } from '../domain/dates.ts'
import type { Event, FinancialState } from '../domain/types.ts'

export function isEventActive(event: Event, month: YearMonth): boolean {
  switch (event.timing.kind) {
    case 'instantaneous':
      return event.timing.at === month
    case 'recurring':
      if (compareYearMonth(month, event.timing.from) < 0) return false
      if (event.timing.until && compareYearMonth(month, event.timing.until) > 0) return false
      return true
    case 'durationBased':
      return compareYearMonth(month, event.timing.from) >= 0 && compareYearMonth(month, event.timing.until) <= 0
  }
}

/** Events are unconditional — they create/remove/adjust positions exactly as
 * specified, never gated or redirected by Policies (unlike ongoing income/spending). */
export function applyEvent(state: FinancialState, event: Event): FinancialState {
  const effect = event.effect

  switch (effect.kind) {
    case 'cashDelta': {
      const assets = state.assets.map((a) => (a.kind === 'cash' ? { ...a, balance: a.balance + effect.amount } : a))
      return { ...state, assets }
    }

    case 'assetDelta': {
      const assets = state.assets.map((a) => {
        if (a.id !== effect.assetId) return a
        if (a.kind === 'wholeLifeCashValue') return { ...a, cashValue: a.cashValue + effect.amount }
        if (a.kind === 'realProperty') return { ...a, marketValue: a.marketValue + effect.amount }
        return { ...a, balance: a.balance + effect.amount }
      })
      return { ...state, assets }
    }

    case 'sellProperty': {
      const property = state.assets.find((a) => a.id === effect.assetId)
      if (!property || property.kind !== 'realProperty') return state
      const mortgage = state.liabilities.find((l) => l.propertyAssetId === effect.assetId)
      const netProceeds = property.marketValue - (mortgage?.balance ?? 0)
      const assets = state.assets
        .filter((a) => a.id !== effect.assetId)
        .map((a) => (a.kind === 'cash' ? { ...a, balance: a.balance + netProceeds } : a))
      const liabilities = state.liabilities.filter((l) => l.propertyAssetId !== effect.assetId)
      return { ...state, assets, liabilities }
    }

    case 'buyProperty': {
      const assets = state.assets
        .map((a) => (a.kind === 'cash' ? { ...a, balance: a.balance - effect.downPaymentFromCash } : a))
        .concat(effect.asset)
      const liabilities = effect.mortgage ? [...state.liabilities, effect.mortgage] : state.liabilities
      return { ...state, assets, liabilities }
    }

    case 'wholeLifePolicyLoan': {
      const withLoan = state.assets.map((a) =>
        a.id === effect.assetId && a.kind === 'wholeLifeCashValue' ? { ...a, policyLoanBalance: a.policyLoanBalance + effect.amount } : a,
      )
      const assets = withLoan.map((a) => (a.kind === 'cash' ? { ...a, balance: a.balance + effect.amount } : a))
      return { ...state, assets }
    }

    case 'wholeLifeWithdrawal': {
      const withdrawn = state.assets.map((a) =>
        a.id === effect.assetId && a.kind === 'wholeLifeCashValue' ? { ...a, cashValue: a.cashValue - effect.amount } : a,
      )
      const assets = withdrawn.map((a) => (a.kind === 'cash' ? { ...a, balance: a.balance + effect.amount } : a))
      return { ...state, assets }
    }
  }
}
