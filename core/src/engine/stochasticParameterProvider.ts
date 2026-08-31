import type { ParameterProvider } from './calculate.ts'
import { createSeededRandom, sampleNormal } from './random.ts'

/** Annualized standard deviation per Economic Parameter name (e.g. `{ equityReturn: 0.15 }`
 * for a 15%/yr volatility) — the mean always stays wherever it already lives
 * (`scenario.parameters[name]`), so a Scenario's own assumption stays the center
 * of its own distribution instead of being duplicated here. */
export type Volatility = Record<string, number>

/**
 * The stochastic Input Generator (docs/domain/CONTEXT.md's Input Generator seam)
 * — same ParameterProvider contract as constantParameterProvider, so calculate()
 * doesn't know or care that its inputs are random this time.
 *
 * Every Economic Parameter in this domain is an ANNUAL rate that its own
 * consumer divides by 12 (assetTypeBehaviors.ts: `value * (1 + getParam(name) / 12)`).
 * This samples a value scaled so that AFTER that same /12 division, the
 * resulting monthly return has the statistically correct monthly mean
 * (annualMean / 12) and stdDev (annualStdDev / sqrt(12)) implied by the
 * requested annual figures — which is why a single sampled value looks far
 * more volatile than the stated annual stdDev in isolation (it's pre-scaled by
 * sqrt(12) specifically to survive the caller's own /12 step). Don't be alarmed
 * by a raw sample that looks like "next month's equityReturn is -60%" — after
 * /12 that's a perfectly ordinary -5% month.
 *
 * One sample per (tick, name): every Asset reading the same named parameter in
 * the same month sees the same "the market this month" draw, not independent
 * noise per Asset.
 */
export function createStochasticParameterProvider(volatility: Volatility, seed: number): ParameterProvider {
  const random = createSeededRandom(seed)
  const drawnThisTick = new Map<string, number>()

  return (name, scenario, tick) => {
    const annualMean = scenario.parameters[name] ?? 0
    const annualStdDev = volatility[name]
    if (!annualStdDev) return annualMean

    const cacheKey = `${tick}:${name}`
    const cached = drawnThisTick.get(cacheKey)
    if (cached !== undefined) return cached

    const sample = sampleNormal(random, annualMean, annualStdDev * Math.sqrt(12))
    drawnThisTick.set(cacheKey, sample)
    return sample
  }
}
