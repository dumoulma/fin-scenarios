// Shape confirmed against the live Kubera Data API v3 (`GET /portfolio/<id>`),
// trimmed to the fields this importer actually reads. Real items carry many more
// fields (connection, cagr, ticker, ...) we ignore. `geography` was re-confirmed
// against a real live account: country is nested here, not a top-level field, and
// comes back as a lowercase full country name ("usa", "canada"), not an ISO code.

import type { AssetType, HoldingContext } from '../domain/types.ts'

export type KuberaMoney = { amount: number; currency: string } | { amount: number } | null

export type KuberaItemCategory = 'asset' | 'debt'

export type KuberaItem = {
  id: string
  name: string
  sectionName: string
  sheetName: string
  category: KuberaItemCategory
  value: KuberaMoney
  geography?: { country: string; region: string }
  subType?: string
  assetClass?: string
  /**
   * Present on security-level holdings nested under an account (e.g. an ETF inside a
   * brokerage account, or a coin inside a wallet). The parent item's own `value`
   * already includes these — an importer must skip items that have a `parent`, or it
   * will double-count.
   */
  parent?: { id: string; name: string }
}

export type KuberaSnapshot = {
  asOfDate: string
  baseCurrency: string
  items: KuberaItem[]
}

/**
 * A correction for one specific Kubera item, keyed by its stable `id` — this is
 * what an eventual "Connect Kubera" UI writes when a person (or an AI assistant
 * making a first pass before a person confirms) resolves an item the automatic
 * classifier/geography lookup couldn't. The adapter (mapping.ts, importer.ts)
 * stays fully generic: it never hardcodes knowledge about any specific real
 * account — that knowledge lives here, as plain data, supplied by the caller.
 */
export type MappingOverride = {
  assetType?: AssetType
  holdingContext?: HoldingContext
  liabilityKind?: 'mortgage'
  /** ISO 3166-1 alpha-2 — already resolved, not a raw Kubera country name. */
  country?: string
}

export type MappingOverrides = Record<string, MappingOverride>
