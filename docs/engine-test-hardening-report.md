# Engine test hardening report

The new property layer lives under `core/test/property/`. It uses `fast-check` with a fixed seed and run count in each suite. A failing run prints the seed, shrink path, and counterexample, so it can be repeated directly with the reported seed.

## What it checks

- Monthly continuity, Financial State accounting for cash-only flows, scenario partitioning, trajectory copies and extensions.
- Policy priority, surplus single-allocation, and cash/equity deficit ordering.
- Linear asset splitting, Holding Context/growth separation, and country/currency metadata retention.
- Point-event timing and immutability, plus same-month Whole Life loans and withdrawals.
- Scenario-parameter locality, complete generated lives, and return monotonicity where the asset behavior guarantees it.
- Currency rejection when FX is absent.

## Bug found and fixed

The first multi-position cash property exposed that cash flows were applied to every cash Asset. A $100 one-time flow across checking and savings became $200. The engine, point-event handlers, and cash-reserve policy now route a cash movement to the first cash position, matching the existing policy convention of selecting a single cash source. This preserves aggregate accounting without inventing allocation rules between cash accounts.

## Confirmed assumptions

- Scenarios are contiguous and the engine emits one state per month.
- Identical event-free scenario partitions calculate equivalently.
- Asset country and currency survive state transitions, and unsupported currency combinations fail before calculation.
- Whole Life loans affect policy net value without reducing cash value; the borrowed cash offsets that policy liability in total Financial State net worth. Withdrawals move equivalent value to cash.

## Falsified assumptions

- The implementation did not safely support more than one cash Asset before this pass. The property above found the duplication defect.

## Still difficult or ambiguous

- Employment is intentionally local to a Scenario, so partition equivalence cannot apply to scenarios containing ongoing employment without copying/re-scoping its events.
- Point Whole Life loan and withdrawal Events do not currently enforce available-cash-value caps. Deficit-funding policy loans do. Whether direct Events should share that cap is a domain decision.
- Cash movement picks the first cash Asset. The model has no explicit destination/source account field, so multiple cash positions cannot yet express a desired allocation rule.
- FX is deliberately rejected rather than modeled. Cross-currency trajectories need an explicit conversion input before stronger multi-currency properties are appropriate.

## Recommended next iteration

Add an explicit cash-account target to cash-flow Events and Policies, define whether direct Whole Life operations must be capped, and make employment duration cross-scenario semantics an explicit domain choice. Once FX conversion exists, add conservation properties around converted amounts and rates.
