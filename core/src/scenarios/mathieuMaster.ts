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

export const initialState: FinancialState = {
  asOf: '2026-08',
  reportingCurrency: 'USD',
  assets: [
    { id: CASH_ID, name: 'Cash (Chase + Wealthfront)', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 38_694.22 },
    // Listed before intlEtf so investSurplus's first-match-by-holdingContext lands
    // the "everything left over" catch-all here (task item 6's unspecified default).
    { id: SP500_ETF_ID, name: 'Schwab — S&P 500 ETF', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: SCHWAB_TAXABLE_BROKERAGE_TOTAL * 0.7, growthRate: 0.08, distributionRate: 0.015 },
    { id: INTL_ETF_ID, name: 'Schwab — International ETF', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: SCHWAB_TAXABLE_BROKERAGE_TOTAL * 0.3, growthRate: 0.06, distributionRate: 0.025 },
    { id: 'guideline-401k', name: 'Gusto/Guideline 401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 49_939.48 },
    { id: 'schwab-roth-ira', name: 'Charles Schwab — Roth IRA', assetType: 'equity', holdingContext: 'rothRetirement', country: 'US', currency: 'USD', value: 7_320.82 },
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
    // No interestRate/monthlyPayment: Kubera reports only the current balance, not
    // loan terms, so no scheduled amortization is modeled — the balance stays flat
    // until the condo sale pays it off at the end. Real household mortgage P&I is
    // assumed folded into the flat $7k/mo spending figure instead.
    { id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 388_327.21, linkedAssetId: CONDO_ID },
  ],
}

const GROSS_ANNUAL_SALARY = 270_000
const ANNUAL_BONUS = 27_000
const START = '2026-09'
const END = '2036-08' // 120 months — exactly 10 years from the import date

const policies: Policy[] = [
  { id: 'pol-401k-max', kind: 'contributeUpToLimit', priority: 1, targetHoldingContext: 'traditionalRetirement' },
  { id: 'pol-cash-reserve', kind: 'maintainCashReserve', priority: 2, targetAssetId: CASH_ID },
  { id: 'pol-sp500-dca', kind: 'contributeFixedAmount', priority: 3, targetAssetId: SP500_ETF_ID },
  { id: 'pol-intl-dca', kind: 'contributeFixedAmount', priority: 4, targetAssetId: INTL_ETF_ID },
  { id: 'pol-pua-max', kind: 'contributeToWholeLifePUA', priority: 5 },
  { id: 'pol-surplus', kind: 'investSurplus', priority: 6 },
]

function decemberBonusEvents(): { id: string; at: `${number}-${string}`; effect: { kind: 'oneTimeCashFlow'; amount: number } }[] {
  const events = []
  for (let year = 2026; year <= 2035; year++) {
    events.push({ id: `evt-bonus-${year}`, at: `${year}-12` as const, effect: { kind: 'oneTimeCashFlow' as const, amount: ANNUAL_BONUS } })
  }
  return events
}

export const mathieuMasterTrajectory = createTrajectory('Mathieu — Master (10yr)', [
  createScenario({
    name: 'Master Trajectory',
    start: START,
    end: END,
    events: [
      { id: 'evt-employment', at: START, effect: { kind: 'employmentStart', annualSalary: GROSS_ANNUAL_SALARY } },
      ...decemberBonusEvents(),
      { id: 'evt-sell-condo', at: END, effect: { kind: 'sellProperty', assetId: CONDO_ID, sellingFeeRate: 0.06 } },
    ],
    parameters: {
      spending: 7_000,
      taxRate: 0.32,
      cashApy: 0.04, // blended Chase/Wealthfront rate — not a real per-institution APY
      equityReturn: 0.07, // 401(k)/Roth IRA default; the two Schwab ETFs override this per-asset above
      equityDistributionRate: 0.015,
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
      [`${CASH_ID}CashReserveTarget`]: COMBINED_CASH_RESERVE_TARGET,
      [`${SP500_ETF_ID}FixedMonthlyAmount`]: 700,
      [`${INTL_ETF_ID}FixedMonthlyAmount`]: 300,
    },
    policies,
  }),
])
