// This file must never import anything from src/kubera/* — it exists to prove the
// calculation engine's acceptance check literally: "Kubera-specific knowledge can be
// deleted from the engine without changing its behavior." The InitialState below is
// shaped like what an import would produce, but is written as a plain domain object.
import { describe, expect, it } from 'vitest'
import { addMonths } from '../src/domain/dates.ts'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth, type InitialState } from '../src/domain/types.ts'
import { calculate } from '../src/engine/calculate.ts'

describe('the engine has no dependency on Kubera-specific concepts', () => {
  it('calculates a Trajectory from a plain, importer-shaped Initial State using only domain types', () => {
    const initialState: InitialState = {
      asOf: '2026-08',
      assets: [
        { id: 'cash', name: 'cash (none)', assetType: 'cash', holdingContext: 'none', value: 51_080.89 },
        { id: 'brokerage', name: 'Fairview Brokerage', assetType: 'equity', holdingContext: 'taxableBrokerage', value: 214_870.33 },
        { id: '401k', name: 'equity (traditionalRetirement)', assetType: 'equity', holdingContext: 'traditionalRetirement', value: 152_975.52 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 412_650.88 }],
    }

    const scenario = createScenario({
      name: 'Post-import baseline',
      start: initialState.asOf,
      end: addMonths(initialState.asOf, 11),
      events: [],
      parameters: { spending: 5000, taxRate: 0.2, equityReturn: 0.07, cashApy: 0.02 },
      policies: [
        { id: 'p1', kind: 'spending', priority: 1 },
        { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
      ],
    })
    const trajectory = createTrajectory('From Kubera', [scenario])

    const result = calculate(initialState, trajectory)
    expect(result.monthly).toHaveLength(12)
    expect(result.monthly.every((s) => Number.isFinite(netWorth(s)))).toBe(true)
  })
})
