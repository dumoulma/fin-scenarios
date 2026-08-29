import type { AssetType, HoldingContext } from '../domain/types.ts'
import type { KuberaItem } from './types.ts'

export type Classification =
  | { outcome: 'recognizedAsset'; assetType: AssetType; holdingContext: HoldingContext }
  | { outcome: 'recognizedLiability'; liabilityKind: 'mortgage' }
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'needsManualInput'; reason: string }

const ROTH_PATTERN = /roth/i
const FOUR_OH_ONE_K_PATTERN = /401\s*\(?k\)?/i
const IRA_PATTERN = /\bira\b/i
const HSA_PATTERN = /\bhsa\b|health savings/i
const WHOLE_LIFE_PATTERN = /whole\s*life/i

function classifyRetirementAccount(item: KuberaItem): Classification {
  if (ROTH_PATTERN.test(item.name)) {
    return { outcome: 'recognizedAsset', assetType: 'equity', holdingContext: 'rothRetirement' }
  }
  if (FOUR_OH_ONE_K_PATTERN.test(item.name) || IRA_PATTERN.test(item.name)) {
    return { outcome: 'recognizedAsset', assetType: 'equity', holdingContext: 'traditionalRetirement' }
  }
  return {
    outcome: 'needsManualInput',
    reason: `"${item.name}" is under Retirement Investments but its wrapper (401(k)/IRA/Roth) isn't identifiable from the name`,
  }
}

function classifyAsset(item: KuberaItem): Classification {
  // Name-based checks first, ahead of Kubera's own category — the real export we
  // inspected filed a Whole Life cash value under "Retirement Investments" with
  // subType "other", no dedicated category. The item's own name proved more
  // reliable than trusting sheetName/subType for these.
  if (WHOLE_LIFE_PATTERN.test(item.name)) {
    return { outcome: 'recognizedAsset', assetType: 'wholeLifeInsurance', holdingContext: 'none' }
  }
  if (HSA_PATTERN.test(item.name)) {
    return { outcome: 'recognizedAsset', assetType: item.subType === 'cash' ? 'cash' : 'equity', holdingContext: 'hsa' }
  }

  if (item.sheetName === 'Retirement Investments') return classifyRetirementAccount(item)

  if (item.sheetName === 'Real Estate' && item.subType === 'primary residence') {
    return { outcome: 'recognizedAsset', assetType: 'realEstate', holdingContext: 'none' }
  }

  if (item.sheetName === 'Cash') {
    if (item.subType === 'cash') return { outcome: 'recognizedAsset', assetType: 'cash', holdingContext: 'none' }
    return {
      outcome: 'needsManualInput',
      reason: `"${item.name}" is filed under Cash but Kubera's subType is "${item.subType}" — confirm it's a real cash balance`,
    }
  }

  if (item.sheetName === 'Investments' && item.subType === 'investment' && item.assetClass === 'investment') {
    // Kubera's fields don't distinguish a plain taxable brokerage from a
    // non-US tax-advantaged wrapper like a Canadian TFSA — only the name does, and
    // the domain has no Holding Context equivalent for the latter.
    if (/tax-free savings|tfsa/i.test(item.name)) {
      return {
        outcome: 'needsManualInput',
        reason: `"${item.name}" is a Canadian TFSA — no equivalent Holding Context in the current domain model (not a plain taxable brokerage, not a US retirement wrapper)`,
      }
    }
    return { outcome: 'recognizedAsset', assetType: 'equity', holdingContext: 'taxableBrokerage' }
  }

  return {
    outcome: 'ignored',
    reason: `unsupported asset category: sheet="${item.sheetName}" subType="${item.subType ?? 'unknown'}"`,
  }
}

function classifyLiability(item: KuberaItem): Classification {
  if (item.sheetName === 'Loans' && /mortgage/i.test(item.name)) {
    return { outcome: 'recognizedLiability', liabilityKind: 'mortgage' }
  }
  return { outcome: 'ignored', reason: `unsupported liability category: sheet="${item.sheetName}"` }
}

export function classify(item: KuberaItem): Classification {
  if (item.parent) {
    return {
      outcome: 'ignored',
      reason: `individual security-level holding within "${item.parent.name}" — represented at the account level, not separately`,
    }
  }
  return item.category === 'asset' ? classifyAsset(item) : classifyLiability(item)
}
