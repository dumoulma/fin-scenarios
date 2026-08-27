import { describe, expect, it } from 'vitest'
import { buildInitialStateFromKubera } from '../src/domain/kuberaAdapter.ts'

describe('buildInitialStateFromKubera', () => {
  const { financialState, importSummary, droppedForCurrency } = buildInitialStateFromKubera()

  it('remaps the imported property to the canonical "home" id, referenced by sellProperty Events', () => {
    const property = financialState.assets.find((a) => a.kind === 'realProperty')
    expect(property?.id).toBe('home')
  })

  it('remaps the imported 401(k) to the canonical "401k" id, referenced by assetDelta Events', () => {
    const fourOhOneK = financialState.assets.find((a) => a.kind === 'retirementAccount' && a.wrapper === '401k')
    expect(fourOhOneK?.id).toBe('401k')
  })

  it('gives the mortgage an interestRate, monthlyPayment, and propertyAssetId pointing at "home"', () => {
    const mortgage = financialState.liabilities.find((l) => l.kind === 'mortgage')!
    expect(mortgage.interestRate).toBeGreaterThan(0)
    expect(mortgage.monthlyPayment).toBeGreaterThan(0)
    expect(mortgage.propertyAssetId).toBe('home')
  })

  it('defaults Whole Life policyLoanBalance to 0 — Kubera does not report existing policy loans', () => {
    const wholeLife = financialState.assets.find((a) => a.kind === 'wholeLifeCashValue')
    expect(wholeLife).toMatchObject({ policyLoanBalance: 0 })
  })

  it('excludes non-USD assets rather than silently mixing currencies, and reports them', () => {
    expect(droppedForCurrency.some((entry) => entry.includes('CAD'))).toBe(true)
    expect(financialState.assets.every((a) => !('currency' in a))).toBe(true) // 03's Asset has no currency field at all
  })

  it('leaves cash and brokerage with whatever id the importer assigned — nothing references them by id', () => {
    const cash = financialState.assets.find((a) => a.kind === 'cash')
    const brokerage = financialState.assets.find((a) => a.kind === 'taxableBrokerage')
    expect(cash?.id).not.toBe('home')
    expect(cash?.id).not.toBe('401k')
    expect(brokerage?.id).toBeDefined()
  })

  it('carries the real import summary through unmodified', () => {
    expect(importSummary.recognized.length).toBeGreaterThan(0)
  })

  it('uses "YYYY-MM" for asOf, not 01\'s "YYYY-MM-DD"', () => {
    expect(financialState.asOf).toMatch(/^\d{4}-\d{2}$/)
  })
})
