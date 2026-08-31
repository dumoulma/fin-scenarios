import { describe, expect, it } from 'vitest'
import { createStochasticParameterProvider } from '../src/engine/stochasticParameterProvider.ts'
import { createScenario } from '../src/domain/trajectory.ts'

function scenarioWith(parameters: Record<string, number>) {
  return createScenario({ name: 's', start: '2026-01', end: '2035-12', events: [], parameters: { spending: 0, taxRate: 0, ...parameters }, policies: [] })
}

describe('createStochasticParameterProvider', () => {
  it('with no volatility entry for a name, passes the deterministic scenario value through unchanged', () => {
    const provider = createStochasticParameterProvider({}, 1)
    const scenario = scenarioWith({ taxRate: 0.32 })
    expect(provider('taxRate', scenario, '2026-01')).toBe(0.32)
    expect(provider('taxRate', scenario, '2026-02')).toBe(0.32)
  })

  it('for a name with volatility, draws a different value on different ticks', () => {
    const provider = createStochasticParameterProvider({ equityReturn: 0.15 }, 1)
    const scenario = scenarioWith({ equityReturn: 0.07 })
    const jan = provider('equityReturn', scenario, '2026-01')
    const feb = provider('equityReturn', scenario, '2026-02')
    expect(jan).not.toBe(feb)
  })

  it('the same tick and name always returns the same draw (every Asset reading it this month sees the same market)', () => {
    const provider = createStochasticParameterProvider({ equityReturn: 0.15 }, 1)
    const scenario = scenarioWith({ equityReturn: 0.07 })
    const first = provider('equityReturn', scenario, '2026-03')
    const second = provider('equityReturn', scenario, '2026-03')
    expect(first).toBe(second)
  })

  it('the same seed reproduces the exact same sequence of draws', () => {
    const scenario = scenarioWith({ equityReturn: 0.07 })
    const a = createStochasticParameterProvider({ equityReturn: 0.15 }, 42)
    const b = createStochasticParameterProvider({ equityReturn: 0.15 }, 42)
    const ticks = ['2026-01', '2026-02', '2026-03', '2026-04'] as const
    expect(ticks.map((t) => a('equityReturn', scenario, t))).toEqual(ticks.map((t) => b('equityReturn', scenario, t)))
  })

  it("after the caller's own /12 division (every economic rate here is annual, divided by 12 downstream), monthly returns converge to the requested annual mean/stdDev", () => {
    const provider = createStochasticParameterProvider({ equityReturn: 0.15 }, 7)
    const scenario = scenarioWith({ equityReturn: 0.07 })
    const monthlyReturns: number[] = []
    for (let year = 2026; year < 2026 + 500; year++) {
      for (const month of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']) {
        const annualizedSample = provider('equityReturn', scenario, `${year}-${month}` as `${number}-${string}`)
        monthlyReturns.push(annualizedSample / 12) // exactly what assetTypeBehaviors.ts does
      }
    }
    const mean = monthlyReturns.reduce((s, x) => s + x, 0) / monthlyReturns.length
    const variance = monthlyReturns.reduce((s, x) => s + (x - mean) ** 2, 0) / monthlyReturns.length
    const stdDev = Math.sqrt(variance)

    expect(mean).toBeCloseTo(0.07 / 12, 2)
    expect(stdDev).toBeCloseTo(0.15 / Math.sqrt(12), 2)
  })
})
