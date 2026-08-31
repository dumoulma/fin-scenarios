# Kubera live import — real bugs found against a live account

The importer had only ever been tested against the fixture. Running it live
(`cd core && npx tsx --env-file=<path to .env> src/kuberaImportDemo.ts --live`)
surfaced two real bugs — both in the client layer, before mapping ever runs —
plus one deliberate design call, and confirmed the full pipeline (import →
`InitialState` → `Trajectory` → `calculate()`) works end to end on real data.

## Bug 1: the portfolio-detail endpoint doesn't return its own currency

`getPortfolioData` (`GET /portfolio/<id>`) assumed the response had a
top-level `currency` field, per the original prototype's notes. Against the
live account, that field comes back `undefined`. Since every downstream
comparison is "does this item's currency match the reporting currency," a
`baseCurrency` of `undefined` meant *every* item — including plain USD cash —
was flagged as `unsupportedCurrency` and nothing imported at all.

The list endpoint (`GET /portfolio`), which the importer already calls first
to find the portfolio id, reliably returns `currency` per portfolio. Fixed by
having the caller pass that value into `getPortfolioData` explicitly instead
of trusting the detail endpoint to repeat it.

## Bug 2: country is nested under `geography`, not a top-level field

`KuberaItem.country` was added during the domain-convergence pass as a flat
optional string, without a live re-check. The real API nests it:
`geography: { country: "usa", region: "other" }` — and the value is a
lowercase full country name, not an ISO code. Every recognized item was
landing in `needsManualInput` as "missing country."

Fixed by reading `item.geography?.country` and mapping Kubera's country names
to ISO 3166-1 alpha-2 codes for storage in the domain (`usa` → `US`,
`canada` → `CA`, `japan` → `JP`, inferred from the same naming convention).
An unrecognized name still surfaces for manual input rather than guessing —
this list only covers what's actually been seen. Keeping the domain's
`Asset.country` as an ISO code (rather than Kubera's own display string) is
the right normalization either way: it's a stable key a UI can derive any
display form from, not something tied to one adapter's presentation choice.

## Design call: "others" for known, named accounts

Three real items — the Guardian Whole Life policy, the primary residence, and
its mortgage (bare-named "Mortgage," no more specific field to anchor on) —
all come back with `geography.country: "others"`: a real, literal value
Kubera returns for some manually-entered/unlinked items, not something a
general mapping table can resolve.

First pass surfaced these for manual input, on the reasoning that inventing a
country for an *unidentified* item would be fabricated detail. Pushed back on
correctly: these aren't unidentified — they're three specific, named accounts
this deployment already knows are real and US-based. Added
`KNOWN_US_ACCOUNTS_WITHOUT_GEOGRAPHY` in `importer.ts` (same shape as
`mapping.ts`'s `KNOWN_401K_PROVIDER_PATTERN`): a short, explicit, documented
list of known-account name patterns that resolve to `US` when Kubera's own
geography data is absent or unmappable. An *unnamed* "others" item still
correctly surfaces for manual input — the override is per known account, not
a blanket "others means US" rule. The bare `/^mortgage$/i` pattern is
intentionally scoped to this personal deployment modeling one known
portfolio; a shared/multi-tenant version would need a less generic anchor.

## What this actually recovered

Against the real account, everything meaningful now imports: checking +
savings cash, the Schwab taxable brokerage, the Guideline 401(k), the Roth
IRA, the primary residence, the Guardian Whole Life policy, and the mortgage.
Still correctly excluded, not guessed:

- Crypto holdings (no `AssetType` for them yet — out of scope, unchanged).
- A Canadian TFSA (no `HoldingContext` equivalent — already a known,
  documented gap).
- Two Alight retirement plans whose names don't identify a wrapper.
- Two CAD-denominated Canadian bank accounts (documented multi-currency gap,
  unchanged).
- A few stale $0 duplicate entries (a rollover-pending 401(k), an old IRA, a
  duplicate mortgage line) — correctly dropped as zero-value, not double
  counted.

No new tests needed a live connection — the fixture already had realistic
country/currency shapes at the flat-field level; it's now updated to the
confirmed nested `geography` shape, plus new tests for the ISO-code mapping,
the "unrecognized country" surfacing path, and the known-account override.
