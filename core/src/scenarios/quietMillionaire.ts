import { createScenario, createTrajectory } from '../domain/trajectory.ts'
import type { FinancialState, Policy, Scenario } from '../domain/types.ts'

// A 25-year-old, $0 net worth, no debt, average US salary, renting, "decent
// financial discipline" (3-month emergency cash reserve, otherwise saves to a
// 401(k)), a new job every 5 years until 65. The most vanilla quiet-millionaire
// life possible — the first real test case for the engine, not its ceiling.

export const initialState: FinancialState = {
  asOf: '2026-01',
  reportingCurrency: 'USD', assets: [
    { id: 'cash', name: 'Checking', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
    { id: '401k', name: '401(k)', assetType: 'equity', holdingContext: 'traditionalRetirement', country: 'US', currency: 'USD', value: 0 },
    { id: 'brokerage', name: 'Taxable Brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 },
  ],
  liabilities: [],
}

// A typical "50% match up to 6% of salary" employer match — the free money is
// worth taking before anything else, but the 401(k) isn't the only bucket:
// once the match is captured, the rest of the surplus overflows to the taxable
// brokerage (investSurplus), same cascade-to-specific-destinations shape as
// ProjectionLab.
const MATCH_RATE = 0.5
const MATCH_LIMIT_PERCENT_OF_SALARY = 0.06

const standardPolicies: Policy[] = [
  { id: 'pol-reserve', kind: 'maintainCashReserve', priority: 2 },
  { id: 'pol-401k-match', kind: 'contributeUpToMatch', priority: 3, targetHoldingContext: 'traditionalRetirement' },
  { id: 'pol-brokerage', kind: 'investSurplus', priority: 4, targetHoldingContext: 'taxableBrokerage' },
]

// Realistic career-earnings progression via job-hopping every 5 years — the raise
// mechanism is entirely "got a new job," no mid-job raises. Rent is folded into
// `spending` (no realProperty asset — renting has no first-class asset per
// docs/domain/CONTEXT.md's Housing section).
const JOBS = [
  { annualSalary: 50_000 },
  { annualSalary: 58_000 },
  { annualSalary: 65_000 },
  { annualSalary: 72_000 },
  { annualSalary: 78_000 },
  { annualSalary: 82_000 },
  { annualSalary: 85_000 },
  { annualSalary: 88_000 },
]

const SPENDING_RATE = 0.55 // fraction of gross salary — rent + everything else
const SHARED_PARAMETERS = {
  taxRate: 0.2,
  cashReserveMonths: 3,
  equityReturn: 0.07,
  cashApy: 0.02,
}

function buildJobScenario(index: number, annualSalary: number): Scenario {
  const startYear = 2026 + index * 5
  const start = `${startYear}-01`
  const end = `${startYear + 4}-12`
  return createScenario({
    name: `Job ${index + 1} ($${(annualSalary / 1000).toFixed(0)}k/yr)`,
    start,
    end,
    events: [
      {
        id: `evt-job-${index + 1}`,
        at: start,
        effect: { kind: 'employmentStart', annualSalary, matchRate: MATCH_RATE, matchLimitPercentOfSalary: MATCH_LIMIT_PERCENT_OF_SALARY },
      },
    ],
    parameters: { spending: (annualSalary * SPENDING_RATE) / 12, ...SHARED_PARAMETERS },
    policies: standardPolicies,
  })
}

export const quietMillionaireTrajectory = createTrajectory(
  'Quiet Millionaire',
  JOBS.map((job, i) => buildJobScenario(i, job.annualSalary)),
)
