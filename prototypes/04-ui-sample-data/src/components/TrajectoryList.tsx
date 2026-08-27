import type { Trajectory } from '../../../03-calculation-engine/src/domain/types.ts'

type Props = {
  master: Trajectory
  alternatives: Trajectory[]
  activeId: string
  compareIds: Set<string>
  onSelectActive: (id: string) => void
  onToggleCompare: (id: string) => void
  onDuplicateAsAlternative: (trajectoryId: string) => void
  onPromote: (trajectoryId: string) => void
}

export function TrajectoryList({ master, alternatives, activeId, compareIds, onSelectActive, onToggleCompare, onDuplicateAsAlternative, onPromote }: Props) {
  const rows = [{ trajectory: master, isMaster: true }, ...alternatives.map((trajectory) => ({ trajectory, isMaster: false }))]

  return (
    <div className="trajectory-list">
      {rows.map(({ trajectory, isMaster }) => (
        <div key={trajectory.id} className={`trajectory-list__row ${activeId === trajectory.id ? 'trajectory-list__row--active' : ''}`}>
          <label className="trajectory-list__compare">
            <input type="checkbox" checked={compareIds.has(trajectory.id)} onChange={() => onToggleCompare(trajectory.id)} />
          </label>
          <button type="button" className="trajectory-list__name" onClick={() => onSelectActive(trajectory.id)}>
            {isMaster && <span className="trajectory-list__badge">Master</span>} {trajectory.name}
          </button>
          <div className="trajectory-list__actions">
            {isMaster ? (
              <button type="button" onClick={() => onDuplicateAsAlternative(trajectory.id)}>
                Duplicate as Alternative
              </button>
            ) : (
              <button type="button" onClick={() => onPromote(trajectory.id)}>
                Promote to Master
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
