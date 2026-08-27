import { randomUUID } from 'node:crypto'
import { addMonths, compareYearMonth, monthsBetween, type YearMonth } from './dates.ts'
import { duplicateScenario } from './scenario.ts'
import { trajectoryStart, type Scenario, type Trajectory } from './types.ts'

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

/**
 * The only fixed anchor is the Trajectory's own start. Every operation below keeps
 * each Scenario's own duration but recomputes concrete start/end by walking
 * cumulatively from that anchor — contiguity is constructed, not just checked.
 */
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

export function reorderScenarios(trajectory: Trajectory, newIdOrder: string[]): Trajectory {
  const currentIds = new Set(trajectory.scenarios.map((s) => s.id))
  const isPermutation = newIdOrder.length === trajectory.scenarios.length && new Set(newIdOrder).size === newIdOrder.length && newIdOrder.every((id) => currentIds.has(id))
  if (!isPermutation) {
    throw new TrajectoryInvariantError("newIdOrder must be a permutation of the Trajectory's current Scenario ids")
  }
  const byId = new Map(trajectory.scenarios.map((s) => [s.id, s]))
  const scenarios = newIdOrder.map((id) => byId.get(id)!)
  const placed = recomputePlacement(scenarios, trajectoryStart(trajectory))
  validateTrajectory(placed)
  return { ...trajectory, scenarios: placed }
}

/**
 * Boundary-drag, not a cascade: resizing a Scenario moves only its own end and its
 * immediate successor's start (or, if it's the last Scenario, the Trajectory's own
 * end simply follows since it's derived). Nothing beyond that one neighbor changes.
 */
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

/** Safe to shallow-copy: every transformation above returns new objects rather than
 * mutating in place, so the Master and this duplicate can share Scenario objects
 * without risking cross-contamination. */
export function duplicateTrajectory(trajectory: Trajectory, newName: string): Trajectory {
  return { id: randomUUID(), name: newName, scenarios: trajectory.scenarios }
}
