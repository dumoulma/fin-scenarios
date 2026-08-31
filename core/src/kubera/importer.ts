import type { Asset, AssetType, HoldingContext, InitialState, Liability } from '../domain/types.ts'
import { classify } from './mapping.ts'
import type { KuberaItem, KuberaSnapshot, MappingOverrides } from './types.ts'

export type ImportSummary = {
  recognized: { source: string; mappedTo: string }[]
  aggregated: { intoAssetId: string; sources: string[] }[]
  ignored: { source: string; reason: string }[]
  needsManualInput: { source: string; reason: string }[]
  unsupportedCurrency: { source: string; currency: string }[]
}

function slug(...parts: string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Kubera returns geography.country as a lowercase full country name, not an ISO
// code — confirmed against a live account ("usa", "canada"). This list covers only
// what's actually been seen (plus "japan," inferred from the same naming
// convention); an unlisted name surfaces for manual input rather than a guess.
const KUBERA_COUNTRY_TO_ISO: Record<string, string> = { usa: 'US', canada: 'CA', japan: 'JP' }

// Kubera reports geography.country as the literal string "others" for some
// manually-entered/unlinked items (confirmed live: a Whole Life policy, a
// mortgage, a directly-entered property) — it genuinely has no geo data for
// them, so there's nothing generic to map. Resolving that is exactly what
// MappingOverrides.country is for; this function has no hardcoded knowledge of
// any specific account.
function resolveCountry(item: KuberaItem, overrides: MappingOverrides = {}): { country: string } | { error: string } {
  const overrideCountry = overrides[item.id]?.country
  if (overrideCountry) return { country: overrideCountry }
  const raw = item.geography?.country
  if (raw) {
    const iso = KUBERA_COUNTRY_TO_ISO[raw.toLowerCase()]
    if (iso) return { country: iso }
  }
  if (!raw) return { error: 'missing country' }
  return { error: `unrecognized country "${raw}"` }
}

type ResolvedValue = { amount: number; currency: string }

function resolveValue(item: KuberaItem, baseCurrency: string): ResolvedValue | { error: string } {
  if (item.value === null) return { error: 'missing value' }
  const { amount } = item.value
  const currency = 'currency' in item.value ? item.value.currency : baseCurrency
  if (amount === 0) {
    return { error: 'zero value — confirm whether this is accurate (e.g. paid off) or a stale/duplicate source entry' }
  }
  return { amount, currency }
}

// Cash and every equity-holding-context bucket aggregate multiple source accounts
// into one Asset — multiple checking accounts are still just "cash," and a 401(k)
// plus a Traditional IRA are both just "equity held in a traditional retirement
// wrapper" per docs/domain/CONTEXT.md's Asset Type / Holding Context split. Real
// estate and Whole Life stay one-to-one with their source item because an Event
// (sellProperty, a policy loan) targets one specific asset id.
function isAggregated(assetType: AssetType): boolean {
  return assetType !== 'realEstate' && assetType !== 'wholeLifeInsurance'
}

type RecognizedAsset = { item: KuberaItem; assetType: AssetType; holdingContext: HoldingContext; amount: number; country: string; currency: string }
type RecognizedLiability = { item: KuberaItem; amount: number }

/**
 * Kubera is the only place that understands Kubera's representation — this
 * function's output is built entirely from existing domain types (InitialState,
 * Asset, Liability). Nothing downstream (the calculation engine, a Trajectory)
 * needs to know Kubera exists.
 *
 * `overrides` is the seam for correcting whatever the automatic classifier/
 * geography lookup can't resolve on its own — supplied by a caller (eventually
 * a "Connect Kubera" UI, where a person or an AI-assistant's first pass fills
 * these in), never hardcoded here.
 */
export function importKuberaSnapshot(
  snapshot: KuberaSnapshot,
  overrides: MappingOverrides = {},
  reportingCurrency: string = snapshot.baseCurrency,
): { initialState: InitialState; summary: ImportSummary } {
  const recognizedSummary: ImportSummary['recognized'] = []
  const ignored: ImportSummary['ignored'] = []
  const needsManualInput: ImportSummary['needsManualInput'] = []
  const unsupportedCurrency: ImportSummary['unsupportedCurrency'] = []
  const recognizedAssets: RecognizedAsset[] = []
  const recognizedLiabilities: RecognizedLiability[] = []

  for (const item of snapshot.items) {
    const classification = classify(item, overrides)

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
    // The domain has no concept of currency — a Financial State is single-currency
    // by design. Rather than fabricate an FX rate, an item in a currency other than
    // the reporting one is surfaced, not silently converted or dropped.
    if (resolved.currency !== reportingCurrency) {
      unsupportedCurrency.push({ source: item.name, currency: resolved.currency })
      continue
    }
    const resolvedCountry = resolveCountry(item, overrides)
    if ('error' in resolvedCountry) {
      needsManualInput.push({ source: item.name, reason: resolvedCountry.error })
      continue
    }

    if (classification.outcome === 'recognizedAsset') {
      recognizedAssets.push({ item, assetType: classification.assetType, holdingContext: classification.holdingContext, amount: resolved.amount, country: resolvedCountry.country, currency: resolved.currency })
    } else {
      recognizedLiabilities.push({ item, amount: resolved.amount })
    }
  }

  const assets: Asset[] = []
  const aggregated: ImportSummary['aggregated'] = []
  const groups = new Map<string, RecognizedAsset[]>()
  for (const r of recognizedAssets) {
    const groupKey = isAggregated(r.assetType) ? slug(r.assetType, r.holdingContext, r.country) : slug(r.assetType, r.holdingContext, r.country, r.item.id)
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), r])
  }

  for (const [id, group] of groups) {
    const { assetType, holdingContext, country, currency } = group[0]!
    const value = group.reduce((sum, r) => sum + r.amount, 0)
    const name = group.length === 1 ? group[0]!.item.name : `${assetType} (${holdingContext}) — ${group.length} accounts`
    assets.push({ id, name, assetType, holdingContext, country, currency, value })

    if (group.length > 1) aggregated.push({ intoAssetId: id, sources: group.map((r) => r.item.name) })
    for (const r of group) recognizedSummary.push({ source: r.item.name, mappedTo: id })
  }

  const liabilities: Liability[] = recognizedLiabilities.map((r) => {
    const id = slug('mortgage', r.item.id)
    recognizedSummary.push({ source: r.item.name, mappedTo: id })
    return { id, name: r.item.name, kind: 'mortgage', balance: r.amount }
  })

  return {
    initialState: { asOf: snapshot.asOfDate.slice(0, 7), reportingCurrency, assets, liabilities },
    summary: { recognized: recognizedSummary, aggregated, ignored, needsManualInput, unsupportedCurrency },
  }
}
