import type { FinancialState, Policy, Scenario } from '../../../03-calculation-engine/src/domain/types.ts'
import { createScenario, createTrajectory } from './trajectoryOps.ts'

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

const parameters = {
  incomeTaxRate: 0.25,
  expectedReturn: 0.07,
  cashApy: 0.02,
  propertyAppreciation: 0.03,
  cashReserveTarget: 20000,
  wholeLifeCreditingRate: 0.04,
  wholeLifeDividendRate: 0.015,
  wholeLifePolicyFee: 50,
}

const standardPolicies: Policy[] = [
  { id: 'pol-spend', kind: 'spending', priority: 1 },
  { id: 'pol-reserve', kind: 'maintainCashReserve', priority: 2 },
  { id: 'pol-mortgage', kind: 'payMortgage', priority: 3 },
  { id: 'pol-invest', kind: 'investSurplus', priority: 4 },
]

function working(name: string, start: string, end: string, annualSalary: number, monthlySpending: number): Scenario {
  return createScenario({
    name,
    start,
    end,
    income: [{ id: 'inc-salary', name: 'Salary', monthlyAmount: annualSalary / 12, taxable: true }],
    spending: [{ id: 'spend-normal', name: 'Living expenses', monthlyAmount: monthlySpending }],
    events: [],
    policies: standardPolicies,
    parameters,
  })
}

function retired(name: string, start: string, end: string, monthlySpending: number): Scenario {
  return createScenario({
    name,
    start,
    end,
    income: [{ id: 'inc-ss', name: 'Social Security', monthlyAmount: 2500, taxable: true }],
    spending: [{ id: 'spend-retirement', name: 'Retirement spending', monthlyAmount: monthlySpending }],
    events: [{ id: 'evt-401k-draw', name: '401(k) withdrawal', timing: { kind: 'recurring', from: start }, effect: { kind: 'assetDelta', assetId: '401k', amount: -2500 } }, { id: 'evt-401k-draw-cash', name: '401(k) withdrawal (cash side)', timing: { kind: 'recurring', from: start }, effect: { kind: 'cashDelta', amount: 2500 } }],
    policies: [
      { id: 'pol-spend-retire', kind: 'spending', priority: 1 },
      { id: 'pol-reserve-retire', kind: 'maintainCashReserve', priority: 2 },
      { id: 'pol-invest-retire', kind: 'investSurplus', priority: 3 },
    ],
    parameters: { ...parameters, expectedReturn: 0.05 },
  })
}

// --- Master: Work in USA -> retire in USA ---
export const masterTrajectory = createTrajectory('Master', [
  working('Working in USA', '2026-01', '2045-12', 270000, 8000),
  retired('Retired in USA', '2046-01', '2060-12', 7000),
])

// --- Alternative A: Work in USA -> travel a year -> retire in Japan ---
const travelingTheWorld = createScenario({
  name: 'Travel around the world',
  start: '2033-01',
  end: '2033-12',
  income: [],
  spending: [{ id: 'spend-travel', name: 'Elevated travel spending', monthlyAmount: 12000 }],
  events: [],
  policies: [{ id: 'pol-spend-travel', kind: 'spending', priority: 1 }],
  parameters: { ...parameters, expectedReturn: 0.05 },
})

export const alternativeATrajectory = createTrajectory('Work, travel, retire in Japan', [
  working('Working in USA', '2026-01', '2032-12', 270000, 8000),
  travelingTheWorld,
  {
    ...retired('Retirement in Japan', '2034-01', '2050-12', 6000),
    events: [
      { id: 'evt-sell-home', name: 'Sell primary residence', timing: { kind: 'instantaneous', at: '2034-06' }, effect: { kind: 'sellProperty', assetId: 'home' } },
      { id: 'evt-401k-draw', name: '401(k) withdrawal', timing: { kind: 'recurring', from: '2034-07' }, effect: { kind: 'assetDelta', assetId: '401k', amount: -2500 } },
      { id: 'evt-401k-draw-cash', name: '401(k) withdrawal (cash side)', timing: { kind: 'recurring', from: '2034-07' }, effect: { kind: 'cashDelta', amount: 2500 } },
    ],
  },
])

// --- Alternative B: Work longer -> retire at 65 -> remain in USA ---
export const alternativeBTrajectory = createTrajectory('Work longer, retire at 65', [
  working('Working in USA (extended)', '2026-01', '2055-12', 270000, 8000),
  retired('Retired in USA', '2056-01', '2065-12', 7000),
])

// --- Alternative C: Work in USA -> move to SF, rent -> retire later ---
function renting(name: string, start: string, end: string, monthlySpendingWithRent: number): Scenario {
  return createScenario({
    name,
    start,
    end,
    income: [{ id: 'inc-salary-sf', name: 'Salary (SF)', monthlyAmount: 300000 / 12, taxable: true }],
    spending: [{ id: 'spend-rent', name: 'Rent + living expenses', monthlyAmount: monthlySpendingWithRent }],
    events: [],
    policies: [
      { id: 'pol-spend-rent', kind: 'spending', priority: 1 },
      { id: 'pol-reserve-rent', kind: 'maintainCashReserve', priority: 2 },
      { id: 'pol-invest-rent', kind: 'investSurplus', priority: 3 }, // no mortgage while renting
    ],
    parameters,
  })
}

export const alternativeCTrajectory = createTrajectory('Move to SF, rent, retire later', [
  working('Working in USA (NYC)', '2026-01', '2032-12', 270000, 8000),
  {
    ...renting('SF rental', '2033-01', '2040-12', 11000),
    events: [{ id: 'evt-sell-home-c', name: 'Sell primary residence before the move', timing: { kind: 'instantaneous', at: '2033-01' }, effect: { kind: 'sellProperty', assetId: 'home' } }],
  },
  {
    ...renting('Retired in SF (renting)', '2041-01', '2058-12', 9000),
    income: [{ id: 'inc-ss-c', name: 'Social Security', monthlyAmount: 2500, taxable: true }],
    events: [
      { id: 'evt-401k-draw-c', name: '401(k) withdrawal', timing: { kind: 'recurring', from: '2041-01' }, effect: { kind: 'assetDelta', assetId: '401k', amount: -2500 } },
      { id: 'evt-401k-draw-c-cash', name: '401(k) withdrawal (cash side)', timing: { kind: 'recurring', from: '2041-01' }, effect: { kind: 'cashDelta', amount: 2500 } },
    ],
  },
])
