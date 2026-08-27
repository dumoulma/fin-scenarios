import type { FinancialState } from '../engine.ts'
import type { Asset } from '../../../03-calculation-engine/src/domain/types.ts'

function assetValue(asset: Asset): number {
  switch (asset.kind) {
    case 'wholeLifeCashValue':
      return asset.cashValue - asset.policyLoanBalance
    case 'realProperty':
      return asset.marketValue
    default:
      return asset.balance
  }
}

const WIDTH = 480
const HEIGHT = 280
const PADDING = 50
const BOTTOM_PADDING = 70 // extra room for rotated labels
const BAR_GAP = 10

export function AssetsLiabilitiesChart({ state, label }: { state: FinancialState; label: string }) {
  const bars = [
    ...state.assets.map((a) => ({ name: a.name, value: assetValue(a), kind: 'asset' as const })),
    ...state.liabilities.map((l) => ({ name: l.name, value: l.balance, kind: 'liability' as const })),
  ]
  const maxValue = Math.max(1, ...bars.map((b) => b.value))
  const barWidth = (WIDTH - 2 * PADDING) / bars.length - BAR_GAP
  const chartHeight = HEIGHT - BOTTOM_PADDING - PADDING

  // Clamped at 0: a negative balance (a real cash shortfall the engine allows, not a
  // bug) would otherwise produce an invalid negative SVG height. Shown as an empty
  // bar rather than a below-the-axis one — a known simplification for this prototype.
  const barHeight = (value: number) => Math.max(0, (value / maxValue) * chartHeight)

  return (
    <div>
      <div className="chart__title">{label} — current composition</div>
      <svg className="chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Assets and liabilities for ${label}`}>
        {bars.map((bar, i) => {
          const height = barHeight(bar.value)
          const x = PADDING + i * (barWidth + BAR_GAP)
          const y = HEIGHT - BOTTOM_PADDING - height
          return (
            <g key={bar.name}>
              <rect x={x} y={y} width={barWidth} height={height} fill={bar.kind === 'asset' ? '#2f7d4f' : '#b3401f'} />
              <text
                x={x + barWidth / 2}
                y={HEIGHT - BOTTOM_PADDING + 12}
                textAnchor="end"
                className="chart__axis-label"
                transform={`rotate(-40, ${x + barWidth / 2}, ${HEIGHT - BOTTOM_PADDING + 12})`}
              >
                {bar.name.length > 18 ? `${bar.name.slice(0, 17)}…` : bar.name}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
