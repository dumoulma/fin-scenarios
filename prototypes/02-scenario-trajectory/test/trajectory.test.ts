import { describe, expect, it } from 'vitest'
import { createScenario } from '../src/domain/scenario.ts'
import {
  TrajectoryInvariantError,
  addScenario,
  createTrajectory,
  duplicateScenarioWithinTrajectory,
  duplicateTrajectory,
  removeScenario,
  reorderScenarios,
  replaceScenario,
  resizeScenario,
} from '../src/domain/trajectory.ts'
import { trajectoryEnd, trajectoryStart, type Scenario } from '../src/domain/types.ts'
import { buildWorkTravelRetireTrajectory } from '../src/fixtures.ts'

function scenario(overrides: Partial<Omit<Scenario, 'id'>> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ events: [], policies: [], parameters: {}, ...overrides })
}

describe('Trajectory invariants', () => {
  it('rejects an empty Trajectory', () => {
    expect(() => createTrajectory('Empty', [])).toThrow(TrajectoryInvariantError)
  })

  it('rejects a non-contiguous Trajectory (a gap between Scenarios)', () => {
    const a = scenario({ name: 'A', start: '2026-01', end: '2026-06' })
    const b = scenario({ name: 'B', start: '2026-08', end: '2026-12' }) // gap: 2026-07 missing
    expect(() => createTrajectory('Gappy', [a, b])).toThrow(TrajectoryInvariantError)
  })

  it('rejects overlapping Scenarios', () => {
    const a = scenario({ name: 'A', start: '2026-01', end: '2026-06' })
    const b = scenario({ name: 'B', start: '2026-05', end: '2026-12' }) // overlaps A
    expect(() => createTrajectory('Overlapping', [a, b])).toThrow(TrajectoryInvariantError)
  })

  it('derives start/end from the first and last Scenario', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    expect(trajectoryStart(trajectory)).toBe('2026-01')
    expect(trajectoryEnd(trajectory)).toBe('2040-12')
  })
})

describe('Trajectory transformations', () => {
  it('addScenario inserts and re-times everything after it, without mutating the original', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const original = structuredClone(trajectory)
    const sabbatical = scenario({ name: 'Sabbatical', start: '2050-01', end: '2050-06' }) // dates irrelevant — will be re-timed

    const updated = addScenario(trajectory, sabbatical, 1)

    expect(updated.scenarios.map((s) => s.name)).toEqual(['Working in USA', 'Sabbatical', 'Travel around the world', 'Retirement in Japan'])
    expect(updated.scenarios[1]!.start).toBe('2033-01') // re-timed to sit right after "Working in USA"
    expect(updated.scenarios[2]!.start).toBe('2033-07') // pushed back by the sabbatical's 6 months
    expect(trajectory).toEqual(original)
  })

  it('removeScenario closes the gap and re-times the remainder', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const travelId = trajectory.scenarios[1]!.id

    const updated = removeScenario(trajectory, travelId)

    expect(updated.scenarios.map((s) => s.name)).toEqual(['Working in USA', 'Retirement in Japan'])
    expect(updated.scenarios[1]!.start).toBe('2033-01')
  })

  it('removeScenario refuses to empty the Trajectory', () => {
    const single = createTrajectory('Solo', [scenario({ name: 'Only one', start: '2026-01', end: '2026-12' })])
    expect(() => removeScenario(single, single.scenarios[0]!.id)).toThrow(TrajectoryInvariantError)
  })

  it('duplicateScenarioWithinTrajectory inserts an independent copy right after the source', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const workingId = trajectory.scenarios[0]!.id

    const updated = duplicateScenarioWithinTrajectory(trajectory, workingId)

    expect(updated.scenarios).toHaveLength(4)
    expect(updated.scenarios[1]!.name).toBe('Working in USA')
    expect(updated.scenarios[1]!.id).not.toBe(workingId)
  })

  it('replaceScenario swaps content at that position and re-times', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const travel = trajectory.scenarios[1]!
    const sabbatical = scenario({ name: 'Extended sabbatical', start: '1999-01', end: '1999-03' })

    const updated = replaceScenario(trajectory, travel.id, sabbatical)

    expect(updated.scenarios[1]!.name).toBe('Extended sabbatical')
    expect(updated.scenarios[1]!.start).toBe('2033-01')
    expect(updated.scenarios[1]!.end).toBe('2033-03')
    expect(updated.scenarios[2]!.start).toBe('2033-04') // neighbor re-timed to follow the shorter replacement
  })

  it('reorderScenarios keeps each Scenario\'s own duration but re-times by new position', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const [working, travel, retirement] = trajectory.scenarios

    const updated = reorderScenarios(trajectory, [travel!.id, working!.id, retirement!.id])

    expect(updated.scenarios.map((s) => s.name)).toEqual(['Travel around the world', 'Working in USA', 'Retirement in Japan'])
    expect(updated.scenarios[0]!.start).toBe('2026-01')
    expect(updated.scenarios[0]!.end).toBe('2026-12') // travel keeps its 12-month duration
    expect(updated.scenarios[1]!.start).toBe('2027-01')
    expect(updated.scenarios[1]!.end).toBe('2033-12') // working keeps its 84-month duration
  })

  it('reorderScenarios rejects an id list that is not a permutation of the current Scenarios', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    expect(() => reorderScenarios(trajectory, ['not-a-real-id'])).toThrow(TrajectoryInvariantError)
  })

  it('duplicateTrajectory produces an independent Trajectory that starts out identical', () => {
    const master = buildWorkTravelRetireTrajectory()
    const alternative = duplicateTrajectory(master, 'Alternative A')

    expect(alternative.id).not.toBe(master.id)
    expect(alternative.scenarios).toEqual(master.scenarios)
  })
})

describe('resizeScenario — boundary-drag semantics', () => {
  it('moves only the resized Scenario\'s end and its immediate successor\'s start', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const [working, travel, retirement] = trajectory.scenarios
    const workingOriginalStart = working!.start

    const updated = resizeScenario(trajectory, travel!.id, 6)

    expect(updated.scenarios[1]!.end).toBe('2033-06')
    expect(updated.scenarios[2]!.start).toBe('2033-07') // immediate neighbor moved
    expect(updated.scenarios[2]!.end).toBe(retirement!.end) // but its own end did NOT move
    expect(updated.scenarios[0]!.start).toBe(workingOriginalStart) // scenario before the resize is untouched
    expect(updated.scenarios[0]!.end).toBe(working!.end)
  })

  it('resizing the last Scenario simply moves the Trajectory\'s derived end', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const retirement = trajectory.scenarios[2]!

    const updated = resizeScenario(trajectory, retirement.id, 12)

    expect(trajectoryEnd(updated)).toBe('2034-12')
  })

  it('refuses a resize that would zero out or invert the immediate neighbor', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const travel = trajectory.scenarios[1]! // 12 months, followed by an 84-month Scenario
    // Grow "Travel" past the entire length of "Retirement in Japan" that follows it.
    expect(() => resizeScenario(trajectory, travel.id, 12 + 84 + 1)).toThrow(TrajectoryInvariantError)
  })

  it('does not mutate the original Trajectory', () => {
    const trajectory = buildWorkTravelRetireTrajectory()
    const original = structuredClone(trajectory)
    resizeScenario(trajectory, trajectory.scenarios[1]!.id, 6)
    expect(trajectory).toEqual(original)
  })
})
