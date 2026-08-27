import { createScenario } from './domain/scenario.ts'
import { createTrajectory } from './domain/trajectory.ts'
import type { Trajectory } from './domain/types.ts'

// Working in USA -> Travel around the world -> Retirement in Japan
// (docs/prototypes/02-scenario-trajectory.md's first test scenario)
export function buildWorkTravelRetireTrajectory(): Trajectory {
  const workingInUsa = createScenario({
    name: 'Working in USA',
    start: '2026-01',
    end: '2032-12',
    events: [{ id: 'evt-job-change', name: 'Promoted to Senior Engineer', timing: { kind: 'instantaneous', at: '2029-06' } }],
    policies: [
      { id: 'pol-spend', kind: 'spending', priority: 1 },
      { id: 'pol-mortgage', kind: 'payMortgage', priority: 2 },
      { id: 'pol-invest', kind: 'investSurplus', priority: 3 },
    ],
    parameters: { inflation: 0.03, expectedReturn: 0.07, salary: 270000 },
  })

  const travelingTheWorld = createScenario({
    name: 'Travel around the world',
    start: '2033-01',
    end: '2033-12',
    events: [{ id: 'evt-big-trip', name: 'Round-the-world trip', timing: { kind: 'durationBased', from: '2033-01', until: '2033-12' } }],
    policies: [{ id: 'pol-spend-travel', kind: 'spending', priority: 1 }],
    parameters: { inflation: 0.03, salary: 0, travelSpending: 25000 },
  })

  const retirementInJapan = createScenario({
    name: 'Retirement in Japan',
    start: '2034-01',
    end: '2040-12',
    events: [{ id: 'evt-social-security', name: 'Social Security begins', timing: { kind: 'recurring', from: '2036-01' } }],
    policies: [
      { id: 'pol-spend-retire', kind: 'spending', priority: 1 },
      { id: 'pol-reserve', kind: 'maintainCashReserve', priority: 2 },
    ],
    parameters: { inflation: 0.02, withdrawalRate: 0.04 },
  })

  return createTrajectory('Master', [workingInUsa, travelingTheWorld, retirementInJapan])
}

// NYC ownership -> SF rental -> SF ownership
// (docs/prototypes/02-scenario-trajectory.md's second test scenario)
export function buildNycToSfTrajectory(): Trajectory {
  const nycOwnership = createScenario({
    name: 'NYC ownership',
    start: '2026-01',
    end: '2027-12',
    events: [{ id: 'evt-sell-nyc', name: 'Sell NYC apartment', timing: { kind: 'instantaneous', at: '2027-12' } }],
    policies: [{ id: 'pol-mortgage-nyc', kind: 'payMortgage', priority: 1 }],
    parameters: { inflation: 0.03 },
  })

  const sfRental = createScenario({
    name: 'SF rental',
    start: '2028-01',
    end: '2028-12',
    events: [
      { id: 'evt-moving-costs', name: 'Moving costs (NYC -> SF)', timing: { kind: 'instantaneous', at: '2028-01' } },
      { id: 'evt-buy-sf', name: 'Buy SF condo', timing: { kind: 'instantaneous', at: '2028-12' } },
    ],
    policies: [{ id: 'pol-spend-rental', kind: 'spending', priority: 1 }],
    parameters: { inflation: 0.03, rent: 4200 },
  })

  const sfOwnership = createScenario({
    name: 'SF ownership',
    start: '2029-01',
    end: '2032-12',
    events: [],
    policies: [{ id: 'pol-mortgage-sf', kind: 'payMortgage', priority: 1 }],
    parameters: { inflation: 0.03 },
  })

  return createTrajectory('Master', [nycOwnership, sfRental, sfOwnership])
}
