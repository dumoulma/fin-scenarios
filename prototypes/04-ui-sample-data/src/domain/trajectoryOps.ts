import { addMonths, compareYearMonth, monthsBetween, type YearMonth } from '../../../03-calculation-engine/src/domain/dates.ts'
import type { Scenario, Trajectory } from '../../../03-calculation-engine/src/domain/types.ts'

// crypto.randomUUID() is a browser/Node-global Web Crypto API, not a node:crypto
// import — this file runs in the browser bundle.
function randomUUID(): string {
  return crypto.randomUUID()
}

// Re-derived from prototype 02's proven algorithms (boundary-drag resize,
// cumulative-placement recompute, fresh-id-on-content-change) but retyped against
// prototype 03's financial Scenario/Trajectory shape — 02's own code operates on a
// Scenario with no income/spending/event-effects, so it can't be imported as-is.

export class TrajectoryInvariantError extends Error {}

export function validateTrajectory(scenarios: Scenario[]): void {
  if (scenarios.length === 0) {
    throw new TrajectoryInvariantError('A Trajectory must contain at least one Scenario')
  }
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i]!
    if (compareYearMonth(scenario.end, scenario.start) < 0) {
      throw new TrajectoryInvariantError(`Scenario "${scenario.name}" ends before it starts`)
    }
    if (i > 0) {
      const previous = scenarios[i - 1]!
      const expectedStart = addMonths(previous.end, 1)
      if (scenario.start !== expectedStart) {
        throw new TrajectoryInvariantError(
          `Scenario "${scenario.name}" starts at ${scenario.start}, expected ${expectedStart} to stay contiguous with "${previous.name}"`,
        )
      }
    }
  }
}

export function trajectoryStart(trajectory: Trajectory): YearMonth {
  return trajectory.scenarios[0]!.start
}

function recomputePlacement(scenarios: Scenario[], anchorStart: YearMonth): Scenario[] {
  let cursor = anchorStart
  return scenarios.map((scenario) => {
    const duration = monthsBetween(scenario.start, scenario.end)
    const start = cursor
    const end = addMonths(start, duration - 1)
    cursor = addMonths(end, 1)
    return { ...scenario, start, end }
  })
}

function findIndexOrThrow(trajectory: Trajectory, scenarioId: string): number {
  const index = trajectory.scenarios.findIndex((s) => s.id === scenarioId)
  if (index === -1) throw new TrajectoryInvariantError(`No Scenario with id "${scenarioId}" in this Trajectory`)
  return index
}

export type ScenarioInput = Omit<Scenario, 'id'>

export function createScenario(input: ScenarioInput): Scenario {
  return { ...input, id: randomUUID() }
}

export function modifyScenario(scenario: Scenario, changes: Partial<ScenarioInput>): Scenario {
  return { ...scenario, ...changes, id: randomUUID() }
}

export function duplicateScenario(scenario: Scenario): Scenario {
  return { ...scenario, id: randomUUID() }
}

export function createTrajectory(name: string, scenarios: Scenario[]): Trajectory {
  validateTrajectory(scenarios)
  return { id: randomUUID(), name, scenarios }
}

export function addScenario(trajectory: Trajectory, scenario: Scenario, index: number = trajectory.scenarios.length): Trajectory {
  const scenarios = [...trajectory.scenarios]
  scenarios.splice(index, 0, scenario)
  const placed = recomputePlacement(scenarios, trajectoryStart(trajectory))
  validateTrajectory(placed)
  return { ...trajectory, scenarios: placed }
}

export function removeScenario(trajectory: Trajectory, scenarioId: string): Trajectory {
  const scenarios = trajectory.scenarios.filter((s) => s.id !== scenarioId)
  if (scenarios.length === trajectory.scenarios.length) {
    throw new TrajectoryInvariantError(`No Scenario with id "${scenarioId}" in this Trajectory`)
  }
  if (scenarios.length === 0) {
    throw new TrajectoryInvariantError('Cannot remove the last Scenario from a Trajectory')
  }
  const placed = recomputePlacement(scenarios, trajectoryStart(trajectory))
  validateTrajectory(placed)
  return { ...trajectory, scenarios: placed }
}

export function duplicateScenarioWithinTrajectory(trajectory: Trajectory, scenarioId: string): Trajectory {
  const index = findIndexOrThrow(trajectory, scenarioId)
  const duplicate = duplicateScenario(trajectory.scenarios[index]!)
  return addScenario(trajectory, duplicate, index + 1)
}

export function replaceScenario(trajectory: Trajectory, scenarioId: string, newScenario: Scenario): Trajectory {
  const index = findIndexOrThrow(trajectory, scenarioId)
  const scenarios = [...trajectory.scenarios]
  scenarios[index] = newScenario
  const placed = recomputePlacement(scenarios, trajectoryStart(trajectory))
  validateTrajectory(placed)
  return { ...trajectory, scenarios: placed }
}

/** Boundary-drag: moves only the resized Scenario's end and its immediate
 * successor's start — same semantics as prototype 02. */
export function resizeScenario(trajectory: Trajectory, scenarioId: string, newDurationInMonths: number): Trajectory {
  if (newDurationInMonths < 1) {
    throw new TrajectoryInvariantError('A Scenario must be at least one month long')
  }
  const index = findIndexOrThrow(trajectory, scenarioId)
  const scenarios = [...trajectory.scenarios]
  const target = scenarios[index]!
  const newEnd = addMonths(target.start, newDurationInMonths - 1)
  scenarios[index] = { ...target, end: newEnd }

  const next = scenarios[index + 1]
  if (next) {
    const nextStart = addMonths(newEnd, 1)
    if (compareYearMonth(nextStart, next.end) > 0) {
      throw new TrajectoryInvariantError(
        `Resizing "${target.name}" to ${newDurationInMonths} month(s) would leave "${next.name}" with zero or negative duration`,
      )
    }
    scenarios[index + 1] = { ...next, start: nextStart }
  }

  validateTrajectory(scenarios)
  return { ...trajectory, scenarios }
}

export function duplicateTrajectory(trajectory: Trajectory, newName: string): Trajectory {
  return { id: randomUUID(), name: newName, scenarios: trajectory.scenarios }
}

/** Shifts every Scenario's start/end by the same month delta, anchoring a
 * hand-authored Trajectory to a real Initial State's date without hand-editing its
 * literal dates. monthsBetween(a, b) - 1 gives the signed delta even when b < a. */
export function shiftTrajectoryToStart(trajectory: Trajectory, newStart: YearMonth): Trajectory {
  const delta = monthsBetween(trajectoryStart(trajectory), newStart) - 1
  const scenarios = trajectory.scenarios.map((s) => ({ ...s, start: addMonths(s.start, delta), end: addMonths(s.end, delta) }))
  validateTrajectory(scenarios)
  return { ...trajectory, scenarios }
}

export type Workspace = { master: Trajectory; alternatives: Trajectory[] }

export function promoteToMaster(workspace: Workspace, trajectoryId: string): Workspace {
  const index = workspace.alternatives.findIndex((t) => t.id === trajectoryId)
  if (index === -1) throw new TrajectoryInvariantError(`No Alternative with id "${trajectoryId}" in this Workspace`)
  const promoted = workspace.alternatives[index]!
  const remaining = workspace.alternatives.filter((_, i) => i !== index)
  return { master: promoted, alternatives: [...remaining, workspace.master] }
}
