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
  /** ISO 3166-1 alpha-2 country code for the asset's jurisdiction. */
  country: string
  /** ISO 4217 currency code in which `value` is denominated. */
  currency: string
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
  /** Like growthRate/distributionRate, but names a Scenario Parameter to read via
   * getParam instead of a literal value — takes priority over the literal field
   * if both are set. A literal override is a fixed number forever; a Monte Carlo
   * stochastic Input Generator only ever drives getParam-sourced values, so an
   * Asset that needs to be randomized (rather than pinned) has to go through a
   * named parameter instead of a literal growthRate/distributionRate. */
  growthRateParameter?: string
  distributionRateParameter?: string
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
  /** Currency used for values that the engine can combine in this Financial State. */
  reportingCurrency: string
  assets: Asset[]
  liabilities: Liability[]
}

/** Structurally identical to FinancialState — kept as a distinct name because the
 * domain doc treats it as a conceptually distinct thing (the starting point for
 * calculation, not a mid-calculation snapshot). */
export type InitialState = FinancialState

export class CurrencyInvariantError extends Error {}

export function assertFinancialStateCurrency(state: FinancialState): void {
  const nonReportingAsset = state.assets.find((asset) => asset.currency !== state.reportingCurrency)
  if (nonReportingAsset) {
    throw new CurrencyInvariantError(
      `Asset "${nonReportingAsset.name}" is denominated in ${nonReportingAsset.currency}, but this Financial State reports in ${state.reportingCurrency}; an FX conversion is required before calculation`,
    )
  }
}

// --- Events & Event Types ---
// An Event is one timestamp + an effect. Recurrence/duration is *behavior a specific
// Event Type implements* (see engine/eventTypeBehaviors.ts), never data on the Event
// record itself — docs/domain/CONTEXT.md's "Event" / "Event Type" split.

export type EventEffect =
  | { kind: 'employmentStart'; annualSalary: number; matchRate?: number; matchLimitPercentOfSalary?: number }
  | { kind: 'employmentEnd' }
  // Unconditional and untaxed — correct for a gift, inheritance, or other windfall
  // that shouldn't compete with Policies for priority or be treated as earned
  // income. See bonusIncome below for the earned-income counterpart.
  | { kind: 'oneTimeCashFlow'; amount: number } // + inflow, - outflow
  // Earned income (a bonus), unlike oneTimeCashFlow: flows into the same monthly
  // pool as salary so Policies can compete for it in priority order, taxed at its
  // own rate rather than the household's flat taxRate — real supplemental-wage
  // withholding differs from ordinary income tax.
  | { kind: 'bonusIncome'; grossAmount: number; taxRate: number }
  | { kind: 'buyProperty'; asset: Asset; downPayment: number; transactionCost?: number; mortgage?: Liability }
  | { kind: 'sellProperty'; assetId: string; sellingFeeRate?: number }
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
  | 'maintainCashReserve'
  | 'contributeUpToMatch'
  | 'contributeUpToLimit'
  | 'contributeFixedAmount'
  | 'payMortgageExtra'
  | 'investSurplus'
  | 'fundDeficitFromCash'
  | 'fundDeficitFromWholeLifeLoan'
  | 'fundDeficitFromEquitySale'
  | 'fundDeficitFromFixedIncomeSale'
  | 'fundDeficitFromDebt'
  | 'contributeToWholeLifePUA'
  | 'contributeToWholeLifePUAAnnually'
  | 'sweepCashAboveTarget'

// targetHoldingContext is what makes contributeUpToMatch/contributeUpToLimit generic:
// the same policy kind serves a 401(k), a Roth 401(k), an IRA, or an HSA by aiming at
// a different real destination bucket, not by inventing a policy kind per account type.
// targetAssetId lets maintainCashReserve target one specific named cash Asset (e.g.
// "keep $20k at Chase, independently of $25k at Wealthfront") instead of always the
// first cash Asset found — absent, it falls back to that original behavior unchanged.
// sourceAssetId is sweepCashAboveTarget's counterpart to targetAssetId: the Asset
// being swept FROM (targetAssetId is swept TO).
// resetMonth governs when a policy's own slice of ctx.annualContributions clears —
// absent means January (calendar-year caps like 401(k)/IRA limits), but a real
// account can run on its own anniversary (e.g. a Whole Life rider's policy-year
// cap resetting every April) — each policy's own key resets independently, never
// a single blanket wipe of every cap at once.
export type Policy = {
  id: string
  kind: PolicyKind
  priority: number
  targetHoldingContext?: HoldingContext
  targetAssetId?: string
  sourceAssetId?: string
  resetMonth?: number
}

// --- Spending Policy ---
// docs/design/dynamic-spending.md: Spending remains a Scenario Parameter; a
// Spending Policy is simply a way of determining its value for a calculation
// period. Fixed spending (the default, `Scenario.spendingPolicy` absent) needs
// none of this — it behaves exactly as `parameters.spending` always has.

export type SpendingPolicyKind = 'percentOfPortfolio' | 'guardrails'

export type SpendingPolicy = {
  kind: SpendingPolicyKind
  /** How often the amount is recomputed — 1 = monthly, 3 = quarterly, 12 = annually. */
  cadenceMonths: number
  /** The starting monthly-equivalent amount, in effect until the first recompute. */
  baseAnnualSpending: number
  /** percentOfPortfolio only — annual withdrawal as a fraction of the investable portfolio. */
  withdrawalPercent?: number
  /** guardrails only — annualized withdrawal-rate bands and the adjustment applied when crossed. */
  upperGuardrail?: number
  lowerGuardrail?: number
  adjustmentPercent?: number
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
  spendingPolicy?: SpendingPolicy
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
  assertFinancialStateCurrency(state)
  // A Whole Life policy loan reduces the death benefit/surrender value without
  // reducing `value` itself (docs/domain/CONTEXT.md's cash-value/loan-balance
  // asymmetry) — it's still a real claim against the policy and must count here.
  const assetTotal = state.assets.reduce((sum, asset) => sum + asset.value - (asset.policyLoanBalance ?? 0), 0)
  const liabilityTotal = state.liabilities.reduce((sum, liability) => sum + liability.balance, 0)
  return assetTotal - liabilityTotal
}
