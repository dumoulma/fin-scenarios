# Financial Trajectory Planner — UI Design Guide

## 1. Product Philosophy

The application is fundamentally a financial simulation playground.

The user should be able to:

1. Start from their real financial position.
2. Define a life plan.
3. Calculate it.
4. See how their financial state evolves over time.
5. Duplicate the plan.
6. Change assumptions, scenarios, policies, or events.
7. Immediately see how the alternative plays out.
8. Compare alternatives.
9. Decide whether an alternative is better.
10. Optionally promote an alternative to become the new Master Trajectory.

The UI should make this feel fast, visual, intuitive, and reversible.

The user should spend their time thinking about:

> "What happens if I do this?"

—not about configuring retirement-planning software.

## 2. The Core Mental Model

The application has one persistent Master Trajectory.

This is: **The Plan**

At any point, the user can explore alternatives without destroying the Master.

```text
                     MASTER TRAJECTORY
                           │
                    "The Plan"
                           │
              ┌────────────┼────────────┐
              │            │            │
           What if A    What if B    What if C
              │            │            │
           modified     modified     modified
           copy         copy         copy
```

Alternative Trajectories are disposable experiments.

The user should always be able to return to the Master and know:

> "This is my actual plan."

This distinction is central to the product.

## 3. Trajectory Is the Primary Visual Object

The primary planning surface is a Trajectory.

A Trajectory consists of a contiguous sequence of Scenarios.

Visually, think of it as a train of Scenario cards:

```text
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Scenario A   │──▶│ Scenario B   │──▶│ Scenario C   │
│              │   │              │   │              │
│ 2026–2030    │   │ 2030–2038    │   │ 2038–...    │
└──────────────┘   └──────────────┘   └──────────────┘
```

The cards should be:

- visually distinct;
- movable;
- easy to inspect;
- easy to duplicate;
- easy to modify;
- easy to add/remove;
- clearly ordered in time.

The user should be able to manipulate the trajectory almost like a timeline editor.

## 4. Scenarios Are Cards

A Scenario card represents a period of life circumstances.

A card should expose enough information to make the trajectory understandable without opening it.

For example:

```text
┌───────────────────────────────┐
│ Working                       │
│ Jan 2026 – Dec 2030           │
│                               │
│ Income      $270k             │
│ Spending    $120k             │
│ Inflation   2.5%              │
│                               │
│ Events       4                │
│ Policies     3                │
└───────────────────────────────┘
```

The exact information displayed is TBD.

The important principle is:

> A user should be able to understand the shape of their life plan by looking at the cards.

## 5. Scenarios Form a Train

Scenarios are contiguous.

There are no gaps and no overlaps.

If a Scenario's duration changes, neighboring boundaries should move appropriately so the Trajectory remains valid.

The UI should make this feel natural.

For example:

```text
2026                 2030             2038
│────────────────────│─────────────────│
       Working              Japan
```

Dragging a boundary should adjust the neighboring Scenario rather than creating invalid temporal states.

The user should not have to manually repair gaps.

### Confirmed interaction (validated against a working prototype)

Three specific mechanics were built and tested end-to-end, and the direction is confirmed — treat these as decided, not open questions:

**Drag to resize.** Grabbing the edge between two Scenarios and dragging it moves the shared boundary. Only the *immediate* neighbor absorbs the change, by keeping its own far end fixed and letting its own duration shrink or grow. Nothing further down the Trajectory moves. This is not a UI-only rule — it matches the engine's actual `resizeScenario` behavior, so the UI and the domain must never disagree about what "resize" means.

**Click to insert, don't open a dialog.** Hovering the gap between two Scenarios reveals a small "+" affordance. Clicking it immediately splits the *right-hand* neighbor's remaining duration in half and inserts a new, renamable, deletable Scenario there — no duration prompt, no form. The user adjusts the new Scenario's length afterward by dragging its edges, same as any other boundary. Insert-then-adjust felt right in testing; configure-then-insert (a popover asking for a duration up front) did not get built for a reason — it's a step closer to "form," and this product should feel like direct manipulation instead (see §22, Avoid Calculator UI).

**Click the chart to inspect a point in time.** Below the trajectory visualization, a summary strip shows net worth (and the year, and change from the start) for a selected point. By default it shows the end of the Trajectory. Clicking anywhere on the net-worth chart moves the selection to that point and updates the summary immediately.

## 6. Scenario Content

A Scenario contains:

- Events
- Policies
- Scenario Parameters / economic parameters

Scenario Parameters include things such as:

- spending;
- inflation;
- tax assumptions;
- other economic assumptions.

The UI should not expose unnecessary calculation machinery.

For example, the user thinks:

> Spending: $10,000/month

not:

> Create monthly negative cash-flow event with recurrence rule.

The engine handles normalization and calculation.

## 7. Events

Events are the things that cause changes in financial circumstances.

The conceptual model is deliberately simple:

> An Event is an occurrence represented by a timestamp or a period, with its behavior determined by its Event Type.

Examples:

- start employment;
- end employment;
- inheritance;
- buy property;
- sell property;
- receive gift;
- bond maturity;
- retirement;
- start pension;
- receive dividends.

Some Events are instantaneous. Some Events have a start and end and remain active during a period.

Events always occur within a Scenario.

The UI should let users express these in natural financial/life terms rather than exposing implementation concepts.

## 8. Income Is Calculated

The user should not have to manually construct a total income number.

Income is derived from the active Events and Assets.

For example:

```text
Income
├── salary
├── interest
├── dividends
├── bond maturity
├── inheritance
├── pension
└── other income events
```

The Scenario supplies the context. The engine calculates the resulting income.

This distinction should be reflected in the UI:

- **Spending** — a simple Scenario parameter.
- **Income** — something the application derives from the financial model.

## 9. Policies

Policies determine what happens to:

> Income − Spending

Policies are essentially prioritized financial decisions.

For example:

```text
Income
   -
Spending
   ↓
Surplus / Deficit
   ↓
Policy 1
   ↓
Policy 2
   ↓
Policy 3
```

Possible policies include:

- invest surplus;
- contribute to retirement;
- pay down mortgage;
- maintain cash;
- fund Whole Life;
- draw from an asset;
- borrow when necessary.

The UI should make the priority ordering obvious. A user should be able to drag policies into a different order and immediately see the consequences.

Policies belong to Scenarios. They do not silently change mid-Scenario. If the user wants different policies, the natural interaction is to create another Scenario.

Policies can be copied from one Scenario to another.

## 10. Assets

Assets are modeled according to Asset Type.

The user may choose their desired level of detail.

The system should support:

**Very simple**

```text
Equity
$500k
7% return
```

**Asset-class level**

```text
US Equity
$400k
7% return
1.5% distributions

International Equity
$100k
6% return
2.5% distributions
```

**Detailed**

```text
S&P 500 ETF
High Dividend ETF
International ETF
...
```

The user should not be forced into ticker-level modeling. Detail is optional. This is an important usability principle.

## 11. Holding Contexts

Asset Types can exist inside different Holding Contexts.

For example:

```text
Pre-tax
├── Equity
├── Fixed Income
└── Cash

Roth
├── Equity
└── Fixed Income

HSA
└── Equity
```

The underlying asset behavior remains fundamentally about the asset. The Holding Context determines relevant tax treatment.

The UI should therefore make it easy to understand both dimensions:

> What is the money invested in?

and

> Where is it held?

without making users understand the internal domain model.

## 12. Financial State

Financial State is the primary output of the calculation engine.

It represents:

- Assets
- Liabilities
- Net worth

at a point in time.

The calculation runs at monthly ticks internally.

```text
Initial State
     ↓
Month 1
     ↓
Financial State
     ↓
Month 2
     ↓
Financial State
     ↓
...
```

The UI should make the resulting evolution highly visual.

## 13. The Main Visualization

The main visualization should feel broadly like ProjectionLab's trajectory visualization, but applied to our model.

The user should be able to see:

- net worth over time;
- assets;
- liabilities;
- major changes;
- scenario boundaries;
- important events;
- potentially income/spending.

The visualization should always correspond to the currently selected Trajectory.

When the user changes a Scenario: recalculate → visualization updates.

The experience should feel immediate.

Confirmed in prototype: the visualization is clickable, not just readable — see §5's "Confirmed interaction" for the click-to-inspect-a-point behavior, and keep the visualization's time axis aligned with the Scenario timeline above it so a boundary drag and a chart inflection point visibly correspond to the same moment.

## 14. One Trajectory at a Time

ProjectionLab's useful mental model is:

> One plan → one projection.

Our system extends this concept.

The normal view is still:

> One Trajectory → one visualization.

The user first understands an individual plan. Comparison is a separate mode.

This prevents the UI from becoming an incomprehensible multi-line financial chart by default.

## 15. What-If Trajectories

The user should be able to duplicate the Master Trajectory.

For example:

```text
MASTER
"Current Plan"

        ↓ Duplicate

WHAT IF
"Retire at 60"

        ↓ Duplicate

WHAT IF
"Move to Japan at 58"
```

Each duplicate is an independent Trajectory. The original Master remains unchanged.

This should be a one-action operation.

## 16. Comparison Mode

The application should support an arbitrary number of alternative Trajectories.

In practice, users will probably compare 2–3.

For example:

```text
                 Master     Retire 60     Japan 58
2026               $1.2M       $1.2M         $1.2M
2030               $1.6M       $1.5M         $1.7M
2040               $2.8M       $2.1M         $3.1M
2050               $3.5M       $2.4M         $3.8M
```

The comparison visualization should use the same calculation engine and same output model. There should be no separate "comparison calculator."

Comparison is simply:

```text
Trajectory A
Trajectory B
Trajectory C
      ↓
same engine
      ↓
Financial State sequences
      ↓
comparison visualization
```

## 17. Master Trajectory

The Master Trajectory is special primarily because of its role in the user's workflow.

It represents: the current plan.

The user can:

- modify it;
- duplicate it;
- compare alternatives against it;
- promote an alternative to become the Master.

The UI should make the Master visually identifiable. But the underlying calculation model should remain the same. There should not be a separate Master calculation engine.

## 18. Promoting an Alternative

A useful workflow:

```text
Master
  │
  ├── What If A
  ├── What If B
  └── What If C
```

The user decides: What If B is actually better. They can make B the new Master.

Conceptually:

```text
Old Master
     ↓
Alternative B
     ↓
New Master
```

The previous Master should not necessarily disappear immediately; preserving it as an alternative/history is preferable. The exact persistence/history behavior is TBD.

## 19. Interaction Principle: Experimentation Must Be Cheap

The UI should encourage experimentation.

A user should feel comfortable asking:

> What if I retire two years earlier?

then:

> What if I move to Japan?

then:

> What if I keep working until 65?

then:

> What if I sell the condo?

Each should be a few interactions rather than a configuration exercise.

The product's core loop is:

```text
Change
  ↓
Calculate
  ↓
See
  ↓
Compare
  ↓
Change again
```

This loop should be exceptionally smooth.

## 20. Reversibility

Experimentation should be reversible.

The user should not fear destroying their plan by experimenting.

The Master/Alternative distinction provides the primary safety mechanism.

Within an alternative Trajectory, normal editing should also feel reversible.

Prefer:

- duplication;
- explicit promotion;
- undo/history where useful;

over destructive operations.

## 21. Visual Hierarchy

The application should have three conceptual layers:

**Layer 1 — Plan**
Trajectory / Scenario cards
*What am I assuming will happen?*

**Layer 2 — Mechanics**
Events / Policies / Assets / Parameters
*What makes this plan behave this way?*

**Layer 3 — Outcome**
Financial State visualization
*What happens financially?*

The user should be able to move between these layers without losing context.

## 22. Avoid Calculator UI

The application should not feel like a giant form.

Avoid:

```text
Enter age:
Enter salary:
Enter retirement age:
Enter spending:
Enter return:
Enter inflation:
...
```

Instead, users should manipulate a model of their life. The UI should progressively reveal detail.

For example:

```text
Working
2026–2032
$270k income
$120k spending
```

can expand into the underlying Events and Policies when the user wants to understand or modify it.

## 23. Progressive Detail

The application should support multiple levels of sophistication.

A beginner might have:

```text
Brokerage
$500k
7%
```

An advanced user might have:

```text
Brokerage
├── S&P 500
│   ├── $350k
│   ├── 7.5% growth
│   └── 1.3% distribution
│
└── Dividend ETF
    ├── $150k
    ├── 5% growth
    └── 4% distribution
```

Both should use the same underlying model. The UI should not force complexity before it is useful.

## 24. Real Data First

Kubera provides the user's Initial State.

The ideal onboarding flow is:

```text
Connect Kubera
      ↓
Import Initial State
      ↓
Review / correct mapping
      ↓
Create first Scenario
      ↓
Calculate
      ↓
See projection
```

The user should not have to recreate their entire financial life manually.

Kubera-specific concepts should not leak into the core UI/domain model.

## 25. Prototype Priorities

For the first UI prototype, do not attempt to build the complete application.

The prototype should prove the core interaction loop:

```text
Sample Initial State
       ↓
Trajectory
       ↓
Scenario cards
       ↓
Edit / duplicate / rearrange
       ↓
Calculate
       ↓
Projection visualization
       ↓
Duplicate Trajectory
       ↓
Change alternative
       ↓
Compare
```

Use sample data initially if necessary.

The goal is to discover: *does this interaction model actually feel good?* — not to complete the product.

## 26. The Most Important UX Test

The eventual prototype should answer this question:

> Can a user understand their plan, change something meaningful, and immediately understand the financial consequence without thinking about the underlying software model?

If yes, we are on the right track.

If the user has to think about:

- Event Types;
- calculation ticks;
- Financial State transitions;
- asset behaviors;
- tax wrappers;
- normalization;
- engine internals;

then the UI is exposing the architecture instead of expressing the user's mental model.

## 27. Design North Star

The application should feel less like:

> retirement planning software

and more like:

> a visual simulator for your financial life.

The emotional loop should be:

> "Hmm… what if I did this?"
> → change the plan
> → "Oh, that's interesting."
> → see the projection
> → duplicate it
> → "What if I do this instead?"
> → compare
> → decide.

That experimentation loop is the product.
