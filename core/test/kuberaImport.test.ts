import { describe, expect, it } from 'vitest'
import { addMonths } from '../src/domain/dates.ts'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth } from '../src/domain/types.ts'
import { calculate } from '../src/engine/calculate.ts'
import { fixtureSnapshot } from '../src/kubera/fixture.ts'
import { importKuberaSnapshot } from '../src/kubera/importer.ts'
import type { KuberaSnapshot } from '../src/kubera/types.ts'

function snapshotOf(items: KuberaSnapshot['items']): KuberaSnapshot {
  return { asOfDate: '2026-08-01', baseCurrency: 'USD', items }
}

describe('1. a simple Kubera asset becomes one Asset Position', () => {
  it('imports a single cash item as one Asset with the right Asset Type and value', () => {
    const snapshot = snapshotOf([
      { id: 'a1', name: 'Checking', sectionName: 'Bank', sheetName: 'Cash', category: 'asset', subType: 'cash', value: { amount: 1200, currency: 'USD' } },
    ])
    const { initialState } = importKuberaSnapshot(snapshot)
    expect(initialState.assets).toHaveLength(1)
    expect(initialState.assets[0]).toMatchObject({ assetType: 'cash', holdingContext: 'none', value: 1200 })
  })
})

describe('2. multiple child positions aggregate without including their parent twice', () => {
  it('an account-level item and its parent-linked holdings resolve to the account value only', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const brokerage = initialState.assets.find((a) => a.holdingContext === 'taxableBrokerage')!
    expect(brokerage.value).toBeCloseTo(214870.33, 2) // the account row's own value, not +children
  })
})

describe('3. a taxable brokerage maps to the correct Holding Context', () => {
  it('maps an Investments-sheet account to taxableBrokerage', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const brokerage = initialState.assets.find((a) => a.holdingContext === 'taxableBrokerage')!
    expect(brokerage).toBeDefined()
    expect(initialState.assets.some((a) => a.name.includes('Global Equity Index Fund'))).toBe(false) // child holding, aggregated into the account row
  })
})

describe('4. a retirement account maps to the correct Holding Context', () => {
  it('maps a 401(k) and a Traditional IRA to traditionalRetirement, aggregated together', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const retirement = initialState.assets.find((a) => a.holdingContext === 'traditionalRetirement')!
    expect(retirement.assetType).toBe('equity')
    expect(retirement.value).toBeCloseTo(98765.43 + 54210.09, 2) // 401(k) + Traditional IRA
  })

  it('maps a Roth IRA and a Roth 401(k) to rothRetirement, aggregated together', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const roth = initialState.assets.find((a) => a.holdingContext === 'rothRetirement')!
    expect(roth.value).toBeCloseTo(31000 + 22000, 2)
  })

  it('maps an HSA to the hsa Holding Context', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const hsa = initialState.assets.find((a) => a.holdingContext === 'hsa')!
    expect(hsa.value).toBeCloseTo(4200, 2)
  })
})

describe('5. equity is mapped conservatively when regional/ticker detail is unavailable', () => {
  it('a brokerage holding becomes plain equity, never a fabricated regional/fund-specific type', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const brokerage = initialState.assets.find((a) => a.holdingContext === 'taxableBrokerage')!
    expect(brokerage.assetType).toBe('equity')
  })
})

describe('6. property is mapped as Real Estate / Property', () => {
  it('maps a primary residence to realEstate, one-to-one with its source row', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const home = initialState.assets.find((a) => a.assetType === 'realEstate')!
    expect(home.value).toBeCloseTo(685000, 2)
  })
})

describe('7. Whole Life is mapped as Insurance / Whole Life', () => {
  it('maps a policy filed under "Retirement Investments" to wholeLifeInsurance by name, not by Kubera category', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const policy = initialState.assets.find((a) => a.assetType === 'wholeLifeInsurance')!
    expect(policy.value).toBeCloseTo(26840, 2)
    expect(policy.holdingContext).toBe('none')
  })
})

describe('8. liabilities are not treated as negative assets', () => {
  it('a mortgage lands in liabilities, never as a negative-value Asset', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    expect(initialState.assets.every((a) => a.value >= 0)).toBe(true)
    const mortgage = initialState.liabilities.find((l) => l.kind === 'mortgage')!
    expect(mortgage.balance).toBeCloseTo(412650.88, 2)
  })
})

describe('9. import date becomes Initial State date', () => {
  it('truncates the Kubera as-of date to the domain YearMonth', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    expect(initialState.asOf).toBe('2026-08')
  })
})

describe('10. empty/irrelevant Kubera rows do not create financial state', () => {
  it('a null-value row and a zero-value row produce no asset/liability entry', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    expect(initialState.assets.some((a) => a.name.includes('Rollover Pending'))).toBe(false) // a15, null value
    expect(initialState.liabilities.some((l) => l.name.includes('Summit Home Lending'))).toBe(false) // d3, zero value
  })
})

describe('11. ambiguous classifications are surfaced rather than silently guessed', () => {
  it('an unidentifiable retirement wrapper and a wrapper with no domain equivalent are flagged, not guessed', () => {
    const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)
    expect(initialState.assets.some((a) => a.name.includes('Profit-Sharing'))).toBe(false)
    expect(initialState.assets.some((a) => a.name.includes('Tax-Free Savings'))).toBe(false)
    expect(summary.needsManualInput.some((n) => n.source.includes('Profit-Sharing'))).toBe(true)
    expect(summary.needsManualInput.some((n) => n.source.includes('Tax-Free Savings'))).toBe(true)
  })

  it('a non-reporting-currency item is surfaced, never silently converted or dropped', () => {
    const { summary } = importKuberaSnapshot(fixtureSnapshot)
    expect(summary.unsupportedCurrency.some((u) => u.source.includes('Northshore Credit Union - Everyday') && u.currency === 'CAD')).toBe(true)
  })
})

describe('12. imported totals reconcile to the intended Kubera portfolio totals within the mapping rules', () => {
  it('every recognized USD item is accounted for exactly once across the resulting assets/liabilities', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const cash = initialState.assets.find((a) => a.holdingContext === 'none' && a.assetType === 'cash')!
    expect(cash.value).toBeCloseTo(8450.12 + 42310.77 + 320.0, 2)

    const assetTotal = initialState.assets.reduce((sum, a) => sum + a.value, 0)
    const liabilityTotal = initialState.liabilities.reduce((sum, l) => sum + l.balance, 0)
    const expectedAssetTotal = 8450.12 + 42310.77 + 320.0 + 214870.33 + (98765.43 + 54210.09) + (31000 + 22000) + 4200 + 26840 + 685000
    expect(assetTotal).toBeCloseTo(expectedAssetTotal, 2)
    expect(liabilityTotal).toBeCloseTo(412650.88, 2)
  })
})

describe('13. imported Initial State can initialize a Trajectory', () => {
  it('the imported asOf becomes the Trajectory\'s starting point with no adaptation', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const scenario = createScenario({
      name: 'Post-import baseline',
      start: initialState.asOf,
      end: addMonths(initialState.asOf, 11),
      events: [],
      parameters: { spending: 5000, taxRate: 0.2 },
      policies: [{ id: 'p1', kind: 'spending', priority: 1 }],
    })
    const trajectory = createTrajectory('From Kubera', [scenario])
    expect(trajectory.scenarios[0]!.start).toBe(initialState.asOf)
  })
})

describe('14. a simple Scenario can be calculated from the imported Initial State', () => {
  it('runs the existing engine on the imported Initial State and produces a valid Financial State', () => {
    const { initialState } = importKuberaSnapshot(fixtureSnapshot)
    const scenario = createScenario({
      name: 'Post-import baseline',
      start: initialState.asOf,
      end: addMonths(initialState.asOf, 11),
      events: [],
      parameters: { spending: 5000, taxRate: 0.2, equityReturn: 0.07, cashApy: 0.02 },
      policies: [{ id: 'p1', kind: 'spending', priority: 1 }, { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 }],
    })
    const trajectory = createTrajectory('From Kubera', [scenario])
    const result = calculate(initialState, trajectory)
    expect(result.monthly).toHaveLength(12)
    expect(result.monthly.every((s) => Number.isFinite(netWorth(s)))).toBe(true)
  })
})
