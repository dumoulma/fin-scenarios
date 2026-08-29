// Shape confirmed against the live Kubera Data API v3 (`GET /portfolio/<id>`) during
// prototypes/01-kubera-import, trimmed to the fields this importer actually reads.
// Real items carry many more fields (connection, geography, cagr, ...) we ignore.

export type KuberaMoney = { amount: number; currency: string } | { amount: number } | null

export type KuberaItemCategory = 'asset' | 'debt'

export type KuberaItem = {
  id: string
  name: string
  sectionName: string
  sheetName: string
  category: KuberaItemCategory
  value: KuberaMoney
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
