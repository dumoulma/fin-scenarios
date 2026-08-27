import type { Event, FinancialState, Scenario, Trajectory } from './domain/types.ts'

// docs/prototypes/03-calculation-engine.md's suggested end-to-end fixture:
// 2026–2032 Working in USA -> 2033 one year travelling -> 2034–2040 Retirement in
// Japan, with a property sale and a large one-time expenditure along the way.

export const initialState: FinancialState = {
  asOf: '2026-01',
  assets: [
    { kind: 'cash', id: 'cash', name: 'Checking + HYSA', balance: 30000 },
    { kind: 'taxableBrokerage', id: 'brokerage', name: 'Taxable brokerage', balance: 150000 },
    { kind: 'retirementAccount', id: '401k', name: '401(k)', wrapper: '401k', balance: 200000 },
    { kind: 'realProperty', id: 'home', name: 'Primary residence', marketValue: 600000 },
    { kind: 'wholeLifeCashValue', id: 'whole-life', name: 'Whole Life cash value', cashValue: 20000, policyLoanBalance: 0 },
  ],
  liabilities: [
    { kind: 'mortgage', id: 'mortgage-home', name: 'Mortgage on primary residence', balance: 450000, interestRate: 0.06, monthlyPayment: 2700, propertyAssetId: 'home' },
  ],
}

const commonParameters = {
  incomeTaxRate: 0.25,
  expectedReturn: 0.07,
  cashApy: 0.02,
  propertyAppreciation: 0.03,
  cashReserveTarget: 20000,
  wholeLifeCreditingRate: 0.04,
  wholeLifeDividendRate: 0.015,
  wholeLifePolicyFee: 50,
}

const workingInUsa: Scenario = {
  id: 'scn-working-usa',
  name: 'Working in USA',
  start: '2026-01',
  end: '2032-12',
  income: [{ id: 'inc-salary', name: 'Salary', monthlyAmount: 270000 / 12, taxable: true }],
  spending: [{ id: 'spend-normal', name: 'Normal spending', monthlyAmount: 8000 }],
  events: [
    // a large one-time expenditure to exercise Event-driven cash effects
    { id: 'evt-renovation', name: 'Kitchen renovation', timing: { kind: 'instantaneous', at: '2029-06' }, effect: { kind: 'cashDelta', amount: -40000 } },
  ],
  policies: [
    { id: 'pol-spend', kind: 'spending', priority: 1 },
    { id: 'pol-reserve', kind: 'maintainCashReserve', priority: 2 },
    { id: 'pol-mortgage', kind: 'payMortgage', priority: 3 },
    { id: 'pol-invest', kind: 'investSurplus', priority: 4 },
  ],
  parameters: commonParameters,
}

const travelingTheWorld: Scenario = {
  id: 'scn-travel',
  name: 'Travel around the world',
  start: '2033-01',
  end: '2033-12',
  income: [],
  spending: [{ id: 'spend-travel', name: 'Elevated travel spending', monthlyAmount: 12000 }],
  events: [],
  policies: [{ id: 'pol-spend-travel', kind: 'spending', priority: 1 }],
  parameters: { ...commonParameters, expectedReturn: 0.05 },
}

const retirementEvents: Event[] = [
  // sell the US property while retired in Japan
  { id: 'evt-sell-home', name: 'Sell primary residence', timing: { kind: 'instantaneous', at: '2034-06' }, effect: { kind: 'sellProperty', assetId: 'home' } },
  // Social Security begins partway through retirement — a recurring cash inflow
  { id: 'evt-social-security', name: 'Social Security begins', timing: { kind: 'recurring', from: '2036-01' }, effect: { kind: 'cashDelta', amount: 2500 } },
  // portfolio withdrawal funding retirement spending — composed from two generic
  // effects (asset decreases, cash increases) rather than a dedicated effect kind
  { id: 'evt-401k-draw', name: '401(k) withdrawal', timing: { kind: 'recurring', from: '2034-07' }, effect: { kind: 'assetDelta', assetId: '401k', amount: -3000 } },
  { id: 'evt-401k-draw-cash', name: '401(k) withdrawal (cash side)', timing: { kind: 'recurring', from: '2034-07' }, effect: { kind: 'cashDelta', amount: 3000 } },
  // Whole Life as a secondary source, later in retirement
  { id: 'evt-whole-life-withdrawal', name: 'Whole Life withdrawal', timing: { kind: 'instantaneous', at: '2038-03' }, effect: { kind: 'wholeLifeWithdrawal', assetId: 'whole-life', amount: 15000 } },
]

const retirementInJapan: Scenario = {
  id: 'scn-retirement-japan',
  name: 'Retirement in Japan',
  start: '2034-01',
  end: '2040-12',
  income: [],
  spending: [{ id: 'spend-retirement', name: 'Retirement spending', monthlyAmount: 9000 }],
  events: retirementEvents,
  policies: [
    { id: 'pol-spend-retire', kind: 'spending', priority: 1 },
    { id: 'pol-reserve-retire', kind: 'maintainCashReserve', priority: 2 },
    { id: 'pol-invest-retire', kind: 'investSurplus', priority: 3 },
  ],
  parameters: { ...commonParameters, expectedReturn: 0.05 },
}

export const fixtureTrajectory: Trajectory = {
  id: 'traj-master',
  name: 'Master',
  scenarios: [workingInUsa, travelingTheWorld, retirementInJapan],
}
