import type { Asset, Flow, Liability } from '../domain/types.ts'
import type { YearMonth } from '../domain/dates.ts'

export type GetParam = (name: string) => number

/**
 * Growth/appreciation/crediting stays inside the asset (unrealized, reinvested) —
 * only genuinely external cash movement becomes a Flow. This is the actual test of
 * whether Whole Life fits the same shape as everything else: it's just another case
 * in this switch, not a separate engine.
 */
export function applyAssetBehavior(asset: Asset, _month: YearMonth, getParam: GetParam): { asset: Asset; flows: Flow[] } {
  switch (asset.kind) {
    case 'cash': {
      const monthlyRate = getParam('cashApy') / 12
      return { asset: { ...asset, balance: asset.balance * (1 + monthlyRate) }, flows: [] }
    }
    case 'taxableBrokerage':
    case 'retirementAccount': {
      const monthlyRate = getParam('expectedReturn') / 12
      return { asset: { ...asset, balance: asset.balance * (1 + monthlyRate) }, flows: [] }
    }
    case 'realProperty': {
      const monthlyRate = getParam('propertyAppreciation') / 12
      return { asset: { ...asset, marketValue: asset.marketValue * (1 + monthlyRate) }, flows: [] }
    }
    case 'wholeLifeCashValue': {
      const creditedGrowth = asset.cashValue * (getParam('wholeLifeCreditingRate') / 12)
      const dividendAsPua = asset.cashValue * (getParam('wholeLifeDividendRate') / 12)
      const fee = getParam('wholeLifePolicyFee') // a flat monthly fee, not an annual rate
      const cashValue = asset.cashValue + creditedGrowth + dividendAsPua - fee
      return { asset: { ...asset, cashValue }, flows: [] }
    }
  }
}

/**
 * The regular scheduled payment (interest + principal) is mandatory, unlike the
 * `payMortgage` policy which only handles *extra* principal from surplus. Interest
 * and principal both leave the household as cash — only the balance reduction stays
 * internal to the liability.
 */
export function applyLiabilityBehavior(liability: Liability, _month: YearMonth, getParam: GetParam): { liability: Liability; flows: Flow[] } {
  if (liability.balance <= 0) return { liability, flows: [] }

  const monthlyInterest = liability.balance * (liability.interestRate / 12)
  const scheduledPayment = Math.min(liability.monthlyPayment, liability.balance + monthlyInterest)
  const principal = Math.max(0, scheduledPayment - monthlyInterest)

  return {
    liability: { ...liability, balance: liability.balance - principal },
    flows: [{ kind: 'mortgagePayment', amount: -scheduledPayment }],
  }
}
