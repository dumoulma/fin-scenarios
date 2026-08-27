import { calculate } from './engine/calculate.ts'
import { netWorth, type FinancialState } from './domain/types.ts'
import { fixtureTrajectory, initialState } from './fixtures.ts'

function printSnapshot(label: string, state: FinancialState): void {
  console.log(`${label}  (${state.asOf})  net worth: ${netWorth(state).toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
}

const result = calculate(initialState, fixtureTrajectory)

console.log('--- Annual snapshots ---')
for (const snapshot of result.annual) {
  printSnapshot('Year', snapshot)
}

console.log('\n--- Flagged months ---')
const flagged = ['2029-06', '2033-01', '2034-06', '2036-01', '2038-03']
for (const month of flagged) {
  const snapshot = result.monthly.find((s) => s.asOf === month)
  if (snapshot) printSnapshot(month, snapshot)
}
