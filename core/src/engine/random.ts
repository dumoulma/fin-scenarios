// A small deterministic PRNG, not Math.random() — Monte Carlo needs reproducible
// runs (same seed -> same outcome distribution, for tests and for a user to
// "replay" a specific run), which Math.random() can never give.

export type RandomGenerator = () => number // uniform, [0, 1)

/** mulberry32 — a minimal, fast, statistically-adequate PRNG for this purpose;
 * no cryptographic properties needed here. */
export function createSeededRandom(seed: number): RandomGenerator {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Box-Muller transform — turns two uniform draws into one normally-distributed
 * sample. u1 excludes 0 (log(0) is -Infinity). */
export function sampleNormal(random: RandomGenerator, mean: number, stdDev: number): number {
  if (stdDev === 0) return mean
  let u1 = 0
  while (u1 === 0) u1 = random()
  const u2 = random()
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + stdDev * z0
}
