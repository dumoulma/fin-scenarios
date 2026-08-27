import { randomUUID } from 'node:crypto'
import type { Scenario } from './types.ts'

export type ScenarioInput = Omit<Scenario, 'id'>

export function createScenario(input: ScenarioInput): Scenario {
  return { ...input, id: randomUUID() }
}

/** Produces a new Scenario without modifying the original — never the same id. */
export function modifyScenario(scenario: Scenario, changes: Partial<ScenarioInput>): Scenario {
  return { ...scenario, ...changes, id: randomUUID() }
}

export function duplicateScenario(scenario: Scenario): Scenario {
  return { ...scenario, id: randomUUID() }
}
