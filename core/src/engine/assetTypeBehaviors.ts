import { compareYearMonth, type YearMonth } from '../domain/dates.ts'
import type { Asset, AssetType, Liability } from '../domain/types.ts'

export type GetParam = (name: string) => number

export type AssetBehaviorResult = { asset: Asset; cashFlow: number }

/**
 * Growth/appreciation/crediting stays internal to the asset (unrealized,
 * reinvested) — only genuine external cash movement is a `cashFlow` (e.g. an
 * equity distribution, per docs/test-scenarios.md #04: "not automatically
 * reinvested... appears as Cash rather than additional Equity"). This is the
 * actual test of "does the domain doc's Asset Type split hold up":
 * wholeLifeInsurance is just one more case in this switch, no special-casing.
 */
export function applyAssetTypeBehavior(asset: Asset, tick: YearMonth, getParam: GetParam): AssetBehaviorResult {
  const behavior = assetTypeBehaviors[asset.assetType]
  return behavior(asset, tick, getParam)
}

const assetTypeBehaviors: Record<AssetType, (asset: Asset, tick: YearMonth, getParam: GetParam) => AssetBehaviorResult> = {
  cash: (asset, _tick, getParam) => ({ asset: { ...asset, value: asset.value * (1 + getParam('cashApy') / 12) }, cashFlow: 0 }),
  fixedIncome: (asset, _tick, getParam) => ({ asset: { ...asset, value: asset.value * (1 + getParam('fixedIncomeReturn') / 12) }, cashFlow: 0 }),
  equity: (asset, _tick, getParam) => {
    const growthRate = asset.growthRateParameter ? getParam(asset.growthRateParameter) : (asset.growthRate ?? getParam('equityReturn'))
    const distributionRate = asset.distributionRateParameter ? getParam(asset.distributionRateParameter) : (asset.distributionRate ?? getParam('equityDistributionRate'))
    const grown = asset.value * (1 + growthRate / 12)
    const distribution = asset.value * (distributionRate / 12)
    return { asset: { ...asset, value: grown }, cashFlow: distribution }
  },
  realEstate: (asset, _tick, getParam) => ({ asset: { ...asset, value: asset.value * (1 + getParam('propertyAppreciation') / 12) }, cashFlow: 0 }),
  // Informed by a real participating whole life contract: premium is a mandatory
  // cost (not free growth), and unpaid loan interest compounds — a policy loan
  // isn't interest-free just because nothing repays it.
  wholeLifeInsurance: (asset, tick, getParam) => {
    const creditedGrowth = asset.value * (getParam('wholeLifeCreditingRate') / 12)
    const dividendAsPua = asset.value * (getParam('wholeLifeDividendRate') / 12)
    const fee = getParam('wholeLifePolicyFee') // a flat monthly fee, not an annual rate
    const value = asset.value + creditedGrowth + dividendAsPua - fee

    const loanRate = asset.loanRate ?? getParam('wholeLifeLoanRate')
    const policyLoanBalance = (asset.policyLoanBalance ?? 0) * (1 + loanRate / 12)

    const premiumDue = asset.premiumAmount && (!asset.premiumPayableThroughTick || compareYearMonth(tick, asset.premiumPayableThroughTick) <= 0) ? asset.premiumAmount / 12 : 0

    return { asset: { ...asset, value, policyLoanBalance }, cashFlow: premiumDue > 0 ? -premiumDue : 0 }
  },
}

/**
 * The regular scheduled payment (interest + principal) is mandatory, unlike the
 * `payMortgageExtra` policy which only handles *extra* principal from surplus.
 * Interest and principal both leave the household as cash — only the balance
 * reduction stays internal to the liability.
 */
export function applyLiabilityBehavior(liability: Liability, getParam: GetParam): { liability: Liability; cashFlow: number } {
  if (liability.kind !== 'mortgage' || liability.balance <= 0 || !liability.interestRate || !liability.monthlyPayment) {
    return { liability, cashFlow: 0 }
  }
  const monthlyInterest = liability.balance * (liability.interestRate / 12)
  const scheduledPayment = Math.min(liability.monthlyPayment, liability.balance + monthlyInterest)
  const principal = Math.max(0, scheduledPayment - monthlyInterest)

  return {
    liability: { ...liability, balance: liability.balance - principal },
    cashFlow: -scheduledPayment,
  }
}
