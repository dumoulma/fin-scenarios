import { useMemo, useReducer } from 'react'
import type { Trajectory } from '../../../03-calculation-engine/src/domain/types.ts'
import { calculate } from '../engine.ts'
import {
  addScenario,
  createScenario,
  duplicateScenarioWithinTrajectory,
  duplicateTrajectory,
  modifyScenario,
  promoteToMaster,
  removeScenario,
  replaceScenario,
  resizeScenario,
} from '../domain/trajectoryOps.ts'
import { alternativeATrajectory, alternativeBTrajectory, alternativeCTrajectory, droppedForCurrency, importSummary, initialState, masterTrajectory } from '../domain/appData.ts'
import { AssetsLiabilitiesChart } from './AssetsLiabilitiesChart.tsx'
import { ImportSummaryPanel } from './ImportSummaryPanel.tsx'
import { NetWorthChart, type NetWorthSeries } from './NetWorthChart.tsx'
import { TrajectoryList } from './TrajectoryList.tsx'
import { TrajectoryTimeline } from './TrajectoryTimeline.tsx'

type State = {
  master: Trajectory
  alternatives: Trajectory[]
  activeId: string
  compareIds: Set<string>
}

const initialAppState: State = {
  master: masterTrajectory,
  alternatives: [alternativeATrajectory, alternativeBTrajectory, alternativeCTrajectory],
  activeId: masterTrajectory.id,
  compareIds: new Set([masterTrajectory.id]),
}

type Action =
  | { type: 'ADD_SCENARIO'; trajectoryId: string }
  | { type: 'DUPLICATE_SCENARIO'; trajectoryId: string; scenarioId: string }
  | { type: 'REMOVE_SCENARIO'; trajectoryId: string; scenarioId: string }
  | { type: 'RESIZE_SCENARIO'; trajectoryId: string; scenarioId: string; deltaMonths: number }
  | { type: 'RENAME_SCENARIO'; trajectoryId: string; scenarioId: string; name: string }
  | { type: 'SET_SPENDING'; trajectoryId: string; scenarioId: string; monthlyAmount: number }
  | { type: 'DUPLICATE_TRAJECTORY'; trajectoryId: string }
  | { type: 'PROMOTE'; trajectoryId: string }
  | { type: 'SELECT_ACTIVE'; trajectoryId: string }
  | { type: 'TOGGLE_COMPARE'; trajectoryId: string }

function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return (ey! - sy!) * 12 + (em! - sm!) + 1
}

function updateTrajectory(state: State, trajectoryId: string, updater: (t: Trajectory) => Trajectory): State {
  if (state.master.id === trajectoryId) {
    return { ...state, master: updater(state.master) }
  }
  return { ...state, alternatives: state.alternatives.map((t) => (t.id === trajectoryId ? updater(t) : t)) }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_SCENARIO': {
      return updateTrajectory(state, action.trajectoryId, (trajectory) => {
        const newScenario = createScenario({
          name: 'New Scenario',
          start: trajectory.scenarios.at(-1)!.end,
          end: trajectory.scenarios.at(-1)!.end,
          income: [],
          spending: [{ id: 'spend-default', name: 'Living expenses', monthlyAmount: 5000 }],
          events: [],
          policies: [{ id: 'pol-spend', kind: 'spending', priority: 1 }],
          parameters: trajectory.scenarios.at(-1)!.parameters,
        })
        return addScenario(trajectory, newScenario)
      })
    }
    case 'DUPLICATE_SCENARIO':
      return updateTrajectory(state, action.trajectoryId, (t) => duplicateScenarioWithinTrajectory(t, action.scenarioId))
    case 'REMOVE_SCENARIO':
      return updateTrajectory(state, action.trajectoryId, (t) => removeScenario(t, action.scenarioId))
    case 'RESIZE_SCENARIO':
      return updateTrajectory(state, action.trajectoryId, (trajectory) => {
        const scenario = trajectory.scenarios.find((s) => s.id === action.scenarioId)!
        const newDuration = monthsBetween(scenario.start, scenario.end) + action.deltaMonths
        return resizeScenario(trajectory, action.scenarioId, newDuration)
      })
    case 'RENAME_SCENARIO':
      return updateTrajectory(state, action.trajectoryId, (trajectory) => {
        const scenario = trajectory.scenarios.find((s) => s.id === action.scenarioId)!
        return replaceScenario(trajectory, action.scenarioId, modifyScenario(scenario, { name: action.name }))
      })
    case 'SET_SPENDING':
      return updateTrajectory(state, action.trajectoryId, (trajectory) => {
        const scenario = trajectory.scenarios.find((s) => s.id === action.scenarioId)!
        return replaceScenario(
          trajectory,
          action.scenarioId,
          modifyScenario(scenario, { spending: [{ id: 'spend-edited', name: 'Living expenses', monthlyAmount: action.monthlyAmount }] }),
        )
      })
    case 'DUPLICATE_TRAJECTORY': {
      const source = action.trajectoryId === state.master.id ? state.master : state.alternatives.find((t) => t.id === action.trajectoryId)!
      const alternative = duplicateTrajectory(source, `${source.name} (copy)`)
      return { ...state, alternatives: [...state.alternatives, alternative], activeId: alternative.id, compareIds: new Set([...state.compareIds, alternative.id]) }
    }
    case 'PROMOTE': {
      const { master, alternatives } = promoteToMaster({ master: state.master, alternatives: state.alternatives }, action.trajectoryId)
      return { ...state, master, alternatives }
    }
    case 'SELECT_ACTIVE':
      return { ...state, activeId: action.trajectoryId }
    case 'TOGGLE_COMPARE': {
      const compareIds = new Set(state.compareIds)
      if (compareIds.has(action.trajectoryId)) compareIds.delete(action.trajectoryId)
      else compareIds.add(action.trajectoryId)
      return { ...state, compareIds }
    }
  }
}

const COLORS = ['#2f6fb3', '#b3401f', '#7a3fb3', '#1f8f5f', '#c78a1f']

export function App() {
  const [state, dispatch] = useReducer(reducer, initialAppState)

  const allTrajectories = [state.master, ...state.alternatives]
  const active = allTrajectories.find((t) => t.id === state.activeId)!

  // Immutable-by-construction transformations mean this only recomputes when the
  // relevant Trajectory object actually changed — no explicit "recalculate" action.
  const compared = allTrajectories.filter((t) => state.compareIds.has(t.id))
  const results = useMemo(() => compared.map((t) => ({ trajectory: t, result: calculate(initialState, t) })), [compared])
  const activeResult = useMemo(() => calculate(initialState, active), [active])

  const series: NetWorthSeries[] = results.map(({ trajectory, result }, i) => ({
    id: trajectory.id,
    name: trajectory.name,
    color: COLORS[i % COLORS.length]!,
    annual: result.annual,
  }))

  return (
    <div className="app">
      <h1>Trajectory Planner (Prototype 04)</h1>

      <ImportSummaryPanel summary={importSummary} droppedForCurrency={droppedForCurrency} />

      <TrajectoryList
        master={state.master}
        alternatives={state.alternatives}
        activeId={state.activeId}
        compareIds={state.compareIds}
        onSelectActive={(id) => dispatch({ type: 'SELECT_ACTIVE', trajectoryId: id })}
        onToggleCompare={(id) => dispatch({ type: 'TOGGLE_COMPARE', trajectoryId: id })}
        onDuplicateAsAlternative={(id) => dispatch({ type: 'DUPLICATE_TRAJECTORY', trajectoryId: id })}
        onPromote={(id) => dispatch({ type: 'PROMOTE', trajectoryId: id })}
      />

      <TrajectoryTimeline
        trajectory={active}
        onRename={(scenarioId, name) => dispatch({ type: 'RENAME_SCENARIO', trajectoryId: active.id, scenarioId, name })}
        onSpendingChange={(scenarioId, monthlyAmount) => dispatch({ type: 'SET_SPENDING', trajectoryId: active.id, scenarioId, monthlyAmount })}
        onResize={(scenarioId, deltaMonths) => dispatch({ type: 'RESIZE_SCENARIO', trajectoryId: active.id, scenarioId, deltaMonths })}
        onDuplicate={(scenarioId) => dispatch({ type: 'DUPLICATE_SCENARIO', trajectoryId: active.id, scenarioId })}
        onDelete={(scenarioId) => dispatch({ type: 'REMOVE_SCENARIO', trajectoryId: active.id, scenarioId })}
        onAdd={() => dispatch({ type: 'ADD_SCENARIO', trajectoryId: active.id })}
      />

      <div className="charts">
        <div className="chart-container">
          <NetWorthChart series={series} />
        </div>
        <div className="chart-container">
          <AssetsLiabilitiesChart state={activeResult.annual.at(-1) ?? initialState} label={active.name} />
        </div>
      </div>
    </div>
  )
}
