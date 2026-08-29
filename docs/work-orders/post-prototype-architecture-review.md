# Work Order: Post-Prototype Architecture & Domain Review

## Baseline

Review the implementation at commit `42d0785` on `worktree-kubera-import`.

The prototype has now validated the calculation engine across the progressive test suite and validated the real-world Kubera → Initial State seam. Do not redesign from theory. Review what the implementation has taught us.

## Objective

Produce a concise architecture/domain review that answers:

1. What did implementation validate?
2. What did implementation falsify, weaken, or make obsolete?
3. What new domain concepts or seams did implementation reveal?
4. What should change before beginning the UI prototype?

This is a **review only**. Do not refactor production code, redesign the domain, or implement proposed changes.

## Review scope

Read and compare:

- `docs/domain/CONTEXT.md`
- architecture documentation under `docs/`
- ADRs under `docs/adr/` if present
- the implementation at/around `42d0785`
- the 50 domain test scenarios and their implementations
- the Kubera importer and its tests
- the Whole Life implementation
- the Policy implementation
- the calculation engine

Pay particular attention to:

- Initial State
- Financial State
- Trajectory
- Scenario
- Event / Event Type
- Asset Position / Asset Type
- Holding Context
- Scenario Parameters / economic parameters
- Policy and Policy priority
- monthly Time Tick
- deterministic calculation
- future stochastic/Input Generator seam
- Kubera adapter seam

## Architecture vocabulary

Use the project's `codebase-design` vocabulary when evaluating architecture:

- module
- interface
- depth
- seam
- adapter
- leverage
- locality

Apply the deletion test where useful: would deleting a suspected module concentrate complexity, or merely move it?

Do not propose interfaces merely for mocking. The architecture is intentionally functional, and testability should primarily come from pure behavior and black-box seams.

## Testing philosophy

The project strongly prefers **black-box integration tests** over mock-heavy unit tests.

Evaluate the architecture with that preference in mind:

- Prefer tests through public domain/calculation interfaces.
- Prefer real collaborators.
- Avoid mocks and interaction-based tests.
- Use realistic fixtures for external data rather than mocking external-domain behavior.
- Unit-test isolated pure behavior only where it provides meaningful additional confidence.
- Do not introduce an abstraction solely to make something mockable.

Explicitly identify whether any current testing pattern creates unnecessary mocks or shallow test seams. If the functional design means mocks are unnecessary, say so.

## Questions to investigate

### 1. Domain fidelity

Does the implementation still match the domain model? Identify any places where the code forced a more precise definition.

In particular, assess these refinements:

- Asset Type owns reusable behavior while an Asset Position may carry instance-specific facts.
- Event Type owns reusable behavior while an Event carries occurrence-specific facts.
- Policies are ordered reconciliation rules operating on the net cash position.
- Whole Life is specialized Asset Type behavior rather than a separate simulation system.

### 2. Financial State

Is Financial State sufficiently clean as the central state-transition representation?

Does anything currently leak Scenario concerns, calculation machinery, or external-source concepts into Financial State?

### 3. Currency

The Kubera prototype surfaced a real issue: the engine currently has no currency concept, while external data can contain non-reporting-currency holdings.

Determine whether:

- currency is genuinely a missing domain concept;
- it can remain an adapter-level concern for the foreseeable scope;
- a reporting-currency concept is sufficient; or
- deeper currency handling is justified.

Do not implement the solution. Give a recommendation and explain the tradeoff.

### 4. Asset Type / Holding Context

Does the separation remain deep and useful in the implementation?

Look for accidental coupling between asset behavior and tax/account-wrapper behavior.

### 5. Event / Event Type

Does the current implementation support both point-in-time and duration-based Events without special cases multiplying in the engine?

### 6. Policy

Assess whether Policy is now a strong domain abstraction or whether implementation has exposed awkward coupling.

Pay particular attention to policy priority, surplus/deficit reconciliation, contribution destinations, debt paydown, and Whole Life funding.

### 7. Scenario / Trajectory

Does the implementation naturally support the intended product model:

- contiguous Scenario train;
- Master Trajectory;
- copied alternative Trajectories;
- arbitrary what-if Trajectories;
- same engine and result shape for all Trajectories?

Identify anything that would make the eventual UI awkward.

### 8. Kubera seam

Assess whether the Kubera adapter is genuinely isolated.

Look for Kubera concepts leaking into the domain, and for domain concepts becoming shaped around Kubera's representation.

### 9. Calculation engine

Assess whether the monthly tick and Financial State transition remain the right core primitive.

Look for special cases that indicate the engine is becoming shallow or that domain behavior belongs elsewhere.

### 10. AI navigability

Identify areas where a future coding agent would have to understand too many files or follow too many indirections to safely modify one domain concept.

Favor locality and leverage over decomposition for its own sake.

## Output

Write a review document under `docs/` with:

1. **Executive summary**
2. **Validated architecture**
3. **Domain refinements learned from implementation**
4. **Architectural friction discovered**
5. **Currency assessment**
6. **Testing assessment**
7. **Recommended changes before UI**
8. **Explicit non-changes** — things that should *not* be refactored yet and why
9. **Top 3 follow-up questions** that should be resolved before the UI prototype

For every proposed architectural change, distinguish clearly between:

- evidence from implementation;
- interpretation;
- recommendation.

Do not turn the review into a generic architecture critique. The goal is to capture what this prototype has taught us and use that evidence to tighten the next iteration.

## Acceptance criteria

- Review is based on the actual implementation at `42d0785`.
- Existing ADRs are respected unless there is concrete implementation friction worth reopening.
- No production refactoring is performed.
- No mock-driven test architecture is introduced.
- Currency is explicitly assessed rather than silently resolved.
- The result gives a clear recommendation about what, if anything, should change before UI work begins.
