import { createScenario, createTrajectory } from '../domain/trajectory.ts'
import type { FinancialState, Policy } from '../domain/types.ts'

// Mathieu's real 10-year Master Trajectory: a single Scenario built from his real
// Kubera-imported portfolio (balances as of the 2026-08 live import — see
// docs/handover-master-scenario.md), matching his real policy stack in priority
// order. Unlike quietMillionaire.ts, this Initial State is hand-entered from a
// real import rather than synthetic, because the importer intentionally collapses
// ticker-level detail (docs/kubera-mapping-overrides-notes.md's "prefer loss of
// detail" rule) and doesn't produce the two separate ETF positions this Scenario
// needs — see the Schwab ETF split below.

const CASH_ID = 'cash'
const SP500_ETF_ID = 'sp500Etf'
const INTL_ETF_ID = 'intlEtf'
const CONDO_ID = 'condo'
const GUARDIAN_WL_ID = 'guardian-wl'

// Chase ($20k target) + Wealthfront ($25k target, HYSA) were originally meant to be
// two independent cash reserves, but the live importer aggregates every cash
// account into one Asset (docs/handover-master-scenario.md's gap #3) and Mathieu's
// call, once that tradeoff was surfaced, was to keep it simple: one combined cash
// Asset with one flat $45k target, not a per-institution split.
const COMBINED_CASH_RESERVE_TARGET = 45_000

// The combined Schwab taxable brokerage balance ($166,011.11 as of the live import)
// has no per-ticker breakdown available (Kubera's individual ETF holdings are
// intentionally ignored by the importer) — split 70/30 here as a reasonable
// approximation of the real S&P 500 / international mix, not the real per-ticker
// balances.
const SCHWAB_TAXABLE_BROKERAGE_TOTAL = 166_011.11

// Real 15-year fixed mortgage: originated 6/2026 at 3.99%, $398,000 remaining as of
// the 8/2026 snapshot (2 months elapsed, 178 of the original 180 months left).
// Kubera itself only reports the current balance, not loan terms, so the rate/term
// are Mathieu's own figures, not importer output — monthlyPayment is the standard
// amortization payment for that balance/rate/remaining-term, not a guess.
const MORTGAGE_BALANCE = 398_000
const MORTGAGE_ANNUAL_RATE = 0.0399
const MORTGAGE_MONTHLY_PAYMENT = 2_966.13

export const initialState: FinancialState = {
  asOf: '2026-08',
  reportingCurrency: 'USD',
  assets: [
    { id: CASH_ID, name: 'Cash (Chase + Wealthfront)', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 38_694.22 },
    // Listed before intlEtf so investSurplus's first-match-by-holdingContext lands
    // the "everything left over" catch-all here (task item 6's unspecified default).
    { id: SP500_ETF_ID, name: 'Schwab — S&P 500 ETF', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: SCHWAB_TAXABLE_BROKERAGE_TOTAL * 0.7, growthRate: 0.05, distributionRate: 0.015 },
    { id: INTL_ETF_ID, name: 'Schwab — International ETF', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: SCHWAB_TAXABLE_BROKERAGE_TOTAL * 0.3, growthRate: 0.05, distributionRate: 0.025 },
    // Assumed invested 70/30 US/international, same as the taxable Schwab account —
    // real growth rates are equal (5%/5%) so the blend is just 0.05; only the
    // distribution yield actually changes with the mix (0.7*1.5% + 0.3*2.5%).
    { id: 'guideline-401k', name: 'Gusto/Guideline 401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 49_939.48, growthRate: 0.05, distributionRate: 0.018 },
    // Modeled as fixed income (bonds), not equity — per Mathieu, at a generous 1%
    // real return. fixedIncome's asset-type behavior has no per-asset growthRate
    // override (only equity does), so this rate is set via the scenario-level
    // fixedIncomeReturn parameter below; fine since this is the only fixedIncome
    // Asset in the Scenario.
    { id: 'schwab-roth-ira', name: 'Charles Schwab — Roth IRA', assetType: 'fixedIncome', holdingContext: 'rothRetirement', country: 'US', currency: 'USD', value: 7_320.82 },
    { id: CONDO_ID, name: '530 Gregory Ave c311', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 673_200 },
    // premiumAmount is the real $1,500/mo Guardian modal premium (Guard-O-Matic),
    // confirmed against Mathieu's actual inforce illustration — NOT a separate
    // "policy fee" on top of it (an earlier draft of this scenario's spec assumed
    // that split; corrected once the real illustration was checked). No
    // premiumPayableThroughTick: the illustration doesn't switch to Premium Offset
    // until policy year 28 (2049), well past this 10-year window.
    { id: GUARDIAN_WL_ID, name: 'Guardian Life — Whole Life 95', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 166_780.55, premiumAmount: 18_000 },
  ],
  liabilities: [
    {
      id: 'mortgage',
      name: 'Mortgage',
      kind: 'mortgage',
      balance: MORTGAGE_BALANCE,
      linkedAssetId: CONDO_ID,
      interestRate: MORTGAGE_ANNUAL_RATE,
      monthlyPayment: MORTGAGE_MONTHLY_PAYMENT,
    },
  ],
}

const GROSS_ANNUAL_SALARY = 270_000
const ANNUAL_BONUS_GROSS = 27_000
// Supplemental-wage withholding on a bonus is a real, distinct rate from ordinary
// income tax (this household's flat 32%) — per Mathieu, 34%.
const BONUS_TAX_RATE = 0.34
const START = '2026-09'
const WORKING_END = '2036-07' // last month before the condo sale
const SALE_MONTH = '2036-08' // 120th month — exactly 10 years from the import date
const POST_SALE_CASH_TARGET = 500_000 // per Mathieu: keep $500k of the sale proceeds liquid, not swept into the ETFs

const policies: Policy[] = [
  { id: 'pol-401k-max', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'traditionalRetirement' },
  { id: 'pol-cash-reserve', kind: 'maintainCashReserve', priority: 2, targetAssetId: CASH_ID },
  { id: 'pol-sp500-dca', kind: 'contributeFixedAmount', priority: 3, targetAssetId: SP500_ETF_ID },
  { id: 'pol-intl-dca', kind: 'contributeFixedAmount', priority: 4, targetAssetId: INTL_ETF_ID },
  // contributeToWholeLifePUAAnnually, not the plain contributeToWholeLifePUA: the
  // real PUA rider's cap resets on Guardian's April policy anniversary, not the
  // calendar year, and (per Mathieu) it's normally funded from the December bonus
  // rather than smoothed evenly across paychecks — this policy claims no more than
  // one real annual cap, with no monthly division, and resetMonth: 4 tracks that
  // cap against the real policy year instead of January.
  { id: 'pol-pua-annual', kind: 'contributeToWholeLifePUAAnnually', priority: 5, resetMonth: 4 },
  { id: 'pol-surplus', kind: 'investSurplus', priority: 6 },
  // Sweeps whatever sits above the $45k cash target (mainly interest drift, now
  // that the December bonus routes through bonusIncome/the pool instead of
  // landing straight in cash) into the same 70/30 split as the Schwab DCA above.
  // Fractions 0.7 then 1.0 split the excess 70/30 — see sweepCashAboveTarget's
  // own comment in engine/policies.ts for why that pair of fractions works
  // without the two Policies needing to share any state.
  { id: 'pol-sweep-sp500', kind: 'sweepCashAboveTarget', priority: 7, sourceAssetId: CASH_ID, targetAssetId: SP500_ETF_ID },
  { id: 'pol-sweep-intl', kind: 'sweepCashAboveTarget', priority: 8, sourceAssetId: CASH_ID, targetAssetId: INTL_ETF_ID },
]

function decemberBonusEvents(): { id: string; at: `${number}-${string}`; effect: { kind: 'bonusIncome'; grossAmount: number; taxRate: number } }[] {
  const events = []
  for (let year = 2026; year <= 2035; year++) {
    events.push({ id: `evt-bonus-${year}`, at: `${year}-12` as const, effect: { kind: 'bonusIncome' as const, grossAmount: ANNUAL_BONUS_GROSS, taxRate: BONUS_TAX_RATE } })
  }
  return events
}

// Shared by both Scenarios below — only cashCashReserveTarget differs (see
// POST_SALE_CASH_TARGET), which is why the sale gets its own one-month Scenario
// rather than a mid-Scenario event: a Scenario Parameter is constant for the
// Scenario it belongs to, so "the reserve target jumps once the condo sells" has
// to be a Scenario boundary, the same mechanism quietMillionaire.ts already uses
// for its once-every-5-years raises.
const sharedParameters = {
  spending: 7_000,
  taxRate: 0.32,
  cashApy: 0.02, // per Mathieu: blended real rate of the combined Chase + Wealthfront balance
  equityReturn: 0.07, // unused by any Asset here (every equity Asset now has its own growthRate/distributionRate) — kept as a domain-required fallback
  equityDistributionRate: 0.015,
  fixedIncomeReturn: 0.01, // per Mathieu: Roth IRA as bonds, "1% real (generous?)"
  propertyAppreciation: 0.03,
  // Whole Life: real crediting/dividend rates aren't in the illustration's
  // narrative summary (only the resulting cash-value schedule is), so these are
  // conventional participating-WL placeholders, same as prior sessions' tests.
  wholeLifeCreditingRate: 0.04,
  wholeLifeDividendRate: 0.015,
  wholeLifePolicyFee: 0, // real premium is modeled via Asset.premiumAmount above; no separate admin fee figure is known
  wholeLifeLoanRate: 0.05, // real fixed rate per the illustration; unused (no loan events in this Scenario)
  wholeLifePuaAnnualMax: 22_000, // per Mathieu: "about 22k for these years (just below MEC limit)" — the illustration's actual unscheduled-PUA cap varies ~$21.5k-$23.2k year to year; held flat here
  wholeLifePuaChargeRate: 0.10, // per Mathieu: "PUA fee is 10%, so 90% goes to cash value"
  traditionalRetirementAnnualLimit: 24_500, // approximate 2026 IRS 401(k) employee deferral limit — verify before relying on this figure
  [`${SP500_ETF_ID}FixedMonthlyAmount`]: 700,
  [`${INTL_ETF_ID}FixedMonthlyAmount`]: 300,
  [`${SP500_ETF_ID}SweepFraction`]: 0.7,
  [`${INTL_ETF_ID}SweepFraction`]: 1.0,
}

export const mathieuMasterTrajectory = createTrajectory('Mathieu — Master (10yr)', [
  createScenario({
    name: 'Working',
    start: START,
    end: WORKING_END,
    events: [{ id: 'evt-employment', at: START, effect: { kind: 'employmentStart', annualSalary: GROSS_ANNUAL_SALARY } }, ...decemberBonusEvents()],
    parameters: { ...sharedParameters, [`${CASH_ID}CashReserveTarget`]: COMBINED_CASH_RESERVE_TARGET },
    policies,
  }),
  createScenario({
    name: 'Sell condo & settle',
    start: SALE_MONTH,
    end: SALE_MONTH,
    events: [
      // Employment doesn't carry across a Scenario boundary (activeAnnualSalaryAt
      // only scans the current Scenario's own events) — re-declared here so this
      // final month still counts as active employment, same pattern
      // quietMillionaire.ts uses for each new job Scenario.
      { id: 'evt-employment-final-month', at: SALE_MONTH, effect: { kind: 'employmentStart', annualSalary: GROSS_ANNUAL_SALARY } },
      { id: 'evt-sell-condo', at: SALE_MONTH, effect: { kind: 'sellProperty', assetId: CONDO_ID, sellingFeeRate: 0.06 } },
    ],
    parameters: { ...sharedParameters, [`${CASH_ID}CashReserveTarget`]: POST_SALE_CASH_TARGET },
    policies,
  }),
])
