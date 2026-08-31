# Matt's Portfolio — Policy Gap Tests

> **Note:** this is the original spec as committed (locally, as `9f3f966`, never
> pushed). It targeted `prototypes/03-calculation-engine` from a stale checkout
> that predated this session's work on `core/`. The actual implementation was
> re-scoped against `core/` — see `docs/matt-portfolio-tests-notes.md` and
> `core/test/policyGaps.test.ts`. Kept here verbatim for the real scenario
> details (income, spending, the six-policy stack) and as a historical record
> of what was originally asked for.

## Purpose

A spec for whatever coding agent picks this up next: the calculation engine
(`prototypes/03-calculation-engine`) cannot yet cleanly model Mathieu's actual
10-year financial scenario. Rather than describe the gaps in prose, they're
encoded as failing tests — making them pass *is* the implementation task.

## The scenario being modeled

Single 10-year Scenario, starting from Mathieu's actual Kubera-imported net
worth, with this policy stack in priority order:

1. Pay Guardian (Whole Life) premium
2. Max 401(k) contribution (calendar-year cap)
3. Maintain cash buffer: $20k at Chase, $25k at Wealthfront (two independent targets)
4. $1,000/mo fixed contribution to Schwab (taxable brokerage ETFs), 5% expected growth
5. Max Guardian PUA (paid-up additions) contribution (its own, separate calendar-year cap)
6. Everything left over → Schwab

Income: $270k/yr gross, taxable. Spending: $8k/mo. Output needed: net worth at
the end of each of the 10 years.

## Current status: not fully supported

Two prerequisites, tracked separately, not part of this test file:

- **Kubera import miss** — the real 401(k) (held at "Gusto/Guideline
  ***3237") doesn't match the importer's name-based 401(k) pattern
  (`prototypes/01-kubera-import/src/kubera/mapping.ts`) and falls into
  `needsManualInput`, so it's silently absent from any imported initial state.
- **Real figures still unknown** — Guardian premium amount, the 401(k) annual
  cap, and the Guardian PUA rider's annual cap. The tests below use clearly
  labeled placeholder numbers; swap them for real figures once known.

The engine/domain gaps are encoded as tests in
`prototypes/03-calculation-engine/test/policyGaps.test.ts`. Run with
`npm test` from that directory. As of this writing:

| Test | Fails how | Gap it specifies |
|---|---|---|
| Two cash reserve targets | wrong answer | `maintainCashReserve` only ever sees one hardcoded target/asset — can't give Chase and Wealthfront independent targets |
| Leftover-pool sweep | wrong answer | end-of-month leftover cash is broadcast to *every* cash asset instead of one designated operating account |
| Guardian premium | throws | no `payPremium` PolicyKind exists |
| $1k/mo fixed Schwab DCA | throws | no fixed-dollar contribution PolicyKind exists (only "claim everything" or "claim the shortfall to a target") |
| Max 401(k), annual cap | throws | no retirement-contribution PolicyKind, and no state that persists a running total across months within a calendar year |
| Max PUA, annual cap | throws | same state gap, needs its own independent running total from the 401(k)'s |
| Capstone (the full 6-policy stack, 10 years) | throws on policy #1 | the real scenario end to end — this should be the last one to go green |

## What's already been changed (type contract only, no behavior)

`prototypes/03-calculation-engine/src/domain/types.ts`:
- `PolicyKind` extended with `payPremium | fixedContribution | contributeRetirement | maxPua`
- `Policy` extended with optional `assetId` / `targetParam` / `amountParam` / `annualCapParam`

This alone makes `npx tsc --noEmit` fail in that package (`policyHandlers` is
typed as `Record<PolicyKind, PolicyHandler>`, so it's missing 4 required
properties) — a second, compiler-level forcing function alongside the 7 red
tests.

## Root cause tying most of these gaps together

The engine has no concept of a calendar-year boundary or policy-persistent
state — `calculate()` is a pure per-month fold with no accumulator that
survives across months. Annual caps (401(k), PUA) can't exist until
`engine/calculate.ts` threads some form of "claimed so far this year, per
policy" through the month loop and resets it every January. Note that
supplying the cap itself at yearly granularity (e.g. a COLA-adjusted 401(k)
limit that changes each calendar year) is *already* possible without engine
changes — `ParameterProvider` takes `month` as an argument — but that's
orthogonal to the running-total/reset problem above.

## Out of scope here

- The Kubera-import 401(k) misclassification (tracked separately).
- A UI for correcting import misclassifications.
- Application-level persistence (obviously needed eventually, already
  deliberately deferred per `docs/prototypes/03-calculation-engine.md`).
