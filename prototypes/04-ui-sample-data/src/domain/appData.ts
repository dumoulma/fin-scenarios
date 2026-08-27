// The actual end-to-end wiring: 01's Kubera importer -> 03-shaped Initial State ->
// 02-derived Trajectory transformations anchoring 04's hand-authored sample
// Trajectories to that Initial State's real date. Same export names as sampleData.ts
// so App.tsx only had to change its one import line.
import { buildInitialStateFromKubera } from './kuberaAdapter.ts'
import * as sampleData from './sampleData.ts'
import { shiftTrajectoryToStart } from './trajectoryOps.ts'

const { financialState, importSummary, droppedForCurrency } = buildInitialStateFromKubera()

export const initialState = financialState
export { importSummary, droppedForCurrency }

export const masterTrajectory = shiftTrajectoryToStart(sampleData.masterTrajectory, financialState.asOf)
export const alternativeATrajectory = shiftTrajectoryToStart(sampleData.alternativeATrajectory, financialState.asOf)
export const alternativeBTrajectory = shiftTrajectoryToStart(sampleData.alternativeBTrajectory, financialState.asOf)
export const alternativeCTrajectory = shiftTrajectoryToStart(sampleData.alternativeCTrajectory, financialState.asOf)
