import { describe, expect, it } from 'vitest'
import { createSeededRandom, sampleNormal } from '../src/engine/random.ts'

describe('createSeededRandom', () => {
  it('produces values in [0, 1)', () => {
    const random = createSeededRandom(42)
    for (let i = 0; i < 1000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('the same seed reproduces the exact same sequence', () => {
    const a = createSeededRandom(1234)
    const b = createSeededRandom(1234)
    const sequenceA = Array.from({ length: 20 }, () => a())
    const sequenceB = Array.from({ length: 20 }, () => b())
    expect(sequenceA).toEqual(sequenceB)
  })

  it('different seeds produce different sequences', () => {
    const a = createSeededRandom(1)
    const b = createSeededRandom(2)
    const sequenceA = Array.from({ length: 5 }, () => a())
    const sequenceB = Array.from({ length: 5 }, () => b())
    expect(sequenceA).not.toEqual(sequenceB)
  })
})

describe('sampleNormal', () => {
  it('is deterministic given a seeded generator', () => {
    const a = createSeededRandom(7)
    const b = createSeededRandom(7)
    expect(sampleNormal(a, 0, 1)).toBe(sampleNormal(b, 0, 1))
  })

  it('converges to the requested mean and standard deviation over many draws', () => {
    const random = createSeededRandom(99)
    const targetMean = 0.07
    const targetStdDev = 0.15
    const samples = Array.from({ length: 50_000 }, () => sampleNormal(random, targetMean, targetStdDev))

    const sampleMean = samples.reduce((sum, x) => sum + x, 0) / samples.length
    const sampleVariance = samples.reduce((sum, x) => sum + (x - sampleMean) ** 2, 0) / samples.length
    const sampleStdDev = Math.sqrt(sampleVariance)

    expect(sampleMean).toBeCloseTo(targetMean, 2)
    expect(sampleStdDev).toBeCloseTo(targetStdDev, 2)
  })

  it('a stdDev of 0 always returns exactly the mean', () => {
    const random = createSeededRandom(5)
    for (let i = 0; i < 20; i++) {
      expect(sampleNormal(random, 0.05, 0)).toBe(0.05)
    }
  })
})
