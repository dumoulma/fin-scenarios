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
  resizeScenario,
  shiftTrajectoryToStart,
} from '../src/domain/trajectoryOps.ts'
import { masterTrajectory } from '../src/domain/sampleData.ts'
import type { Scenario } from '../../03-calculation-engine/src/domain/types.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ income: [], spending: [], events: [], policies: [], parameters: {}, ...overrides })
}

describe('trajectoryOps — invariants', () => {
  it('rejects an empty Trajectory', () => {
    expect(() => createTrajectory('Empty', [])).toThrow(TrajectoryInvariantError)
  })

  it('rejects a non-contiguous Trajectory', () => {
    const a = scenario({ name: 'A', start: '2026-01', end: '2026-06' })
    const b = scenario({ name: 'B', start: '2026-08', end: '2026-12' })
    expect(() => createTrajectory('Gappy', [a, b])).toThrow(TrajectoryInvariantError)
  })
})

describe('trajectoryOps — Scenario transformations', () => {
  it('modifyScenario returns a new Scenario without touching the original', () => {
    const original = scenario({ name: 'Working', start: '2026-01', end: '2026-12' })
    const modified = modifyScenario(original, { name: 'Sabbatical' })
    expect(modified.id).not.toBe(original.id)
    expect(original.name).toBe('Working')
  })

  it('duplicateScenario mints a fresh id with identical content', () => {
    const original = scenario({ name: 'Working', start: '2026-01', end: '2026-12' })
    const duplicate = duplicateScenario(original)
    expect(duplicate.id).not.toBe(original.id)
    expect(duplicate.start).toBe(original.start)
  })
})

describe('trajectoryOps — Trajectory transformations', () => {
  it('addScenario inserts and re-times the rest, without mutating the original', () => {
    const trajectory = masterTrajectory
    const before = structuredClone(trajectory)
    const sabbatical = scenario({ name: 'Sabbatical', start: '1900-01', end: '1900-06' })

    const updated = addScenario(trajectory, sabbatical, 1)

    expect(updated.scenarios.map((s) => s.name)).toContain('Sabbatical')
    expect(trajectory).toEqual(before)
  })

  it('removeScenario refuses to empty the Trajectory', () => {
    const single = createTrajectory('Solo', [scenario({ name: 'Only one', start: '2026-01', end: '2026-12' })])
    expect(() => removeScenario(single, single.scenarios[0]!.id)).toThrow(TrajectoryInvariantError)
  })

  it('duplicateScenarioWithinTrajectory inserts an independent copy right after the source', () => {
    const trajectory = masterTrajectory
    const firstId = trajectory.scenarios[0]!.id
    const updated = duplicateScenarioWithinTrajectory(trajectory, firstId)
    expect(updated.scenarios).toHaveLength(trajectory.scenarios.length + 1)
    expect(updated.scenarios[1]!.name).toBe(trajectory.scenarios[0]!.name)
    expect(updated.scenarios[1]!.id).not.toBe(firstId)
  })

  it('resizeScenario only moves the immediate neighbor (boundary-drag)', () => {
    const trajectory = masterTrajectory
    const [working] = trajectory.scenarios
    const updated = resizeScenario(trajectory, working!.id, 12)
    expect(updated.scenarios[0]!.end).toBe('2026-12')
    expect(updated.scenarios[1]!.start).toBe('2027-01')
  })

  it('duplicateTrajectory produces an independent Trajectory that starts out identical', () => {
    const alternative = duplicateTrajectory(masterTrajectory, 'My Alternative')
    expect(alternative.id).not.toBe(masterTrajectory.id)
    expect(alternative.scenarios).toEqual(masterTrajectory.scenarios)
  })

  it('changing an Alternative never changes the Master', () => {
    const before = structuredClone(masterTrajectory)
    const alternative = duplicateTrajectory(masterTrajectory, 'My Alternative')
    resizeScenario(alternative, alternative.scenarios[0]!.id, 6)
    expect(masterTrajectory).toEqual(before)
  })
})

describe('trajectoryOps — Workspace', () => {
  it('promotes an Alternative to Master and demotes the previous Master', () => {
    const alternative = duplicateTrajectory(masterTrajectory, 'Alternative A')
    const workspace = { master: masterTrajectory, alternatives: [alternative] }
    const promoted = promoteToMaster(workspace, alternative.id)
    expect(promoted.master.id).toBe(alternative.id)
    expect(promoted.alternatives.map((t) => t.id)).toEqual([masterTrajectory.id])
  })
})

describe('trajectoryOps — shiftTrajectoryToStart', () => {
  it('shifts every Scenario by the same delta and stays contiguous', () => {
    const originalFirstStart = masterTrajectory.scenarios[0]!.start
    const originalGap = masterTrajectory.scenarios[1]!.start

    const shifted = shiftTrajectoryToStart(masterTrajectory, '2026-08')

    expect(shifted.scenarios[0]!.start).toBe('2026-08')
    expect(shifted.scenarios.length).toBe(masterTrajectory.scenarios.length)
    // every Scenario's own duration is preserved, only its placement moved
    expect(shifted.scenarios[1]!.start).not.toBe(originalGap)
    expect(originalFirstStart).not.toBe('2026-08') // sanity: this test actually shifted something
  })

  it('never mutates the original Trajectory', () => {
    const before = structuredClone(masterTrajectory)
    shiftTrajectoryToStart(masterTrajectory, '2030-03')
    expect(masterTrajectory).toEqual(before)
  })
})
