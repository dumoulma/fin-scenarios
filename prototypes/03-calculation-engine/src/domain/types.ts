import type { YearMonth } from './dates.ts'

// --- Financial State ---
// Structurally close to prototype 01's Asset/Liability, extended with what
// calculation actually needs to simulate month over month (01 only needed a
// snapshot; this needs enough to amortize/compound/support policy loans).

export type RetirementWrapper = '401k' | 'rothIRA' | 'traditionalIRA'

export type Asset =
  | { kind: 'cash'; id: string; name: string; balance: number }
  | { kind: 'taxableBrokerage'; id: string; name: string; balance: number }
  | { kind: 'retirementAccount'; id: string; name: string; wrapper: RetirementWrapper; balance: number }
  | { kind: 'wholeLifeCashValue'; id: string; name: string; cashValue: number; policyLoanBalance: number }
  | { kind: 'realProperty'; id: string; name: string; marketValue: number }

export type AssetKind = Asset['kind']

export type Liability = {
  kind: 'mortgage'
  id: string
  name: string
  balance: number
  interestRate: number // annual
  monthlyPayment: number
  propertyAssetId: string
}

export type FinancialState = {
  asOf: YearMonth
  assets: Asset[]
  liabilities: Liability[]
}

/** + is an inflow to the monthly cash pool, - is an outflow. Purely informational —
 * the engine doesn't branch on `kind`, it's for the demo/tests to see what happened. */
export type Flow = { kind: string; amount: number; note?: string }

// --- Events ---
// EventTiming is reused verbatim from prototype 02; EventEffect is new — 02 kept
// Events purely descriptive since it didn't calculate anything.

export type EventTiming =
  | { kind: 'instantaneous'; at: YearMonth }
  | { kind: 'recurring'; from: YearMonth; until?: YearMonth }
  | { kind: 'durationBased'; from: YearMonth; until: YearMonth }

export type EventEffect =
  | { kind: 'cashDelta'; amount: number }
  | { kind: 'assetDelta'; assetId: string; amount: number }
  | { kind: 'sellProperty'; assetId: string }
  | { kind: 'buyProperty'; asset: Asset; downPaymentFromCash: number; mortgage?: Liability }
  | { kind: 'wholeLifePolicyLoan'; assetId: string; amount: number }
  | { kind: 'wholeLifeWithdrawal'; assetId: string; amount: number }

export type Event = {
  id: string
  name: string
  timing: EventTiming
  effect: EventEffect
}

// --- Ongoing circumstances ---
// Separate from Event per docs/domain/CONTEXT.md: "Scenarios may specify ongoing
// income circumstances... Significant one-time expenditures may be represented by
// Events."

export type IncomeCircumstance = { id: string; name: string; monthlyAmount: number; taxable: boolean }
export type SpendingCircumstance = { id: string; name: string; monthlyAmount: number }

// --- Policies ---

export type PolicyKind = 'spending' | 'maintainCashReserve' | 'payMortgage' | 'investSurplus'

export type Policy = { id: string; kind: PolicyKind; priority: number }

export type Parameters = Record<string, number>

// --- Scenario & Trajectory ---
// Same shape family as prototype 02 (id/name/start/end/policies/parameters), with
// events/income/spending added.

export type Scenario = {
  id: string
  name: string
  start: YearMonth
  end: YearMonth // inclusive
  income: IncomeCircumstance[]
  spending: SpendingCircumstance[]
  events: Event[]
  policies: Policy[]
  parameters: Parameters
}

export type Trajectory = {
  id: string
  name: string
  scenarios: Scenario[]
}

// --- Calculation ---

export type CalculationResult = {
  monthly: FinancialState[]
  annual: FinancialState[]
}

function assetValue(asset: Asset): number {
  switch (asset.kind) {
    case 'wholeLifeCashValue':
      return asset.cashValue - asset.policyLoanBalance
    case 'realProperty':
      return asset.marketValue
    default:
      return asset.balance
  }
}

/** Single-currency by design — 03's fixture is USD-only; multi-currency was already
 * proven learnable in prototype 01 and isn't this prototype's hypothesis. */
export function netWorth(state: FinancialState): number {
  const assetTotal = state.assets.reduce((sum, asset) => sum + assetValue(asset), 0)
  const liabilityTotal = state.liabilities.reduce((sum, liability) => sum + liability.balance, 0)
  return assetTotal - liabilityTotal
}
