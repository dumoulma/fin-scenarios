import { describe, expect, it } from 'vitest'
import { duplicateTrajectory, replaceScenario, resizeScenario } from '../src/domain/trajectory.ts'
import { promoteToMaster } from '../src/domain/workspace.ts'
import { buildWorkTravelRetireTrajectory } from '../src/fixtures.ts'
import { createScenario } from '../src/domain/scenario.ts'

describe('Workspace: Master + Alternatives stay isolated', () => {
  it('changing one Alternative never changes the Master or another Alternative', () => {
    const master = buildWorkTravelRetireTrajectory()
    const alternativeA = duplicateTrajectory(master, 'Alternative A')
    const alternativeB = duplicateTrajectory(master, 'Alternative B')

    const masterSnapshot = structuredClone(master)
    const alternativeBSnapshot = structuredClone(alternativeB)

    const travelInA = alternativeA.scenarios[1]!
    const changedA = resizeScenario(alternativeA, travelInA.id, 3)

    expect(master).toEqual(masterSnapshot)
    expect(alternativeB).toEqual(alternativeBSnapshot)
    expect(changedA.scenarios[1]!.end).toBe('2033-03')

    const retirement = alternativeB.scenarios[2]!
    const replacement = createScenario({
      name: 'Extended retirement in Portugal',
      start: '1900-01',
      end: '1900-12',
      events: [],
      policies: [],
      parameters: {},
    })
    const changedB = replaceScenario(alternativeB, retirement.id, replacement)

    expect(master).toEqual(masterSnapshot)
    expect(changedA.scenarios[1]!.end).toBe('2033-03') // A's earlier change still holds
    expect(changedB.scenarios[2]!.name).toBe('Extended retirement in Portugal')
  })

  it('promotes an Alternative to Master and demotes the previous Master', () => {
    const master = buildWorkTravelRetireTrajectory()
    const alternative = duplicateTrajectory(master, 'Alternative A')
    const workspace = { master, alternatives: [alternative] }

    const promoted = promoteToMaster(workspace, alternative.id)

    expect(promoted.master.id).toBe(alternative.id)
    expect(promoted.alternatives.map((t) => t.id)).toEqual([master.id])
  })

  it('rejects promoting an id that is not an Alternative in this Workspace', () => {
    const master = buildWorkTravelRetireTrajectory()
    const workspace = { master, alternatives: [] }
    expect(() => promoteToMaster(workspace, 'not-a-real-id')).toThrow()
  })
})
