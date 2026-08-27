import type { Scenario } from '../../../03-calculation-engine/src/domain/types.ts'

function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return (ey! - sy!) * 12 + (em! - sm!) + 1
}

function totalSpending(scenario: Scenario): number {
  return scenario.spending.reduce((sum, s) => sum + s.monthlyAmount, 0)
}

type Props = {
  scenario: Scenario
  canDelete: boolean
  onRename: (name: string) => void
  onSpendingChange: (monthlyAmount: number) => void
  onResize: (deltaMonths: number) => void
  onDuplicate: () => void
  onDelete: () => void
}

export function ScenarioCard({ scenario, canDelete, onRename, onSpendingChange, onResize, onDuplicate, onDelete }: Props) {
  const duration = monthsBetween(scenario.start, scenario.end)

  return (
    <div className="scenario-card">
      <input className="scenario-card__name" value={scenario.name} onChange={(e) => onRename(e.target.value)} />
      <div className="scenario-card__period">
        {scenario.start} → {scenario.end}
      </div>

      <label className="scenario-card__field">
        Monthly spending
        <input type="number" value={totalSpending(scenario)} onChange={(e) => onSpendingChange(Number(e.target.value))} />
      </label>

      <label className="scenario-card__field">
        Duration
        <span className="scenario-card__stepper">
          <button type="button" onClick={() => onResize(-1)} disabled={duration <= 1} aria-label="Shorten by one month">
            −
          </button>
          <span>{duration} mo</span>
          <button type="button" onClick={() => onResize(1)} aria-label="Extend by one month">
            +
          </button>
        </span>
      </label>

      <div className="scenario-card__actions">
        <button type="button" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" onClick={onDelete} disabled={!canDelete} title={canDelete ? undefined : 'A Trajectory needs at least one Scenario'}>
          Delete
        </button>
      </div>
    </div>
  )
}
