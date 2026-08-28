# Progressive Domain Test Scenarios

## Purpose

This document defines a progressive suite of domain-level test scenarios for the financial simulation engine. The tests are intentionally concrete and deterministic. They are intended to exercise the domain model and calculation semantics before implementation becomes elaborate.

The suite starts with single assets, single events, single policies, and simple one-scenario trajectories. It then introduces scenario transitions, multiple assets and flows, taxes, property, insurance, and finally combinations that approximate real planning use cases.

The tests should verify **Financial State transitions**, not implementation details. Where a test depends on a numerical convention (for example, whether a monthly return is applied before or after a cash flow), that convention should be made explicit by the implementation and then held constant across the suite.

## Common conventions for the tests

- Simulation resolution is monthly.
- A Trajectory begins at its Initial State date and ends at the end of its final Scenario.
- Scenarios are contiguous: no holes and no overlaps.
- Each monthly tick belongs to exactly one Scenario.
- Financial State contains assets and liabilities.
- Scenario Parameters include spending and economic parameters such as inflation, return assumptions, and tax assumptions.
- Spending is a Scenario-level total; it is not decomposed into individual expenses.
- Cash inflows are calculated from active Events and Asset behavior.
- Policies reconcile positive or negative net cash flow with the Financial State.
- Asset Positions identify an Asset Type and amount; calculation behavior comes from the Asset Type.
- Events identify an Event Type and timestamp; calculation behavior comes from the Event Type.
- These tests should initially use fixed numeric inputs. Stochastic Input Generators are introduced only in later tests.

---

# Level 1 — Core mechanics

## 01. Empty trajectory preserves state

**Setup:** Initial State contains $100,000 cash and no liabilities. One Scenario lasts one month, with $0 spending, no Events, and no Policies that move money.

**Expected:** Ending Financial State remains $100,000. No unexplained cash is created or destroyed.

**Exercises:** Initial State, one Scenario, monthly tick, identity transformation.

## 02. One equity asset grows

**Setup:** Initial State contains $100,000 Equity. One Scenario lasts one year. Equity Asset Type has a fixed 12% annual expected return. No cash flows, spending, or Policies.

**Expected:** Ending equity reflects the agreed monthly application of the 12% return. The annual result is deterministic.

**Exercises:** Asset Type behavior, economic return parameter, repeated monthly calculation.

## 03. Cash earns interest

**Setup:** Initial State contains $100,000 Cash. Cash Asset Type has a fixed 4% annual interest rate. One-year Scenario, no spending.

**Expected:** Ending Financial State includes the calculated interest according to the monthly convention.

**Exercises:** A second Asset Type with different behavior.

## 04. Equity distribution creates cash inflow

**Setup:** Initial State contains $100,000 Equity with 0% growth and a 4% annual distribution rate. Distribution is not automatically reinvested. One-year Scenario with spending equal to $0 and a Policy that leaves surplus in Cash.

**Expected:** $4,000 total cash inflow is generated over the year and appears as Cash rather than additional Equity.

**Exercises:** Asset-generated cash inflow, distribution behavior, Policy disposition.

## 05. Positive cash flow is invested

**Setup:** Initial State contains $100,000 Cash. Scenario has $10,000/month cash inflow from a simple recurring income Event and $8,000/month spending. Policy: invest all surplus into Equity.

**Expected:** $2,000/month is transferred into Equity; Cash does not accumulate the surplus.

**Exercises:** Income, spending, positive net cash flow, one Policy.

## 06. Positive cash flow accumulates in cash

**Setup:** Same as Test 05, but Policy sends all surplus to Cash.

**Expected:** Cash increases by $2,000/month before any applicable Cash behavior.

**Exercises:** Alternative Policy behavior.

## 07. Negative cash flow is funded by selling an asset

**Setup:** Initial State contains $100,000 Equity. Scenario has $8,000/month spending and $5,000/month income. Policy funds deficits by selling Equity.

**Expected:** $3,000/month of Equity is converted to Cash as needed to fund spending; ending Equity is reduced accordingly and the Financial State remains solvent.

**Exercises:** Negative net cash flow, asset disposition, Policy funding.

## 08. Negative cash flow increases debt

**Setup:** Initial State contains $10,000 Cash and no debt. Scenario has $5,000/month spending and $0 income. Policy permits borrowing once Cash is exhausted.

**Expected:** Cash reaches the defined floor and debt increases to fund subsequent deficits.

**Exercises:** Deficit Policy with liability creation.

## 09. One-time income Event

**Setup:** Initial State contains $100,000 Cash. One-year Scenario with $0 spending. An Inheritance Event occurs in month 6 for $50,000. Policy keeps surplus in Cash.

**Expected:** Financial State increases by exactly $50,000 at the Event's tick and remains at that level afterward.

**Exercises:** Point-in-time Event and one-time cash inflow.

## 10. One-time spending embedded in a Scenario

**Setup:** Initial State contains $100,000 Cash. Scenario spending is $5,000/month. A one-time $20,000 travel Event occurs in month 6.

**Expected:** The monthly Scenario spending continues unchanged and the additional $20,000 reduction occurs in month 6.

**Exercises:** Event-driven outflow alongside Scenario spending.

---

# Level 2 — Events and Scenario boundaries

## 11. Employment starts and generates monthly income

**Setup:** Initial State contains $100,000 Cash. One-year Scenario. Employment Started Event occurs at the Scenario start with salary income of $120,000/year. Spending is $5,000/month. Policy invests surplus in Equity.

**Expected:** Employment generates monthly income while active; monthly surplus is invested.

**Exercises:** Event-established ongoing behavior.

## 12. Employment ends

**Setup:** Employment starts in month 1 and an Employment Ended Event occurs at the start of month 7.

**Expected:** Salary is generated for months 1–6 and not for months 7–12.

**Exercises:** Start/end Events and active-period behavior.

## 13. One Scenario becomes two contiguous Scenarios

**Setup:** Scenario A: employed, $120k annual salary, $5k monthly spending, January–June. Scenario B: no employment income, $5k monthly spending, July–December. The Initial State is January 1.

**Expected:** June's ending Financial State is exactly July's starting Financial State. No gap or duplicated month exists.

**Exercises:** Scenario train and boundary semantics.

## 14. Scenario spending changes at a boundary

**Setup:** Scenario A has $6,000/month spending; Scenario B has $9,000/month spending. Both have the same income and Policies.

**Expected:** Spending changes exactly at the Scenario boundary with no need for a special spending-change Event.

**Exercises:** Scenario Parameters and boundary transition.

## 15. Scenario Policy changes at a boundary

**Setup:** Scenario A invests all surplus into Equity. Scenario B directs all surplus to Cash.

**Expected:** The same income/spending conditions produce different Financial State trajectories after the boundary.

**Exercises:** Scenario-local Policies.

## 16. Scenario economic parameters change

**Setup:** Scenario A uses 2% inflation and 6% Equity return. Scenario B uses 3% inflation and 7% Equity return.

**Expected:** Each tick uses the parameters belonging to its Scenario.

**Exercises:** Scenario Parameters and parameter locality.

## 17. Scenario duration changes and neighbors move

**Setup:** Three contiguous Scenarios A, B, C. Extend B by three months.

**Expected:** The trajectory remains contiguous; C begins three months later and the trajectory end moves accordingly if C's duration is preserved.

**Exercises:** Scenario duration invariant.

## 18. A trajectory may end at an arbitrary date

**Setup:** Initial State on January 1, 2026. One Scenario ends October 31, 2031.

**Expected:** Calculation stops at the end of that Scenario. No artificial terminal age is introduced.

**Exercises:** Trajectory end semantics.

---

# Level 3 — Multiple assets, wrappers, and flows

## 19. Equity and Fixed Income grow independently

**Setup:** Initial State has $100,000 US Equity and $100,000 Bonds. Equity return is 8%; Bond return is 4%. One-year Scenario.

**Expected:** Each Asset Type applies its own behavior and the combined Financial State reflects both results.

**Exercises:** Multiple Asset Types.

## 20. Two Equity positions with different behavior

**Setup:** Initial State has two Equity positions: $100,000 S&P 500 Equity at 8% growth/1.5% distribution and $100,000 high-dividend Equity at 5% growth/4% distribution.

**Expected:** Positions evolve independently and produce different cash inflows despite sharing the same broad Asset Type family.

**Exercises:** Optional modeling detail within an asset class.

## 21. Tax wrappers do not change growth behavior

**Setup:** Identical $100,000 Equity positions exist in Taxable Brokerage, Traditional 401(k), and Roth IRA containers. All use identical Equity behavior.

**Expected:** Pre-tax growth is identical; differences arise only from the tax treatment attached to the container and relevant flows.

**Exercises:** Asset behavior vs. tax wrapper separation.

## 22. Taxable distribution

**Setup:** Taxable Equity produces $4,000 of dividends. Scenario tax parameters specify a 20% tax rate on that income.

**Expected:** $4,000 gross cash inflow is generated and the defined tax behavior removes $800, leaving $3,200 available to Policies.

**Exercises:** Tax on Asset-generated income.

## 23. Roth distribution is not taxed

**Setup:** Same Equity and distribution as Test 22, but held in a Roth container whose distribution is tax-free under the model's simplified rules.

**Expected:** Full $4,000 is available without the Test 22 tax deduction.

**Exercises:** Container-specific tax behavior.

## 24. Tax on employment income

**Setup:** Employment generates $10,000/month gross income. Scenario tax parameters apply a simplified 30% employment-income tax rate. Spending is $5,000/month.

**Expected:** $7,000/month remains after tax; $2,000/month is available as surplus for the Policy.

**Exercises:** Event-generated income and taxes.

## 25. Mixed income sources are summed

**Setup:** One month contains $10,000 salary, $500 interest, $300 dividends, and a $20,000 inheritance. Spending is $5,000. Taxes are defined simply for salary/dividends only.

**Expected:** All applicable cash inflows are calculated and combined; the one-time inheritance is not mistaken for recurring income.

**Exercises:** Calculated aggregate cash inflow.

---

# Level 4 — Realistic domain combinations

## 26. Property in Financial State

**Setup:** Initial State contains a $600,000 Property asset and $150,000 mortgage liability. Scenario has $8,000/month spending. Property appreciation is 3% annual.

**Expected:** Property value changes according to its Asset Type behavior while the mortgage follows its defined liability behavior.

**Exercises:** Property and liability modeling.

## 27. Property purchase Event

**Setup:** Initial State contains $700,000 Cash. A Property Purchased Event acquires a $600,000 property and creates a $450,000 mortgage. Include a defined transaction cost.

**Expected:** The Event transforms the Financial State appropriately: property and liability are created and available Cash falls by the required equity and costs.

**Exercises:** Event transformation of Financial State.

## 28. Property sale Event

**Setup:** Initial State contains a property and mortgage. A Property Sold Event occurs during a Scenario.

**Expected:** Property is removed, mortgage is settled according to the defined sale behavior, and net sale proceeds enter the available cash flow.

**Exercises:** Asset disposition, liability settlement, one-time Event.

## 29. Move between housing circumstances

**Setup:** Scenario A represents owning a condo. Scenario B represents renting after a move. The condo is sold at the Scenario boundary; Scenario B has higher/lower spending reflecting the new housing situation.

**Expected:** Scenario A ends with the sale transformation; Scenario B starts from the resulting Financial State and applies its own spending and Policies.

**Exercises:** Housing change as a combination of Event + Scenario transition.

## 30. Whole Life cash value grows

**Setup:** Initial State contains a Whole Life Insurance asset with defined cash value. Whole Life Asset Type has deterministic cash-value growth and annual dividend behavior.

**Expected:** Cash value and generated cash flows follow the Whole Life behavior independently from Equity and Fixed Income.

**Exercises:** Specialized Asset Type behavior.

## 31. Whole Life policy loan funds a deficit

**Setup:** Scenario has negative net cash flow. Policy prioritizes a Whole Life loan before selling Equity.

**Expected:** Whole Life liability increases and cash becomes available to fund the deficit; Equity remains untouched.

**Exercises:** Policy priority and Asset-specific operation.

## 32. Policy priority determines funding source

**Setup:** Initial State has $50,000 Cash and $200,000 Equity. Monthly deficit is $10,000. Policy priority: Cash → Whole Life loan → Equity sale.

**Expected:** Cash is consumed first, then the next available source is used, and Equity is only sold if earlier sources are exhausted.

**Exercises:** Ordered Policy behavior.

## 33. Policy priority determines surplus destination

**Setup:** Monthly surplus is $5,000. Policy priority: pay debt until zero → invest in Equity → retain excess Cash.

**Expected:** Surplus is allocated in priority order, with later priorities receiving only the remainder.

**Exercises:** Ordered surplus allocation.

## 34. Different Policy in retirement

**Setup:** Working Scenario invests surplus into Equity. Retirement Scenario has no employment income and uses a Policy that funds deficits from Cash first, then Whole Life, then portfolio assets.

**Expected:** The same underlying Financial State can transition from accumulation behavior to drawdown behavior through a Scenario change.

**Exercises:** Accumulation/retirement transition without special retirement logic.

## 35. Scenario-specific inflation affects spending

**Setup:** Scenario A spends $8,000/month with 2% inflation. Scenario B starts later with a new spending amount and 3% inflation.

**Expected:** The calculation applies the appropriate Scenario Parameters to the relevant period.

**Exercises:** Scenario-specific economic parameters.

---

# Level 5 — Complex trajectories and alternative planning

## 36. Three-scenario life trajectory

**Setup:**
- A: work in the USA, age 48–58
- B: travel, age 58–59, $0 income and $15k/month spending
- C: retirement in Japan, age 59–63, Social Security/asset inflows as applicable

**Expected:** Three contiguous Scenarios produce one continuous Financial State history with no special handling for travel or retirement.

**Exercises:** Full trajectory composition.

## 37. Scenario starts with a major Event

**Setup:** Scenario B begins on the same date that a property sale, move cost, and new housing arrangement take effect.

**Expected:** Events execute at the appropriate tick and Scenario B calculates from the resulting Financial State.

**Exercises:** Boundary coincidence without making boundaries a special Event relationship.

## 38. Employment + property + investment portfolio

**Setup:** Initial State contains Property, mortgage, Taxable Equity, and Roth Equity. Scenario includes employment income, spending, property appreciation, dividends, taxes, and an investment Policy.

**Expected:** All independent behaviors combine into one coherent monthly Financial State sequence.

**Exercises:** Cross-domain interaction.

## 39. Large spending Event while accumulating

**Setup:** Working Scenario has positive monthly surplus invested into Equity. A $75,000 one-time car purchase occurs in year 4.

**Expected:** The Event creates a temporary additional deficit that the Policy funds according to its priority; normal accumulation resumes afterward.

**Exercises:** Large discretionary spending Event amid recurring behavior.

## 40. Long travel Scenario with zero income

**Setup:** One-year Scenario has $0 income, $12,000/month spending, and a drawdown Policy.

**Expected:** Financial State declines predictably while the Policy funds the monthly deficit.

**Exercises:** Zero-income Scenario.

## 41. Gift plus investment income plus spending

**Setup:** A month includes dividends, interest, salary, and a $100,000 gift. Spending remains the Scenario parameter. Surplus is invested.

**Expected:** All cash inflows are aggregated correctly and the gift affects only the relevant period.

**Exercises:** Multiple simultaneous inflow sources.

## 42. Copying a Scenario preserves its behavior

**Setup:** Duplicate a Scenario into another part of a Trajectory, then change only its spending parameter.

**Expected:** Events, Policies, and other Scenario Parameters are preserved by the copy while the modified Scenario produces a different trajectory.

**Exercises:** Scenario as a reusable planning block.

## 43. Alternative Trajectory diverges from Master

**Setup:** Master Trajectory retires at 63. Alternative copies the Master and changes the retirement Scenario to continue employment to 65.

**Expected:** Both trajectories share the same Initial State and unchanged preceding Scenarios, then diverge only where the copied Scenario was changed.

**Exercises:** Master/Alternative Trajectories.

## 44. Arbitrary trajectory comparison

**Setup:** Calculate three alternative Trajectories with materially different Scenario sequences: retire at 60 in the USA, travel at 58 then retire in Japan, and work to 65.

**Expected:** Each produces the same raw output shape — Financial State by time — making comparison independent of the reason for the differences.

**Exercises:** Comparison abstraction.

## 45. Same trajectory, changed economic parameters

**Setup:** Duplicate a trajectory and change only inflation and expected Equity return assumptions.

**Expected:** The event/scenario structure remains identical while the resulting Financial State sequence changes.

**Exercises:** Economic Parameter sensitivity.

## 46. Deterministic repeatability

**Setup:** Run the exact same Initial State, Trajectory, and fixed Scenario Parameters twice.

**Expected:** The Financial State sequence is byte-for-byte or value-for-value equivalent.

**Exercises:** Deterministic calculation contract.

## 47. Monte Carlo preserves domain inputs

**Setup:** Run a trajectory with an Input Generator replacing fixed Equity returns with a defined distribution.

**Expected:** Each simulation uses the same domain Trajectory and Initial State while receiving different generated economic inputs.

**Exercises:** Input Generator seam and stochastic calculation.

## 48. Monte Carlo produces an outcome distribution

**Setup:** Run many simulations of a simple accumulation/retirement trajectory.

**Expected:** Results retain the same Financial State-by-time structure per simulation and can be aggregated into distributions such as median and ±1 standard deviation.

**Exercises:** Simulation result model.

## 49. Complex realistic trajectory

**Setup:** Initial State imported from a realistic portfolio. Trajectory includes employment, salary taxes, property ownership and appreciation, mortgage, dividends, multiple asset positions, a large trip, a move, a year of travel, retirement, Social Security, Whole Life drawdown, and changing Policies across Scenarios.

**Expected:** The engine produces a continuous monthly Financial State history without requiring special cases for the overall life plan.

**Exercises:** End-to-end domain composition.

## 50. Master plan and multiple what-ifs

**Setup:** Calculate a Master Trajectory and three Alternatives. Each Alternative changes a small number of Scenarios, Events, Parameters, or Policies.

**Expected:** All calculations use the same engine and output the same fundamental Financial State-by-time structure. Alternatives can be compared without introducing a separate calculation model.

**Exercises:** The complete intended planning workflow.

---

# Progression rule

The implementation should not attempt all 50 tests at once.

A useful progression is:

1. **Tests 01–10:** establish the calculation loop and basic cash mechanics.
2. **Tests 11–18:** establish Events and contiguous Scenarios.
3. **Tests 19–25:** establish multiple assets, containers, calculated cash inflows, and simplified taxes.
4. **Tests 26–35:** establish property, insurance, Policies, and realistic domain behavior.
5. **Tests 36–50:** establish complete Trajectories, alternatives, determinism, and Monte Carlo.

The early tests should remain deliberately boring. If the engine cannot pass 01–18 with very small, transparent examples, adding realistic financial planning behavior will only make failures harder to understand.

## What these tests intentionally do not test yet

- Exact US tax law or tax optimization.
- Individual securities, tickers, or account-level reconciliation.
- Detailed household budgeting.
- Rental-property economics.
- Country-specific legal/tax systems beyond simplified Scenario Parameters.
- UI behavior.
- Database or persistence behavior.
- LLM scenario construction/validation.
- Sophisticated stochastic models.

Those are downstream concerns. The first objective is to prove that the domain model can reliably transform an Initial State through a Trajectory into a sequence of Financial States.