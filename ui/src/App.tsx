import { useMemo, useRef, useState } from 'react'
import { addMonths, monthsBetween, type YearMonth } from '@core/domain/dates.ts'
import { insertScenario, modifyScenario, removeScenario, replaceScenario, resizeScenario } from '@core/domain/trajectory.ts'
import { netWorth, trajectoryEnd, trajectoryStart, type Scenario, type Trajectory } from '@core/domain/types.ts'
import { calculate } from '@core/engine/calculate.ts'
import { initialState, quietMillionaireTrajectory } from '@core/scenarios/quietMillionaire.ts'

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
  const [trajectory, setTrajectory] = useState<Trajectory>(quietMillionaireTrajectory)
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number | null>(null)
  const runwayRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<SVGSVGElement>(null)

  const result = useMemo(() => calculate(initialState, trajectory), [trajectory])
  const totalMonths = monthsBetween(trajectoryStart(trajectory), trajectoryEnd(trajectory))
  const netWorths = useMemo(() => result.monthly.map(netWorth), [result])

  function updateTrajectory(fn: (t: Trajectory) => Trajectory) {
    setTrajectory((t) => {
      try {
        return fn(t)
      } catch {
        return t // drag went past a valid boundary — just stop, no crash
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
        updateTrajectory((t) => resizeScenario(t, scenarioId, Math.max(1, origMonths + deltaMonths)))
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
    updateTrajectory((t) =>
      insertScenario(t, afterScenario.id, { name: 'New Scenario', parameters: { ...afterScenario.parameters }, policies: afterScenario.policies, events: [] }, take),
    )
    setSelectedMonthIndex(null)
  }

  function handleDelete(scenarioId: string) {
    if (trajectory.scenarios.length <= 1) return
    updateTrajectory((t) => removeScenario(t, scenarioId))
    setSelectedMonthIndex(null)
  }

  function handleRename(scenario: Scenario, name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed === scenario.name) return
    updateTrajectory((t) => replaceScenario(t, scenario.id, modifyScenario(scenario, { name: trimmed })))
  }

  function handleChartClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = chartRef.current!.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / rect.width
    const usableFrac = 1 - (PAD.l + PAD.r) / CHART_W
    const startFrac = PAD.l / CHART_W
    const monthFrac = (relX - startFrac) / usableFrac
    const idx = Math.round(monthFrac * (netWorths.length - 1))
    setSelectedMonthIndex(Math.max(0, Math.min(netWorths.length - 1, idx)))
  }

  const x = (monthIdx: number) => PAD.l + (monthIdx / (totalMonths - 1)) * (CHART_W - PAD.l - PAD.r)
  const maxNW = Math.max(...netWorths)
  const minNW = Math.min(0, ...netWorths)
  const y = (v: number) => CHART_H - PAD.b - ((v - minNW) / (maxNW - minNW)) * (CHART_H - PAD.t - PAD.b)

  const linePath = netWorths.map((v, i) => (i === 0 ? 'M ' : 'L ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')
  const areaPath = linePath + ` L ${x(netWorths.length - 1).toFixed(1)} ${y(minNW).toFixed(1)} L ${x(0).toFixed(1)} ${y(minNW).toFixed(1)} Z`

  const displayIndex = selectedMonthIndex === null ? netWorths.length - 1 : selectedMonthIndex
  const displayTick = result.monthly[displayIndex]!.asOf
  const displayValue = netWorths[displayIndex]!
  const change = displayValue - netWorths[0]!

  let cumMonths = 0
  const boundaries = trajectory.scenarios.map((s) => {
    const startIdx = cumMonths
    cumMonths += scenarioMonths(s)
    return startIdx
  })

  return (
    <div className="app">
      <header className="app__header">
        <h1>
          {trajectory.name} <span className="badge">Master</span>
        </h1>
      </header>

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
        <svg ref={chartRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" height={CHART_H} onClick={handleChartClick}>
          {[0, 1, 2, 3, 4].map((g) => {
            const gy = PAD.t + (g / 4) * (CHART_H - PAD.t - PAD.b)
            return <line key={g} x1={PAD.l} y1={gy} x2={CHART_W - PAD.r} y2={gy} stroke="var(--line)" strokeWidth={1} />
          })}
          {boundaries.slice(1).map((monthIdx) => (
            <line key={monthIdx} x1={x(monthIdx)} y1={PAD.t} x2={x(monthIdx)} y2={CHART_H - PAD.b} stroke="var(--line)" strokeWidth={1} strokeDasharray="3 3" />
          ))}
          <path d={areaPath} fill="var(--accent)" opacity={0.1} stroke="none" />
          <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <line x1={x(displayIndex)} y1={PAD.t} x2={x(displayIndex)} y2={CHART_H - PAD.b} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="2 3" opacity={0.6} />
          <circle cx={x(displayIndex)} cy={y(displayValue)} r={6} fill="var(--surface)" stroke="var(--accent)" strokeWidth={3} />
          {boundaries.map((monthIdx, i) => (
            <text key={i} x={x(monthIdx)} y={CHART_H - PAD.b + 18} textAnchor="middle" fontSize={11} fill="var(--ink-dim)">
              {trajectory.scenarios[i]!.start.slice(0, 4)}
            </text>
          ))}
          <text x={x(totalMonths - 1)} y={CHART_H - PAD.b + 18} textAnchor="middle" fontSize={11} fill="var(--ink-dim)">
            {trajectoryEnd(trajectory).slice(0, 4)}
          </text>
        </svg>
      </div>

      <div className="summary">
        <div className="summary__col">
          <span className="summary__label">{selectedMonthIndex === null ? 'Net worth · end of trajectory' : `Net worth at ${displayTick}`}</span>
          <span className="summary__value">{fmt(displayValue)}</span>
        </div>
        <div className="summary__col">
          <span className="summary__label">Month</span>
          <span className="summary__value summary__value--small">{displayTick}</span>
        </div>
        <div className="summary__col">
          <span className="summary__label">Change from start</span>
          <span className={'summary__value summary__value--small ' + (change >= 0 ? 'summary__value--pos' : 'summary__value--neg')}>
            {change >= 0 ? '+' : '-'}
            {fmt(Math.abs(change))}
          </span>
        </div>
      </div>
    </div>
  )
}
