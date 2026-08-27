import { netWorth, type FinancialState } from '../engine.ts'

export type NetWorthSeries = { id: string; name: string; color: string; annual: FinancialState[] }

const WIDTH = 640
const HEIGHT = 280
const PADDING = 40

export function NetWorthChart({ series }: { series: NetWorthSeries[] }) {
  if (series.length === 0 || series.every((s) => s.annual.length === 0)) {
    return <div className="chart chart--empty">Select at least one Trajectory to see its projection.</div>
  }

  const allYears = series.flatMap((s) => s.annual.map((snapshot) => snapshot.asOf.slice(0, 4)))
  const years = [...new Set(allYears)].sort()
  const allNetWorths = series.flatMap((s) => s.annual.map((snapshot) => netWorth(snapshot)))
  const minValue = Math.min(0, ...allNetWorths)
  const maxValue = Math.max(...allNetWorths)

  const x = (yearIndex: number) => PADDING + (yearIndex / Math.max(1, years.length - 1)) * (WIDTH - 2 * PADDING)
  const y = (value: number) => HEIGHT - PADDING - ((value - minValue) / (maxValue - minValue || 1)) * (HEIGHT - 2 * PADDING)

  return (
    <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Net worth by year">
      <line x1={PADDING} y1={y(0)} x2={WIDTH - PADDING} y2={y(0)} className="chart__zero-line" />
      {years
        .map((year, i) => ({ year, i }))
        .filter(({ i }) => i % Math.ceil(years.length / 10) === 0 || i === years.length - 1)
        .map(({ year, i }) => (
          <text key={year} x={x(i)} y={HEIGHT - PADDING + 16} className="chart__axis-label" textAnchor="middle">
            {year}
          </text>
        ))}

      {series.map((s) => {
        const points = s.annual.map((snapshot, i) => `${x(years.indexOf(snapshot.asOf.slice(0, 4)))},${y(netWorth(snapshot))}`).join(' ')
        return <polyline key={s.id} points={points} fill="none" stroke={s.color} strokeWidth={2} />
      })}

      <g className="chart__legend">
        {series.map((s, i) => (
          <g key={s.id} transform={`translate(${PADDING + i * 160}, 12)`}>
            <rect width={10} height={10} fill={s.color} />
            <text x={16} y={9} className="chart__legend-label">
              {s.name}
            </text>
          </g>
        ))}
      </g>
    </svg>
  )
}
