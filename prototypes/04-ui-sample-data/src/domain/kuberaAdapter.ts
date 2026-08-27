import { fixtureSnapshot } from '../../../01-kubera-import/src/kubera/fixture.ts'
import { importKuberaSnapshot } from '../../../01-kubera-import/src/kubera/importer.ts'
import type { Asset as KuberaAsset, Liability as KuberaLiability } from '../../../01-kubera-import/src/domain/types.ts'
import type { ImportSummary } from '../../../01-kubera-import/src/summary.ts'
import type { Asset, FinancialState, Liability } from '../../../03-calculation-engine/src/domain/types.ts'

// Bridges 01's Kubera-import output into 03's calculation-engine shape. The two
// disagree on purpose: 03 added fields 01 never needed (mortgage interestRate/
// monthlyPayment, Whole Life policyLoanBalance) and dropped one 01 has (currency —
// 03 is single-currency by design). This is where that gap gets closed, explicitly.

const CANONICAL_PROPERTY_ID = 'home'
const CANONICAL_401K_ID = '401k'
const ASSUMED_MORTGAGE_ANNUAL_RATE = 0.06
const ASSUMED_MORTGAGE_REMAINING_YEARS = 30
const REPORTING_CURRENCY = 'USD'

function estimateMonthlyPayment(balance: number, annualRate: number, years: number): number {
  if (balance <= 0) return 0
  const monthlyRate = annualRate / 12
  const n = years * 12
  const factor = (1 + monthlyRate) ** n
  return (balance * monthlyRate * factor) / (factor - 1)
}

// Only 'home' (sellProperty) and '401k' (assetDelta) are ever referenced by asset id
// in 04's sample Trajectories (confirmed by grepping sampleData.ts) — everything else
// dispatches by asset.kind, so only these two need a stable, predictable id.
function adaptAsset(asset: KuberaAsset): Asset {
  switch (asset.kind) {
    case 'realProperty':
      return { kind: 'realProperty', id: CANONICAL_PROPERTY_ID, name: asset.name, marketValue: asset.marketValue }
    case 'retirementAccount':
      return {
        kind: 'retirementAccount',
        id: asset.wrapper === '401k' ? CANONICAL_401K_ID : asset.id,
        name: asset.name,
        wrapper: asset.wrapper,
        balance: asset.balance,
      }
    case 'wholeLifeCashValue':
      return { kind: 'wholeLifeCashValue', id: asset.id, name: asset.name, cashValue: asset.cashValue, policyLoanBalance: 0 }
    case 'cash':
      return { kind: 'cash', id: asset.id, name: asset.name, balance: asset.balance }
    case 'taxableBrokerage':
      return { kind: 'taxableBrokerage', id: asset.id, name: asset.name, balance: asset.balance }
  }
}

function adaptLiability(liability: KuberaLiability): Liability {
  return {
    kind: 'mortgage',
    id: liability.id,
    name: liability.name,
    balance: liability.balance,
    interestRate: ASSUMED_MORTGAGE_ANNUAL_RATE,
    monthlyPayment: estimateMonthlyPayment(liability.balance, ASSUMED_MORTGAGE_ANNUAL_RATE, ASSUMED_MORTGAGE_REMAINING_YEARS),
    propertyAssetId: CANONICAL_PROPERTY_ID,
  }
}

export type AdaptedInitialState = {
  financialState: FinancialState
  importSummary: ImportSummary
  droppedForCurrency: string[]
}

export function buildInitialStateFromKubera(): AdaptedInitialState {
  const { initialState, summary } = importKuberaSnapshot(fixtureSnapshot)

  const droppedForCurrency = [
    ...initialState.assets.filter((a) => a.currency !== REPORTING_CURRENCY).map((a) => `${a.name} (${a.currency})`),
    ...initialState.liabilities.filter((l) => l.currency !== REPORTING_CURRENCY).map((l) => `${l.name} (${l.currency})`),
  ]

  return {
    financialState: {
      asOf: initialState.asOf.slice(0, 7), // 01 uses "YYYY-MM-DD", 03 uses "YYYY-MM"
      assets: initialState.assets.filter((a) => a.currency === REPORTING_CURRENCY).map(adaptAsset),
      liabilities: initialState.liabilities.filter((l) => l.currency === REPORTING_CURRENCY).map(adaptLiability),
    },
    importSummary: summary,
    droppedForCurrency,
  }
}
