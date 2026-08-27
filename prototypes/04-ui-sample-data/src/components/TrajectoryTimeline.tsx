import type { Trajectory } from '../../../03-calculation-engine/src/domain/types.ts'
import { ScenarioCard } from './ScenarioCard.tsx'

type Props = {
  trajectory: Trajectory
  onRename: (scenarioId: string, name: string) => void
  onSpendingChange: (scenarioId: string, monthlyAmount: number) => void
  onResize: (scenarioId: string, deltaMonths: number) => void
  onDuplicate: (scenarioId: string) => void
  onDelete: (scenarioId: string) => void
  onAdd: () => void
}

export function TrajectoryTimeline({ trajectory, onRename, onSpendingChange, onResize, onDuplicate, onDelete, onAdd }: Props) {
  return (
    <div className="timeline">
      <div className="timeline__initial-state">Initial State</div>
      <div className="timeline__arrow" aria-hidden>
        ↓
      </div>
      <div className="timeline__row">
        {trajectory.scenarios.map((scenario, index) => (
          <div className="timeline__card-wrap" key={scenario.id}>
            {index > 0 && (
              <span className="timeline__connector" aria-hidden>
                →
              </span>
            )}
            <ScenarioCard
              scenario={scenario}
              canDelete={trajectory.scenarios.length > 1}
              onRename={(name) => onRename(scenario.id, name)}
              onSpendingChange={(amount) => onSpendingChange(scenario.id, amount)}
              onResize={(delta) => onResize(scenario.id, delta)}
              onDuplicate={() => onDuplicate(scenario.id)}
              onDelete={() => onDelete(scenario.id)}
            />
          </div>
        ))}
        <button type="button" className="timeline__add" onClick={onAdd}>
          + Add Scenario
        </button>
      </div>
    </div>
  )
}
