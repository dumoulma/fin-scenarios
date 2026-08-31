# Kubera mapping overrides — implementation notes

Replaces the hardcoded, name-pattern overrides added in the previous pass
(`KNOWN_401K_PROVIDER_PATTERN`, `KNOWN_US_ACCOUNTS_WITHOUT_GEOGRAPHY`) with a
general, data-driven correction mechanism. Those patterns worked for one real
account but couldn't be product architecture: a real deployment can't ship a
code change every time a user's Kubera export has an unrecognized 401(k)
provider or a bare-named mortgage.

## The shape

`core/src/kubera/types.ts` adds:

```ts
export type MappingOverride = {
  assetType?: AssetType
  holdingContext?: HoldingContext
  liabilityKind?: 'mortgage'
  country?: string // ISO 3166-1 alpha-2 — already resolved
}
export type MappingOverrides = Record<string, MappingOverride> // keyed by KuberaItem.id
```

`classify()` (`mapping.ts`) and `resolveCountry()` (`importer.ts`) both check
`overrides[item.id]` first, before any automatic heuristic. `mapping.ts` and
`importer.ts` now have zero hardcoded knowledge of any specific real account —
every regex left in them (roth/401(k)/IRA/HSA/whole-life name patterns, the
TFSA no-equivalent check) is a genuine general heuristic that would apply to
anyone's Kubera export, not a fix for one person's data.

`importKuberaSnapshot(snapshot, overrides, reportingCurrency)` threads
`overrides` through to both. Keyed by item id (not name) because that's what a
correction UI naturally produces — "the user clicked confirm on *this* row" —
and because names collide or change in ways a stable id doesn't.

## Where the personal data actually lives now

`core/src/kuberaImportDemo.ts` (the script standing in for the eventual
"Connect Kubera" UI) now defines `MY_KUBERA_OVERRIDES`, a small object of
Mathieu's own known corrections keyed by real Kubera item ids, passed only
when running with `--live`. This is the intended shape for the future: a
person (or an AI-assistant's first pass, confirmed by a person) fills in
exactly this kind of object through a UI, one row at a time, and it's stored
against their own connected portfolio — not compiled into the adapter.

Confirmed against the live account: identical recognized assets/liabilities
as the previous (hardcoded-pattern) version — cash, Schwab brokerage, the
Guideline 401(k), Roth IRA, the house, the Whole Life policy, and the
mortgage all still import correctly, now through the general mechanism.

## Test changes

- Removed the two tests that asserted the hardcoded patterns worked
  unconditionally (Guideline recognized "for free," Guardian/Gregory/Mortgage
  countries resolved "for free").
- Added tests proving: an override resolves what the automatic path can't; a
  second, unnamed item with the same ambiguous input ("others" country, an
  unmapped provider name) is *not* accidentally swept up by someone else's
  override; overrides are additive, not global rules.
- The "known payroll-401(k) provider" case is now explicitly documented as
  needing manual input *by default* — resolved only via an explicit override,
  proven in the same test file.
