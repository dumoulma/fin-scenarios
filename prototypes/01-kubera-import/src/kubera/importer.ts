import type { Asset, InitialState, Liability, RetirementWrapper } from '../domain/types.ts'
import type { ImportSummary } from '../summary.ts'
import { classify } from './mapping.ts'
import type { KuberaItem, KuberaSnapshot } from './types.ts'

function slug(...parts: string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// cash, taxableBrokerage, and each retirement wrapper aggregate multiple source
// accounts into one Asset (per currency) — see docs/prototypes/01-kubera-import.md's
// aggregation-level learning question. realProperty, mortgage, and
// wholeLifeCashValue stay one-to-one with their source item: a later calculation
// engine will likely need to reason about a specific house or policy individually.
const AGGREGATED_KINDS = new Set(['cash', 'taxableBrokerage', 'retirementAccount'])

type ResolvedValue = { amount: number; currency: string; currencyWasDefaulted: boolean }

function resolveValue(item: KuberaItem, baseCurrency: string): ResolvedValue | { error: string } {
  if (item.value === null) return { error: 'missing value' }
  const { amount } = item.value
  const rawCurrency = 'currency' in item.value ? item.value.currency : undefined
  const currencyWasDefaulted = rawCurrency === undefined
  const currency = rawCurrency ?? baseCurrency
  if (amount === 0) {
    return { error: 'zero value — confirm whether this is accurate (e.g. paid off) or a stale/duplicate source entry' }
  }
  return { amount, currency, currencyWasDefaulted }
}

type RecognizedItem = {
  item: KuberaItem
  kind: string
  wrapper?: RetirementWrapper
  amount: number
  currency: string
  currencyWasDefaulted: boolean
}

export function importKuberaSnapshot(snapshot: KuberaSnapshot): { initialState: InitialState; summary: ImportSummary } {
  const recognizedSummary: ImportSummary['recognized'] = []
  const ignored: ImportSummary['ignored'] = []
  const needsManualInput: ImportSummary['needsManualInput'] = []
  const recognizedItems: RecognizedItem[] = []

  for (const item of snapshot.items) {
    const classification = classify(item)

    if (classification.outcome === 'ignored') {
      ignored.push({ source: item.name, reason: classification.reason })
      continue
    }
    if (classification.outcome === 'needsManualInput') {
      needsManualInput.push({ source: item.name, reason: classification.reason })
      continue
    }

    const resolved = resolveValue(item, snapshot.baseCurrency)
    if ('error' in resolved) {
      needsManualInput.push({ source: item.name, reason: resolved.error })
      continue
    }

    recognizedItems.push({ item, kind: classification.kind, wrapper: classification.wrapper, ...resolved })
  }

  const assets: Asset[] = []
  const liabilities: Liability[] = []
  const aggregated: ImportSummary['aggregated'] = []

  const groups = new Map<string, RecognizedItem[]>()
  for (const recognized of recognizedItems) {
    const groupKey = AGGREGATED_KINDS.has(recognized.kind)
      ? slug(recognized.kind, recognized.wrapper ?? '', recognized.currency)
      : slug(recognized.kind, recognized.item.name)
    const group = groups.get(groupKey) ?? []
    group.push(recognized)
    groups.set(groupKey, group)
  }

  for (const [id, group] of groups) {
    const kind = group[0]!.kind
    const wrapper = group[0]!.wrapper
    const currency = group[0]!.currency
    const balance = group.reduce((sum, r) => sum + r.amount, 0)
    const name = group.length === 1 ? group[0]!.item.name : `${kind}${wrapper ? ` (${wrapper})` : ''} — ${currency}`

    if (kind === 'mortgage') {
      liabilities.push({ kind: 'mortgage', id, name, balance, currency })
    } else if (kind === 'wholeLifeCashValue') {
      assets.push({ kind: 'wholeLifeCashValue', id, name, cashValue: balance, currency })
    } else if (kind === 'realProperty') {
      assets.push({ kind: 'realProperty', id, name, marketValue: balance, currency })
    } else if (kind === 'retirementAccount') {
      assets.push({ kind: 'retirementAccount', id, name, wrapper: wrapper!, balance, currency })
    } else {
      assets.push({ kind: kind as 'cash' | 'taxableBrokerage', id, name, balance, currency })
    }

    if (AGGREGATED_KINDS.has(kind)) {
      aggregated.push({ intoAssetId: id, sources: group.map((r) => r.item.name) })
    }

    for (const r of group) {
      recognizedSummary.push({
        source: r.item.name,
        mappedTo: r.currencyWasDefaulted ? `${id} (currency defaulted to ${r.currency})` : id,
      })
    }
  }

  return {
    initialState: { asOf: snapshot.asOfDate, assets, liabilities },
    summary: { recognized: recognizedSummary, aggregated, ignored, needsManualInput },
  }
}
