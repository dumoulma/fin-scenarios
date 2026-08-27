// The single seam the rest of the UI imports calculation through — no financial
// logic lives in components, only this re-export of prototype 03's engine.
export { calculate } from '../../03-calculation-engine/src/engine/calculate.ts'
export { netWorth } from '../../03-calculation-engine/src/domain/types.ts'
export type { CalculationResult, FinancialState, Trajectory } from '../../03-calculation-engine/src/domain/types.ts'
