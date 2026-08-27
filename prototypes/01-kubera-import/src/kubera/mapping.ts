import type { AssetKind, LiabilityKind, RetirementWrapper } from '../domain/types.ts'
import type { KuberaItem } from './types.ts'

export type Classification =
  | { outcome: 'recognized'; kind: AssetKind | LiabilityKind; wrapper?: RetirementWrapper }
  | { outcome: 'ignored'; reason: string }
  | { outcome: 'needsManualInput'; reason: string }

const ROTH_IRA_PATTERN = /roth\s*ira/i
const TRADITIONAL_IRA_PATTERN = /\bira\b/i
const FOUR_OH_ONE_K_PATTERN = /401\s*\(?k\)?/i
const WHOLE_LIFE_PATTERN = /whole\s*life/i

/**
 * Real Kubera exports don't have a first-class "whole life cash value" category —
 * ours had one filed under sheetName "Retirement Investments" with subType "other".
 * Matching on the item's own name is more reliable than trusting Kubera's category.
 */
function classifyRetirementAccount(item: KuberaItem): Classification {
  if (WHOLE_LIFE_PATTERN.test(item.name)) {
    return { outcome: 'recognized', kind: 'wholeLifeCashValue' }
  }
  if (ROTH_IRA_PATTERN.test(item.name)) {
    return { outcome: 'recognized', kind: 'retirementAccount', wrapper: 'rothIRA' }
  }
  if (TRADITIONAL_IRA_PATTERN.test(item.name)) {
    return { outcome: 'recognized', kind: 'retirementAccount', wrapper: 'traditionalIRA' }
  }
  if (FOUR_OH_ONE_K_PATTERN.test(item.name)) {
    return { outcome: 'recognized', kind: 'retirementAccount', wrapper: '401k' }
  }
  return {
    outcome: 'needsManualInput',
    reason: `"${item.name}" is under Retirement Investments but its wrapper (401(k)/Roth/Traditional IRA) isn't identifiable from the name`,
  }
}

function classifyAsset(item: KuberaItem): Classification {
  if (item.sheetName === 'Retirement Investments') return classifyRetirementAccount(item)

  if (item.sheetName === 'Real Estate' && item.subType === 'primary residence') {
    return { outcome: 'recognized', kind: 'realProperty' }
  }

  if (item.sheetName === 'Cash') {
    if (item.subType === 'cash') return { outcome: 'recognized', kind: 'cash' }
    return {
      outcome: 'needsManualInput',
      reason: `"${item.name}" is filed under Cash but Kubera's subType is "${item.subType}" — confirm it's a real cash balance`,
    }
  }

  if (item.sheetName === 'Investments' && item.subType === 'investment' && item.assetClass === 'investment') {
    // Kubera's fields don't distinguish a plain taxable brokerage from a
    // non-US tax-advantaged wrapper like a Canadian TFSA — only the name does, and
    // our domain has no equivalent asset kind for the latter.
    if (/tax-free savings|tfsa/i.test(item.name)) {
      return {
        outcome: 'needsManualInput',
        reason: `"${item.name}" is a Canadian TFSA — no equivalent wrapper in the current asset model (not a plain taxable brokerage, not a 401(k)/IRA)`,
      }
    }
    return { outcome: 'recognized', kind: 'taxableBrokerage' }
  }

  return {
    outcome: 'ignored',
    reason: `unsupported asset category: sheet="${item.sheetName}" subType="${item.subType ?? 'unknown'}"`,
  }
}

function classifyLiability(item: KuberaItem): Classification {
  if (item.sheetName === 'Loans' && /mortgage/i.test(item.name)) {
    return { outcome: 'recognized', kind: 'mortgage' }
  }
  return {
    outcome: 'ignored',
    reason: `unsupported liability category: sheet="${item.sheetName}"`,
  }
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
