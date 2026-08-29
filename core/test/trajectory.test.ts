import { describe, expect, it } from 'vitest'
import {
  TrajectoryInvariantError,
  addScenario,
  createScenario,
  createTrajectory,
  duplicateScenario,
  duplicateScenarioWithinTrajectory,
  duplicateTrajectory,
  modifyScenario,
  promoteToMaster,
  removeScenario,
  reorderScenarios,
  replaceScenario,
  resizeScenario,
} from '../src/domain/trajectory.ts'
import { trajectoryEnd, trajectoryStart, type Scenario } from '../src/domain/types.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ events: [], parameters: { spending: 0, taxRate: 0 }, policies: [], ...overrides })
}

function threeJobTrajectory() {
  return createTrajectory('Career', [
    scenario({ name: 'Job 1', start: '2026-01', end: '2030-12' }),
    scenario({ name: 'Job 2', start: '2031-01', end: '2035-12' }),
    scenario({ name: 'Job 3', start: '2036-01', end: '2040-12' }),
  ])
}

describe('Trajectory invariants', () => {
  it('rejects an empty Trajectory', () => {
    expect(() => createTrajectory('Empty', [])).toThrow(TrajectoryInvariantError)
  })

  it('rejects a non-contiguous Trajectory', () => {
    const a = scenario({ name: 'A', start: '2026-01', end: '2026-06' })
    const b = scenario({ name: 'B', start: '2026-08', end: '2026-12' })
    expect(() => createTrajectory('Gappy', [a, b])).toThrow(TrajectoryInvariantError)
  })

  it('derives start/end from the first and last Scenario', () => {
    const t = threeJobTrajectory()
    expect(trajectoryStart(t)).toBe('2026-01')
    expect(trajectoryEnd(t)).toBe('2040-12')
  })
})

describe('Scenario transformations', () => {
  it('modifyScenario returns a new Scenario without touching the original', () => {
    const original = scenario({ name: 'Job 1', start: '2026-01', end: '2030-12' })
    const modified = modifyScenario(original, { name: 'Renamed' })
    expect(modified.id).not.toBe(original.id)
    expect(original.name).toBe('Job 1')
  })

  it('duplicateScenario mints a fresh id with identical content', () => {
    const original = scenario({ name: 'Job 1', start: '2026-01', end: '2030-12' })
    const duplicate = duplicateScenario(original)
    expect(duplicate.id).not.toBe(original.id)
    expect(duplicate.start).toBe(original.start)
  })
})

describe('Trajectory transformations', () => {
  it('addScenario inserts and re-times the rest, without mutating the original', () => {
    const t = threeJobTrajectory()
    const before = structuredClone(t)
    const inserted = scenario({ name: 'Sabbatical', start: '1900-01', end: '1900-06' })

    const updated = addScenario(t, inserted, 1)

    expect(updated.scenarios.map((s) => s.name)).toEqual(['Job 1', 'Sabbatical', 'Job 2', 'Job 3'])
    expect(updated.scenarios[1]!.start).toBe('2031-01')
    expect(t).toEqual(before)
  })

  it('removeScenario closes the gap and refuses to empty the Trajectory', () => {
    const t = threeJobTrajectory()
    const updated = removeScenario(t, t.scenarios[1]!.id)
    expect(updated.scenarios.map((s) => s.name)).toEqual(['Job 1', 'Job 3'])
    expect(updated.scenarios[1]!.start).toBe('2031-01')

    const single = createTrajectory('Solo', [scenario({ name: 'Only', start: '2026-01', end: '2026-12' })])
    expect(() => removeScenario(single, single.scenarios[0]!.id)).toThrow(TrajectoryInvariantError)
  })

  it('duplicateScenarioWithinTrajectory inserts an independent copy right after the source', () => {
    const t = threeJobTrajectory()
    const firstId = t.scenarios[0]!.id
    const updated = duplicateScenarioWithinTrajectory(t, firstId)
    expect(updated.scenarios).toHaveLength(4)
    expect(updated.scenarios[1]!.name).toBe('Job 1')
    expect(updated.scenarios[1]!.id).not.toBe(firstId)
  })

  it('replaceScenario swaps content at that position and re-times', () => {
    const t = threeJobTrajectory()
    const job2 = t.scenarios[1]!
    const shorter = scenario({ name: 'Short gig', start: '1999-01', end: '1999-03' })
    const updated = replaceScenario(t, job2.id, shorter)
    expect(updated.scenarios[1]!.name).toBe('Short gig')
    expect(updated.scenarios[1]!.start).toBe('2031-01')
    expect(updated.scenarios[2]!.start).toBe('2031-04')
  })

  it("reorderScenarios keeps each Scenario's own duration but re-times by new position", () => {
    const t = threeJobTrajectory()
    const [job1, job2, job3] = t.scenarios
    const updated = reorderScenarios(t, [job2!.id, job1!.id, job3!.id])
    expect(updated.scenarios.map((s) => s.name)).toEqual(['Job 2', 'Job 1', 'Job 3'])
    expect(updated.scenarios[0]!.start).toBe('2026-01')
    expect(updated.scenarios[1]!.start).toBe('2031-01')
  })

  it('duplicateTrajectory produces an independent Trajectory', () => {
    const t = threeJobTrajectory()
    const alt = duplicateTrajectory(t, 'Alternative')
    expect(alt.id).not.toBe(t.id)
    expect(alt.scenarios).toEqual(t.scenarios)
  })
})

describe('resizeScenario — boundary-drag semantics', () => {
  it('moves only the resized Scenario\'s end and its immediate successor\'s start', () => {
    const t = threeJobTrajectory()
    const updated = resizeScenario(t, t.scenarios[0]!.id, 36) // shrink Job 1 to 3 years
    expect(updated.scenarios[0]!.end).toBe('2028-12')
    expect(updated.scenarios[1]!.start).toBe('2029-01')
    expect(updated.scenarios[1]!.end).toBe(t.scenarios[1]!.end) // unchanged
    expect(updated.scenarios[2]!).toEqual(t.scenarios[2]!) // untouched
  })

  it('refuses a resize that would zero out or invert the immediate neighbor', () => {
    const t = threeJobTrajectory()
    expect(() => resizeScenario(t, t.scenarios[0]!.id, 60 + 60 + 1)).toThrow(TrajectoryInvariantError)
  })
})

describe('Workspace', () => {
  it('promotes an Alternative to Master and demotes the previous Master', () => {
    const master = threeJobTrajectory()
    const alt = duplicateTrajectory(master, 'Alternative')
    const promoted = promoteToMaster({ master, alternatives: [alt] }, alt.id)
    expect(promoted.master.id).toBe(alt.id)
    expect(promoted.alternatives.map((t) => t.id)).toEqual([master.id])
  })
})
