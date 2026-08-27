# Prototype Handoffs

These four prototypes are deliberately throwaway. Their purpose is to de-risk the product/domain architecture through working software, not to establish the final implementation.

## Prototype sequence

1. **Kubera Import** — prove that a real financial snapshot can become an Initial State without manual reconstruction.
2. **Scenario & Trajectory Model** — prove that the core planning model is pleasant to manipulate, copy, branch, resize, and validate.
3. **Calculation Engine** — prove that Initial State + Trajectory + inputs can produce a useful monthly calculation and yearly Financial State snapshots using a purely functional design.
4. **UI with Sample Data** — prove that the Trajectory-as-cards interaction and projection visualization are intuitive enough to make scenario experimentation fun.

## Prototype philosophy

- Optimize for learning speed, not production readiness.
- Keep the domain vocabulary from `docs/domain/CONTEXT.md`.
- Prefer pure functions and immutable data.
- Do not prematurely design production interfaces, persistence, authentication, or generalized infrastructure.
- Use realistic sample data where it helps expose domain problems.
- Automated tests are part of each prototype's learning loop.
- It is acceptable, and desirable, to discover that a decision made in the domain model needs to change.
- Record meaningful discoveries after each prototype before moving toward the full product specification.

## Shared end-to-end hypothesis

```text
Kubera
  ↓
Initial State
  ↓
Master Trajectory
  ├── Scenario
  ├── Scenario
  └── Scenario
  ↓
Calculation Engine
  ↓
Financial State over time
  ↓
Annual Financial Snapshots
  ↓
Visualization
```

The prototypes should collectively answer one question: **can this model make it easy to describe a financial life, change it, calculate the consequences, and see what happens?**
