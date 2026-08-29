import { netWorth } from './domain/types.ts'
import { calculate } from './engine/calculate.ts'
import { initialState, quietMillionaireTrajectory } from './scenarios/quietMillionaire.ts'

const result = calculate(initialState, quietMillionaireTrajectory)

console.log(`${quietMillionaireTrajectory.name}\n`)

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

console.log('Annual net worth:')
for (const snapshot of result.annual) {
  const cash = snapshot.assets.find((a) => a.assetType === 'cash')!.value
  const retirement = snapshot.assets.find((a) => a.holdingContext === 'traditionalRetirement')!.value
  const brokerage = snapshot.assets.find((a) => a.holdingContext === 'taxableBrokerage')!.value
  console.log(`  ${snapshot.asOf}  net worth: $${fmt(netWorth(snapshot))}  (cash $${fmt(cash)}, 401(k) $${fmt(retirement)}, brokerage $${fmt(brokerage)})`)
}

console.log('\nAt each job change:')
for (const scenario of quietMillionaireTrajectory.scenarios) {
  const snapshot = result.monthly.find((s) => s.asOf === scenario.start)!
  console.log(`  ${scenario.start}  ${scenario.name}  starting net worth: $${fmt(netWorth(snapshot))}`)
}

const final = result.annual.at(-1)!
console.log(`\nAt 65 (${final.asOf}): net worth $${fmt(netWorth(final))}`)
