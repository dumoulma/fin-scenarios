import { useMemo, useRef, useState } from 'react'
import { addMonths, monthsBetween } from '@core/domain/dates.ts'
import { deleteScenario, duplicateTrajectory, insertScenario, modifyScenario, replaceScenario, resizeScenario } from '@core/domain/trajectory.ts'
import { netWorth, trajectoryEnd, trajectoryStart, type Scenario, type Trajectory, type Workspace } from '@core/domain/types.ts'
import { calculate } from '@core/engine/calculate.ts'
import { initialState, quietMillionaireTrajectory } from '@core/scenarios/quietMillionaire.ts'

const ALT_COLORS = ['#e8618c', '#1a9c7a', '#d98e32', '#3f7fd1', '#a8479c']

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1_000) return '$' + Math.round(n / 1_000).toLocaleString() + 'k'
  return '$' + Math.round(n).toLocaleString()
}

function scenarioMonths(s: Scenario): number {
  return monthsBetween(s.start, s.end)
}

const CHART_W = 1000
const CHART_H = 280
const PAD = { l: 8, r: 90, t: 20, b: 30 }

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>({ master: quietMillionaireTrajectory, alternatives: [] })
  const [activeId, setActiveId] = useState(quietMillionaireTrajectory.id)
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null)
  const runwayRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<SVGSVGElement>(null)

  const allTrajectories = [workspace.master, ...workspace.alternatives]
  const trajectory = allTrajectories.find((t) => t.id === activeId) ?? workspace.master
  const totalMonths = monthsBetween(trajectoryStart(trajectory), trajectoryEnd(trajectory))

  // Every Trajectory in the Workspace runs through the same calculate() — there is
  // no separate "comparison calculator" (docs/ui-design-guide.md §16).
  const series = useMemo(
    () =>
      allTrajectories.map((t, i) => ({
        id: t.id,
        name: t.name,
        isMaster: i === 0,
        color: i === 0 ? 'var(--accent)' : ALT_COLORS[(i - 1) % ALT_COLORS.length]!,
        netWorths: calculate(initialState, t).monthly.map(netWorth),
      })),
    [workspace],
  )
  const overallMonths = Math.max(...series.map((s) => s.netWorths.length))

  function updateActiveTrajectory(fn: (t: Trajectory) => Trajectory) {
    setWorkspace((w) => {
      try {
        if (w.master.id === activeId) return { ...w, master: fn(w.master) }
        return { ...w, alternatives: w.alternatives.map((t) => (t.id === activeId ? fn(t) : t)) }
      } catch {
        return w // drag went past a valid boundary, or a structural edit was invalid — just stop, no crash
      }
    })
  }

  function handleResizeStart(idx: number) {
    return (e: React.PointerEvent) => {
      const rect = runwayRef.current!.getBoundingClientRect()
      const pxPerMonth = rect.width / totalMonths
      const startX = e.clientX
      const scenarioId = trajectory.scenarios[idx]!.id
      const origMonths = scenarioMonths(trajectory.scenarios[idx]!)
      ;(e.target as Element).setPointerCapture(e.pointerId)

      function move(ev: PointerEvent) {
        const deltaMonths = Math.round((ev.clientX - startX) / pxPerMonth)
        updateActiveTrajectory((t) => resizeScenario(t, scenarioId, Math.max(1, origMonths + deltaMonths)))
      }
      function up() {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
  }

  function handleInsert(afterScenario: Scenario) {
    const idx = trajectory.scenarios.findIndex((s) => s.id === afterScenario.id)
    const next = trajectory.scenarios[idx + 1]
    const take = next ? Math.max(1, Math.round(scenarioMonths(next) / 2)) : 12
    if (next && scenarioMonths(next) - take < 1) return
    updateActiveTrajectory((t) =>
      insertScenario(t, afterScenario.id, { name: 'New Scenario', parameters: { ...afterScenario.parameters }, policies: afterScenario.policies, events: [] }, take),
    )
    setSelectedMonthIndex(null)
  }

  function handleDelete(scenarioId: string) {
    if (trajectory.scenarios.length <= 1) return
    updateActiveTrajectory((t) => deleteScenario(t, scenarioId))
    setSelectedMonthIndex(null)
  }

  function handleRename(scenario: Scenario, name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === scenario.name) return
    updateActiveTrajectory((t) => replaceScenario(t, scenario.id, modifyScenario(scenario, { name: trimmed })))
  }

  function handleRenameTrajectory(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setWorkspace((w) => (w.master.id === id ? { ...w, master: { ...w.master, name: trimmed } } : { ...w, alternatives: w.alternatives.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) }))
  }

  function handleDuplicate() {
    const copy = duplicateTrajectory(trajectory, `${trajectory.name} copy`)
    setWorkspace((w) => ({ ...w, alternatives: [...w.alternatives, copy] }))
    setActiveId(copy.id)
    setSelectedMonthIndex(null)
  }

  function handleCloseAlternative(id: string) {
    setWorkspace((w) => ({ ...w, alternatives: w.alternatives.filter((t) => t.id !== id) }))
    if (activeId === id) setActiveId(workspace.master.id)
  }

  function handleChartClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = chartRef.current!.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const usableFrac = 1 - (PAD.l + PAD.r) / CHART_W
    const startFrac = PAD.l / CHART_W
    const monthFrac = (relX - startFrac) / usableFrac
    const idx = Math.round(monthFrac * (overallMonths - 1))
    setSelectedMonthIndex(Math.max(0, Math.min(overallMonths - 1, idx)))
  }

  const x = (monthIdx: number) => PAD.l + (monthIdx / (overallMonths - 1)) * (CHART_W - PAD.l - PAD.r)
  const allValues = series.flatMap((s) => s.netWorths)
  const maxNW = Math.max(...allValues)
  const minNW = Math.min(0, ...allValues)
  const y = (v: number) => CHART_H - PAD.b - ((v - minNW) / (maxNW - minNW)) * (CHART_H - PAD.t - PAD.b)

  const displayIndex = selectedMonthIndex === null ? overallMonths - 1 : selectedMonthIndex

  let cumMonths = 0
  const boundaries = trajectory.scenarios.map((s) => {
    const startIdx = cumMonths
    cumMonths += scenarioMonths(s)
    return startIdx
  })

  const axisYears: number[] = []
  const startYear = Number(trajectoryStart(trajectory).slice(0, 4))
  for (let m = 0; m <= overallMonths; m += 60) axisYears.push(startYear + Math.floor(m / 12))

  return (
    <div className="app">
      <div className="trajectory-tabs">
        {allTrajectories.map((t, i) => (
          <div key={t.id} className={'trajectory-tab' + (t.id === activeId ? ' trajectory-tab--active' : '')} onClick={() => setActiveId(t.id)}>
            <span className="trajectory-tab__dot" style={{ background: i === 0 ? 'var(--accent)' : ALT_COLORS[(i - 1) % ALT_COLORS.length] }} />
            <input
              className="trajectory-tab__name"
              defaultValue={t.name}
              key={t.id + t.name}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => handleRenameTrajectory(t.id, e.target.value)}
            />
            {i === 0 ? (
              <span className="badge">Master</span>
            ) : (
              <button
                className="trajectory-tab__close"
                title="Discard this alternative"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCloseAlternative(t.id)
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button className="dup-btn" onClick={handleDuplicate}>
          + Duplicate
        </button>
      </div>

      <p className="hint">Drag an edge to resize a scenario &middot; click + between two to insert a new one &middot; click the chart to inspect a point in time</p>

      <div className="runway-wrap">
        <div className="runway" ref={runwayRef}>
          {trajectory.scenarios.map((s, i) => (
            <div key={s.id} className="block" style={{ flex: `0 0 ${(scenarioMonths(s) / totalMonths) * 100}%` }}>
              <input className="block__name" defaultValue={s.name} key={s.id + s.name} onBlur={(e) => handleRename(s, e.target.value)} />
              <span className="block__meta">
                {Math.round(scenarioMonths(s) / 12)} yr &middot; {s.start}–{s.end}
              </span>
              {i > 0 && (
                <button className="block__delete" title="Remove scenario" onClick={() => handleDelete(s.id)}>
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {/* Handles and insert-zones live as siblings of .runway, not nested inside a
            .block — a handle nested in block i would have its right half painted over
            by block i+1 (later in DOM, same stacking level), making it unclickable. */}
        {boundaries.slice(1).map((monthIdx, i) => (
          <div key={monthIdx} className="handle" style={{ left: `${(monthIdx / totalMonths) * 100}%` }} onPointerDown={handleResizeStart(i)} />
        ))}
        {boundaries.slice(1).map((monthIdx, i) => (
          <button
            key={monthIdx}
            className="insert-zone"
            style={{ left: `${(monthIdx / totalMonths) * 100}%` }}
            title="Insert a scenario here"
            onClick={() => handleInsert(trajectory.scenarios[i]!)}
          >
            +
          </button>
        ))}
      </div>

      <div className="ticks">
        {boundaries.map((monthIdx, i) => (
          <span key={i} style={{ left: `${(monthIdx / totalMonths) * 100}%` }}>
            {trajectory.scenarios[i]!.start}
          </span>
        ))}
        <span style={{ left: '100%' }}>{trajectoryEnd(trajectory)}</span>
      </div>

      <div className="chart-card">
        {series.length > 1 && (
          <div className="legend">
            {series.map((s) => (
              <span key={s.id}>
                <span className="legend__swatch" style={{ background: s.color }} />
                {s.name}
              </span>
            ))}
          </div>
        )}
        <svg ref={chartRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" height={CHART_H} onClick={handleChartClick}>
          {[0, 1, 2, 3, 4].map((g) => {
            const gy = PAD.t + (g / 4) * (CHART_H - PAD.t - PAD.b)
            return <line key={g} x1={PAD.l} y1={gy} x2={CHART_W - PAD.r} y2={gy} stroke="var(--line)" strokeWidth={1} />
          })}

          {series.map((s) => {
            const path = s.netWorths.map((v, i) => (i === 0 ? 'M ' : 'L ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')
            const area = s.isMaster ? path + ` L ${x(s.netWorths.length - 1).toFixed(1)} ${y(minNW).toFixed(1)} L ${x(0).toFixed(1)} ${y(minNW).toFixed(1)} Z` : null
            const clampedDisplay = Math.min(displayIndex, s.netWorths.length - 1)
            return (
              <g key={s.id}>
                {area && <path d={area} fill={s.color} opacity={0.1} stroke="none" />}
                <path d={path} fill="none" stroke={s.color} strokeWidth={s.isMaster ? 2.5 : 2} strokeDasharray={s.isMaster ? undefined : '5 4'} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={x(clampedDisplay)} cy={y(s.netWorths[clampedDisplay]!)} r={5} fill="var(--surface)" stroke={s.color} strokeWidth={2.5} />
              </g>
            )
          })}

          <line x1={x(displayIndex)} y1={PAD.t} x2={x(displayIndex)} y2={CHART_H - PAD.b} stroke="var(--ink-dim)" strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />

          {axisYears.map((yr, i) => (
            <text key={i} x={x(i * 60)} y={CHART_H - PAD.b + 18} textAnchor="middle" fontSize={11} fill="var(--ink-dim)">
              {yr}
            </text>
          ))}
        </svg>
      </div>

      <div className="summary">
        <div className="summary__col">
          <span className="summary__label">{selectedMonthIndex === null ? 'End of trajectory' : 'Selected month'}</span>
          <span className="summary__value summary__value--small">{addMonths(trajectoryStart(workspace.master), displayIndex)}</span>
        </div>
        {series.map((s) => {
          const ended = displayIndex >= s.netWorths.length
          const idx = Math.min(displayIndex, s.netWorths.length - 1)
          const value = s.netWorths[idx]!
          const change = value - s.netWorths[0]!
          return (
            <div className="summary__col" key={s.id}>
              <span className="summary__label" style={{ color: s.color }}>
                {s.name}
                {ended ? ' (ended)' : ''}
              </span>
              <span className="summary__value">{fmt(value)}</span>
              <span className={'summary__value summary__value--small ' + (change >= 0 ? 'summary__value--pos' : 'summary__value--neg')}>
                {change >= 0 ? '+' : '-'}
                {fmt(Math.abs(change))} from start
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
