import { describe, expect, it } from 'vitest'
import { createScenario, duplicateScenario, modifyScenario } from '../src/domain/scenario.ts'

function baseInput() {
  return {
    name: 'Working in USA',
    start: '2026-01',
    end: '2026-12',
    events: [],
    policies: [],
    parameters: { inflation: 0.03 },
  }
}

describe('Scenario transformations', () => {
  it('creates a Scenario with a fresh id', () => {
    const a = createScenario(baseInput())
    const b = createScenario(baseInput())
    expect(a.id).not.toBe(b.id)
  })

  it('modifies a Scenario into a new one without touching the original', () => {
    const original = createScenario(baseInput())
    const modified = modifyScenario(original, { name: 'Working in Canada' })

    expect(modified.id).not.toBe(original.id)
    expect(modified.name).toBe('Working in Canada')
    expect(original.name).toBe('Working in USA')
  })

  it('duplicates a Scenario with a fresh id but identical content', () => {
    const original = createScenario(baseInput())
    const duplicate = duplicateScenario(original)

    expect(duplicate.id).not.toBe(original.id)
    expect(duplicate.name).toBe(original.name)
    expect(duplicate.start).toBe(original.start)
    expect(duplicate.end).toBe(original.end)
  })
})
