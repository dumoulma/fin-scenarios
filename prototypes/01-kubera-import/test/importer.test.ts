import { describe, expect, it } from 'vitest'
import { netWorthByCurrency } from '../src/domain/types.ts'
import { fixtureSnapshot } from '../src/kubera/fixture.ts'
import { importKuberaSnapshot } from '../src/kubera/importer.ts'

describe('importKuberaSnapshot', () => {
  it('transforms the fixture into an Initial State with no hand-editing', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const kinds = initialState.assets.map((a) => a.kind).sort()
    expect(kinds).toEqual(
      ['cash', 'cash', 'realProperty', 'retirementAccount', 'retirementAccount', 'retirementAccount', 'taxableBrokerage', 'wholeLifeCashValue'].sort(),
    )
    expect(initialState.liabilities.map((l) => l.kind)).toEqual(['mortgage'])
  })

  it('preserves the Initial State date from the snapshot', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    expect(initialState.asOf).toBe('2026-08-01')
  })

  it('aggregates same-currency accounts of the same kind and records it in the summary', () => {
    const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)
    const usdCash = initialState.assets.find((a) => a.kind === 'cash' && a.currency === 'USD')
    expect(usdCash).toMatchObject({ balance: 8450.12 + 42310.77 + 320.0 })

    const cashAggregation = summary.aggregated.find((a) => a.intoAssetId === usdCash!.id)
    expect(cashAggregation?.sources).toEqual(
      expect.arrayContaining([
        'Ridgeline Bank - Everyday Checking - 4410',
        'Meridian Savings - High Yield Savings - 2207',
        'BrightPath Federal - Everyday Checking - 5567',
      ]),
    )
  })

  it('does not mix currencies when aggregating the same kind', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const cadCash = initialState.assets.find((a) => a.kind === 'cash' && a.currency === 'CAD')
    expect(cadCash).toMatchObject({ balance: 1875.4 })
  })

  it('excludes individual security-level holdings from assets but records them as ignored', () => {
    const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)
    const brokerage = initialState.assets.find((a) => a.kind === 'taxableBrokerage')
    expect(brokerage).toMatchObject({ balance: 214870.33 })

    for (const holdingName of ['Global Equity Index Fund', 'Total Market ETF']) {
      const entry = summary.ignored.find((i) => i.source === holdingName)
      expect(entry?.reason).toMatch(/individual security-level holding/)
    }
  })

  it('flags an unsupported asset category as ignored, not included in assets or net worth', () => {
    const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)
    const entry = summary.ignored.find((i) => i.source === 'Nimbus Robotics - Stock Option Grant - 2021 Plan')
    expect(entry).toBeDefined()
    expect(initialState.assets.some((a) => a.name.includes('Nimbus'))).toBe(false)
  })

  it('flags an unsupported liability category as ignored, never becomes a mortgage', () => {
    const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)
    expect(summary.ignored.some((i) => i.source === 'Ridgeline Bank - Signature Visa - 3312')).toBe(true)
    expect(initialState.liabilities.length).toBe(1)
    expect(initialState.liabilities[0]!.name).toBe('Mortgage')
  })

  it('routes a missing value to needsManualInput instead of dropping or crashing', () => {
    const { summary } = importKuberaSnapshot(fixtureSnapshot)
    const entry = summary.needsManualInput.find((n) => n.source === 'Old Employer 401(k) - Rollover Pending')
    expect(entry?.reason).toBe('missing value')
  })

  it('routes an ambiguous retirement wrapper to needsManualInput', () => {
    const { summary } = importKuberaSnapshot(fixtureSnapshot)
    const entry = summary.needsManualInput.find((n) => n.source === 'Alderbrook Industries - Profit-Sharing Retirement Plan')
    expect(entry).toBeDefined()
  })

  it('routes a zero-value mortgage entry to needsManualInput instead of silently merging it', () => {
    const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)
    const entry = summary.needsManualInput.find((n) => n.source === 'Summit Home Lending - Mortgage 412 Willowmere C4B')
    expect(entry?.reason).toMatch(/zero value/)
    expect(initialState.liabilities[0]!.balance).toBe(412650.88)
  })

  it('defaults a missing currency to the snapshot base currency and records the fallback', () => {
    const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)
    const usdCash = initialState.assets.find((a) => a.kind === 'cash' && a.currency === 'USD')!
    const entry = summary.recognized.find((r) => r.source === 'BrightPath Federal - Everyday Checking - 5567')
    expect(entry?.mappedTo).toBe(`${usdCash.id} (currency defaulted to USD)`)
  })

  it('is deterministic: running twice on the same fixture produces identical output', () => {
    const first = importKuberaSnapshot(fixtureSnapshot)
    const second = importKuberaSnapshot(fixtureSnapshot)
    expect(first).toEqual(second)
  })

  it('computes net worth per currency from the resulting Initial State', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const usd =
      8450.12 +
      42310.77 +
      320.0 + // cash
      214870.33 + // brokerage
      98765.43 + // 401k
      54210.09 + // traditional IRA
      31000.0 + // roth IRA
      26840.0 + // whole life
      685000 - // real property
      412650.88 // mortgage
    const totals = netWorthByCurrency(initialState)
    expect(totals.USD).toBeCloseTo(usd, 2)
    expect(totals.CAD).toBeCloseTo(1875.4, 2)
  })
})
