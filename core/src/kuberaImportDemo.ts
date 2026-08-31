import { renderSummary } from './kubera/summary.ts'
import { getPortfolioData, listPortfolios } from './kubera/client.ts'
import { fixtureSnapshot } from './kubera/fixture.ts'
import { importKuberaSnapshot } from './kubera/importer.ts'
import type { InitialState } from './domain/types.ts'
import type { MappingOverrides } from './kubera/types.ts'

// Stands in for what an eventual "Connect Kubera" UI would let a person (or an
// AI-assistant's first pass) confirm interactively, one item at a time. The
// importer itself (mapping.ts, importer.ts) has no hardcoded knowledge of these
// specific accounts — this is plain data, supplied by the caller, keyed by each
// item's stable Kubera id. Real ids for Mathieu's own live portfolio; irrelevant
// (and unused) against the fixture.
const MY_KUBERA_OVERRIDES: MappingOverrides = {
  'd1e9e543-9df6-4ff9-bee1-c0df5a680aab': { assetType: 'equity', holdingContext: 'traditionalRetirement' }, // Gusto/Guideline 401(k)
  'cb06304b-83c4-43e1-9fe3-4182d729462e': { country: 'US' }, // Guardian Life Whole Life — Kubera reports geography "others"
  '1ac68486-d7f8-4488-9d04-10ea8e34370c': { country: 'US' }, // 530 Gregory Ave — Kubera reports geography "others"
  '0bc9cb68-38b7-4fb3-bb41-a5c4840dbeda': { country: 'US' }, // Mortgage — Kubera reports geography "others"
}

function printInitialState(state: InitialState): void {
  console.log(`Initial State as of ${state.asOf}\n`)
  console.log('Assets:')
  for (const asset of state.assets) {
    console.log(`  [${asset.assetType} / ${asset.holdingContext}] ${asset.name}: ${asset.value.toLocaleString()}`)
  }
  console.log('\nLiabilities:')
  for (const liability of state.liabilities) {
    console.log(`  [${liability.kind}] ${liability.name}: ${liability.balance.toLocaleString()}`)
  }
}

async function loadSnapshot() {
  if (!process.argv.includes('--live')) return fixtureSnapshot

  const apiKey = process.env.KUBERA_API_KEY
  const apiSecret = process.env.KUBERA_API_SECRET
  if (!apiKey || !apiSecret) {
    throw new Error('KUBERA_API_KEY and KUBERA_API_SECRET must be set to use --live')
  }
  const credentials = { apiKey, apiSecret }
  const portfolios = await listPortfolios(credentials)
  const portfolio = portfolios[0]
  if (!portfolio) throw new Error('No Kubera portfolios found for this account')
  return getPortfolioData(credentials, portfolio.id, portfolio.currency)
}

const isLive = process.argv.includes('--live')
const snapshot = await loadSnapshot()
const { initialState, summary } = importKuberaSnapshot(snapshot, isLive ? MY_KUBERA_OVERRIDES : {})

printInitialState(initialState)
console.log('\n---\n')
console.log(renderSummary(summary))
