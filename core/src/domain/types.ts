import type { YearMonth } from './dates.ts'

// --- Asset Type & Holding Context (two separate axes, per docs/domain/CONTEXT.md's
// "Asset Type" / "Asset Holding Context" split) ---

export type AssetType = 'cash' | 'fixedIncome' | 'equity' | 'realEstate' | 'wholeLifeInsurance'

export type HoldingContext = 'none' | 'taxableBrokerage' | 'traditionalRetirement' | 'rothRetirement' | 'hsa'

export type Asset = {
  id: string
  name: string
  assetType: AssetType
  holdingContext: HoldingContext
  value: number
  /** Only meaningful when assetType is 'wholeLifeInsurance' — a policy loan reduces
   * the death benefit/available cash value without reducing `value` itself. */
  policyLoanBalance?: number
  /** Per-asset overrides for the Scenario-level economic parameter of the same
   * behavior (e.g. `equityReturn`) — lets two positions of the same Asset Type
   * (docs/test-scenarios.md #20: an S&P 500 fund vs. a high-dividend fund) grow
   * and distribute differently. Falls back to the Scenario parameter when absent. */
  growthRate?: number
  distributionRate?: number
  /** Only meaningful for wholeLifeInsurance — this contract's own premium
   * schedule. A real policy's premium is a mandatory cost, not free growth;
   * absent means no premium is due (e.g. an already paid-up policy). */
  premiumAmount?: number // annual
  premiumPayableThroughTick?: YearMonth // last month premium is due, inclusive
  /** Only meaningful for wholeLifeInsurance — overrides the wholeLifeLoanRate
   * Scenario Parameter, since a real policy's loan rate is fixed by contract. */
  loanRate?: number
}

export type Liability = {
  id: string
  name: string
  kind: 'mortgage' | 'other'
  balance: number
  interestRate?: number
  monthlyPayment?: number
  /** For a mortgage: the realEstate Asset it's secured against. */
  linkedAssetId?: string
}

export type FinancialState = {
  asOf: YearMonth
  assets: Asset[]
  liabilities: Liability[]
}

/** Structurally identical to FinancialState — kept as a distinct name because the
 * domain doc treats it as a conceptually distinct thing (the starting point for
 * calculation, not a mid-calculation snapshot). */
export type InitialState = FinancialState

// --- Events & Event Types ---
// An Event is one timestamp + an effect. Recurrence/duration is *behavior a specific
// Event Type implements* (see engine/eventTypeBehaviors.ts), never data on the Event
// record itself — docs/domain/CONTEXT.md's "Event" / "Event Type" split.

export type EventEffect =
  | { kind: 'employmentStart'; annualSalary: number; matchRate?: number; matchLimitPercentOfSalary?: number }
  | { kind: 'employmentEnd' }
  | { kind: 'oneTimeCashFlow'; amount: number } // + inflow, - outflow
  | { kind: 'buyProperty'; asset: Asset; downPayment: number; transactionCost?: number; mortgage?: Liability }
  | { kind: 'sellProperty'; assetId: string }
  | { kind: 'wholeLifePolicyLoan'; assetId: string; amount: number }
  | { kind: 'wholeLifeWithdrawal'; assetId: string; amount: number }

export type Event = {
  id: string
  at: YearMonth
  effect: EventEffect
}

// --- Scenario Parameters & Policies ---

export type ScenarioParameters = {
  spending: number // monthly, aggregate — not a household budget (per CONTEXT.md)
  taxRate: number // flat, approximate — not a tax-optimization engine
  [economicParameter: string]: number // inflation, equityReturn, cashApy, etc.
}

export type PolicyKind =
  | 'spending'
  | 'maintainCashReserve'
  | 'contributeUpToMatch'
  | 'contributeUpToLimit'
  | 'payMortgageExtra'
  | 'investSurplus'
  | 'fundDeficitFromCash'
  | 'fundDeficitFromWholeLifeLoan'
  | 'fundDeficitFromEquitySale'
  | 'fundDeficitFromDebt'
  | 'contributeToWholeLifePUA'

// targetHoldingContext is what makes contributeUpToMatch/contributeUpToLimit generic:
// the same policy kind serves a 401(k), a Roth 401(k), an IRA, or an HSA by aiming at
// a different real destination bucket, not by inventing a policy kind per account type.
export type Policy = {
  id: string
  kind: PolicyKind
  priority: number
  targetHoldingContext?: HoldingContext
}

// --- Scenario & Trajectory ---

export type Scenario = {
  id: string
  name: string
  start: YearMonth
  end: YearMonth // inclusive
  events: Event[]
  parameters: ScenarioParameters
  policies: Policy[]
}

export type Trajectory = {
  id: string
  name: string
  /** Ordered, contiguous, non-empty. Bounds are derived — never stored separately. */
  scenarios: Scenario[]
}

export type Workspace = {
  master: Trajectory
  alternatives: Trajectory[]
}

export function trajectoryStart(trajectory: Trajectory): YearMonth {
  return trajectory.scenarios[0]!.start
}

export function trajectoryEnd(trajectory: Trajectory): YearMonth {
  return trajectory.scenarios.at(-1)!.end
}

// --- Calculation Result ---

export type CalculationResult = {
  monthly: FinancialState[]
  annual: FinancialState[]
}

export function netWorth(state: FinancialState): number {
  // A Whole Life policy loan reduces the death benefit/surrender value without
  // reducing `value` itself (docs/domain/CONTEXT.md's cash-value/loan-balance
  // asymmetry) — it's still a real claim against the policy and must count here.
  const assetTotal = state.assets.reduce((sum, asset) => sum + asset.value - (asset.policyLoanBalance ?? 0), 0)
  const liabilityTotal = state.liabilities.reduce((sum, liability) => sum + liability.balance, 0)
  return assetTotal - liabilityTotal
}
