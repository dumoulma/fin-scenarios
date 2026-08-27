import type { YearMonth } from './dates.ts'

export type EventTiming =
  | { kind: 'instantaneous'; at: YearMonth }
  | { kind: 'recurring'; from: YearMonth; until?: YearMonth }
  | { kind: 'durationBased'; from: YearMonth; until: YearMonth }

export type Event = {
  id: string
  name: string
  timing: EventTiming
}

export type PolicyKind = 'spending' | 'maintainCashReserve' | 'payMortgage' | 'investSurplus'

export type Policy = {
  id: string
  kind: PolicyKind
  priority: number
}

export type Parameters = Record<string, number>

export type Scenario = {
  id: string
  name: string
  start: YearMonth
  end: YearMonth // inclusive
  events: Event[]
  policies: Policy[]
  parameters: Parameters
}

export type Trajectory = {
  id: string
  name: string
  /** Ordered, contiguous, non-empty. Bounds are derived — never stored separately. */
  scenarios: Scenario[]
}

export type Workspace = {
  master: Trajectory
  alternatives: Trajectory[]
}

export function trajectoryStart(trajectory: Trajectory): YearMonth {
  return trajectory.scenarios[0]!.start
}

export function trajectoryEnd(trajectory: Trajectory): YearMonth {
  return trajectory.scenarios.at(-1)!.end
}
