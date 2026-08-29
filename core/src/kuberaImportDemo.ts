import { renderSummary } from './kubera/summary.ts'
import { getPortfolioData, listPortfolios } from './kubera/client.ts'
import { fixtureSnapshot } from './kubera/fixture.ts'
import { importKuberaSnapshot } from './kubera/importer.ts'
import type { InitialState } from './domain/types.ts'

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
  return getPortfolioData(credentials, portfolio.id)
}

const snapshot = await loadSnapshot()
const { initialState, summary } = importKuberaSnapshot(snapshot)

printInitialState(initialState)
console.log('\n---\n')
console.log(renderSummary(summary))
