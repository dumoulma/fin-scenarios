import { resizeScenario } from './domain/trajectory.ts'
import type { Trajectory } from './domain/types.ts'
import { buildNycToSfTrajectory, buildWorkTravelRetireTrajectory } from './fixtures.ts'

function printTrajectory(trajectory: Trajectory): void {
  console.log(`${trajectory.name} (${trajectory.id})`)
  for (const scenario of trajectory.scenarios) {
    console.log(`  ${scenario.start} → ${scenario.end}  ${scenario.name}`)
    for (const event of scenario.events) {
      console.log(`      event: ${event.name} [${event.timing.kind}]`)
    }
  }
}

const workTravelRetire = buildWorkTravelRetireTrajectory()
console.log('--- Fixture 1 ---')
printTrajectory(workTravelRetire)

const nycToSf = buildNycToSfTrajectory()
console.log('\n--- Fixture 2 ---')
printTrajectory(nycToSf)

console.log('\n--- Resize demo: shrink "Travel around the world" to 6 months ---')
const travelScenario = workTravelRetire.scenarios[1]!
const resized = resizeScenario(workTravelRetire, travelScenario.id, 6)
printTrajectory(resized)
console.log('\n(original trajectory is unchanged — immutability check)')
printTrajectory(workTravelRetire)
