export type RetirementWrapper = '401k' | 'rothIRA' | 'traditionalIRA'

export type Asset =
  | { kind: 'cash'; id: string; name: string; balance: number; currency: string }
  | { kind: 'taxableBrokerage'; id: string; name: string; balance: number; currency: string }
  | {
      kind: 'retirementAccount'
      id: string
      name: string
      wrapper: RetirementWrapper
      balance: number
      currency: string
    }
  | { kind: 'wholeLifeCashValue'; id: string; name: string; cashValue: number; currency: string }
  | { kind: 'realProperty'; id: string; name: string; marketValue: number; currency: string }

export type AssetKind = Asset['kind']

export type Liability = {
  kind: 'mortgage'
  id: string
  name: string
  balance: number
  currency: string
}

export type LiabilityKind = Liability['kind']

export type InitialState = {
  asOf: string
  assets: Asset[]
  liabilities: Liability[]
}

function assetValue(asset: Asset): number {
  switch (asset.kind) {
    case 'wholeLifeCashValue':
      return asset.cashValue
    case 'realProperty':
      return asset.marketValue
    default:
      return asset.balance
  }
}

function addTo(totals: Record<string, number>, currency: string, amount: number): void {
  totals[currency] = (totals[currency] ?? 0) + amount
}

/**
 * Real Kubera snapshots hold multiple currencies at once (e.g. a USD brokerage
 * alongside a CAD checking account). Summing raw amounts across currencies would
 * silently produce a meaningless number, so net worth is reported per currency —
 * converting to one reporting currency is an explicit out-of-scope FX concern.
 */
export function netWorthByCurrency(state: InitialState): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const asset of state.assets) addTo(totals, asset.currency, assetValue(asset))
  for (const liability of state.liabilities) addTo(totals, liability.currency, -liability.balance)
  return totals
}
