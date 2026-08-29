// docs/test-scenarios.md, Level 4 — Realistic domain combinations (26-35).
import { describe, expect, it } from 'vitest'
import { createScenario, createTrajectory } from '../src/domain/trajectory.ts'
import { netWorth, type FinancialState, type Scenario } from '../src/domain/types.ts'
import { calculate } from '../src/engine/calculate.ts'

function scenario(overrides: Partial<Scenario> & { name: string; start: string; end: string }): Scenario {
  return createScenario({ events: [], parameters: { spending: 0, taxRate: 0 }, policies: [], ...overrides })
}

describe('26. Property in Financial State', () => {
  it('property appreciates per its Asset Type behavior while the mortgage amortizes per its own Liability behavior', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 200_000 },
        { id: 'home', name: 'Home', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 600_000 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 150_000, interestRate: 0.06, monthlyPayment: 2_000, linkedAssetId: 'home' }],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        parameters: { spending: 8_000, taxRate: 0, propertyAppreciation: 0.03 },
        policies: [
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    expect(final.assets.find((a) => a.assetType === 'realEstate')!.value).toBeCloseTo(600_000 * (1 + 0.03 / 12) ** 12, 6)
    const mortgage = final.liabilities.find((l) => l.kind === 'mortgage')!
    expect(mortgage.balance).toBeLessThan(150_000) // amortizing down
    expect(mortgage.balance).toBeGreaterThan(0)
  })
})

describe('27. Property purchase Event', () => {
  it('creates the property and mortgage and reduces Cash by the down payment plus transaction cost', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 700_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        events: [
          {
            id: 'evt-buy',
            at: '2026-01',
            effect: {
              kind: 'buyProperty',
              asset: { id: 'home', name: 'Home', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 600_000 },
              downPayment: 150_000,
              transactionCost: 12_000,
              mortgage: { id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 450_000, interestRate: 0.06, monthlyPayment: 2_700, linkedAssetId: 'home' },
            },
          },
        ],
        parameters: { spending: 0, taxRate: 0, propertyAppreciation: 0 },
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    expect(final.assets.find((a) => a.id === 'home')!.value).toBe(600_000)
    expect(final.liabilities.find((l) => l.id === 'mortgage')!.balance).toBeLessThanOrEqual(450_000) // created, then one month of amortization
    // 700,000 - 150,000 down payment - 12,000 transaction cost, minus this month's mortgage payment
    const mortgagePayment = 2_700
    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(700_000 - 150_000 - 12_000 - mortgagePayment, 2)
  })
})

describe('28. Property sale Event', () => {
  it('removes the property, settles the mortgage, and adds net proceeds to Cash', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'home', name: 'Home', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 600_000 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 200_000, linkedAssetId: 'home' }],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        events: [{ id: 'evt-sell', at: '2026-01', effect: { kind: 'sellProperty', assetId: 'home' } }],
        parameters: { spending: 0, taxRate: 0 },
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    expect(final.assets.some((a) => a.id === 'home')).toBe(false)
    expect(final.liabilities).toHaveLength(0)
    expect(final.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(400_000, 6) // 600,000 - 200,000 payoff
  })
})

describe('29. Move between housing circumstances', () => {
  it("Scenario A ends with the sale transformation; Scenario B starts from that resulting state with its own spending", () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'condo', name: 'Condo', assetType: 'realEstate', holdingContext: 'none', country: 'US', currency: 'USD', value: 500_000 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 180_000, linkedAssetId: 'condo' }],
    }
    const trajectory = createTrajectory('Owning then renting', [
      scenario({
        name: 'Owning',
        start: '2026-01',
        end: '2026-06',
        events: [{ id: 'evt-sell', at: '2026-06', effect: { kind: 'sellProperty', assetId: 'condo' } }],
        parameters: { spending: 4_000, taxRate: 0 },
        policies: [
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
        ],
      }),
      scenario({
        name: 'Renting',
        start: '2026-07',
        end: '2026-12',
        parameters: { spending: 5_500, taxRate: 0 }, // rent + living costs differ from ownership costs
        policies: [
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    const juneEnd = result.monthly[5]!
    expect(juneEnd.assets.some((a) => a.id === 'condo')).toBe(false) // sold within Scenario A
    expect(juneEnd.liabilities).toHaveLength(0)
    expect(netWorth(juneEnd)).toBeCloseTo(500_000 - 180_000 - 6 * 4_000, 6) // net proceeds, minus 6 months of Owning's spending

    const july = result.monthly[6]!
    expect(netWorth(july)).toBeCloseTo(netWorth(juneEnd) - 5_500, 6) // Renting's own (different) spending applies immediately
  })
})

describe('30. Whole Life cash value grows', () => {
  it('grows independently from Equity and Fixed Income, via its own crediting rate and dividend', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-12',
        parameters: { spending: 0, taxRate: 0, equityReturn: 0.10, wholeLifeCreditingRate: 0.04, wholeLifeDividendRate: 0.015, wholeLifePolicyFee: 20 },
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly.at(-1)!

    const wl = final.assets.find((a) => a.assetType === 'wholeLifeInsurance')!
    const eq = final.assets.find((a) => a.assetType === 'equity')!
    expect(wl.value).not.toBeCloseTo(eq.value, 0) // genuinely independent behavior, not coincidentally equal
    expect(wl.value).toBeGreaterThan(100_000) // net of fees, still grew
  })
})

describe('31. Whole Life policy loan funds a deficit', () => {
  it('increases the policy loan balance and makes cash available, leaving Equity untouched', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 100_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 200_000 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-01',
        parameters: { spending: 8_000, taxRate: 0, wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0, equityReturn: 0 },
        policies: [
          { id: 'p2', kind: 'fundDeficitFromWholeLifeLoan', priority: 2 },
          { id: 'p3', kind: 'fundDeficitFromEquitySale', priority: 3 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)
    const final = result.monthly[0]!

    const wl = final.assets.find((a) => a.assetType === 'wholeLifeInsurance')!
    expect(wl.policyLoanBalance).toBeCloseTo(8_000, 6)
    expect(wl.value).toBeCloseTo(100_000, 6) // cash value itself untouched by a loan
    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(200_000, 6) // never reached
  })
})

describe('32. Policy priority determines funding source', () => {
  it('drains Cash, then the Whole Life loan capacity, before ever touching Equity', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 50_000 },
        { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 30_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'none', country: 'US', currency: 'USD', value: 200_000 },
      ],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-09',
        parameters: { spending: 10_000, taxRate: 0, cashApy: 0, wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0, equityReturn: 0 },
        policies: [
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
          { id: 'p3', kind: 'fundDeficitFromWholeLifeLoan', priority: 3 },
          { id: 'p4', kind: 'fundDeficitFromEquitySale', priority: 4 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    // months 1-5: $10k/mo drains $50k Cash to exactly 0 — Whole Life and Equity untouched
    const afterCashDrained = result.monthly[4]!
    expect(afterCashDrained.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(0, 6)
    expect(afterCashDrained.assets.find((a) => a.assetType === 'wholeLifeInsurance')!.policyLoanBalance ?? 0).toBeCloseTo(0, 6)
    expect(afterCashDrained.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(200_000, 6)

    // months 6-8: $10k/mo now comes from the Whole Life loan, up to its $30k capacity
    const afterLoanExhausted = result.monthly[7]!
    expect(afterLoanExhausted.assets.find((a) => a.assetType === 'wholeLifeInsurance')!.policyLoanBalance).toBeCloseTo(30_000, 6)
    expect(afterLoanExhausted.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(200_000, 6) // still untouched

    // month 9: only now, with both prior sources exhausted, does Equity get sold
    const final = result.monthly[8]!
    expect(final.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(190_000, 6)
  })
})

describe('33. Policy priority determines surplus destination', () => {
  it('pays down debt first, invests the remainder, and only retains cash once both are satisfied', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 0 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 0 },
      ],
      liabilities: [{ id: 'mortgage', name: 'Mortgage', kind: 'mortgage', balance: 8_000 }],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({
        name: 'A',
        start: '2026-01',
        end: '2026-03',
        events: [{ id: 'evt', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 60_000 } }], // $5,000/mo
        parameters: { spending: 0, taxRate: 0, equityReturn: 0 },
        policies: [
          { id: 'p1', kind: 'payMortgageExtra', priority: 1 },
          { id: 'p2', kind: 'investSurplus', priority: 2 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    // month 1: all $5,000 pays down debt — Equity gets nothing (mortgage 8,000 -> 3,000)
    expect(result.monthly[0]!.liabilities[0]!.balance).toBeCloseTo(3_000, 6)
    expect(result.monthly[0]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(0, 6)

    // month 2: debt only needs 3,000 more — the remaining 2,000 falls through to Equity
    expect(result.monthly[1]!.liabilities[0]!.balance).toBeCloseTo(0, 6)
    expect(result.monthly[1]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(2_000, 6)

    // month 3: debt is gone — the full 5,000 goes to Equity
    expect(result.monthly[2]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(7_000, 6)
  })
})

describe('34. Different Policy in retirement', () => {
  it('transitions from accumulation to drawdown through a Scenario change alone — no special retirement logic', () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [
        { id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 5_000 },
        { id: 'wl', name: 'Whole Life', assetType: 'wholeLifeInsurance', holdingContext: 'none', country: 'US', currency: 'USD', value: 10_000 },
        { id: 'eq', name: 'Equity', assetType: 'equity', holdingContext: 'taxableBrokerage', country: 'US', currency: 'USD', value: 50_000 },
      ],
      liabilities: [],
    }
    const commonParams = { taxRate: 0, cashApy: 0, equityReturn: 0, wholeLifeCreditingRate: 0, wholeLifeDividendRate: 0, wholeLifePolicyFee: 0 }
    const trajectory = createTrajectory('Working then retired', [
      scenario({
        name: 'Working',
        start: '2026-01',
        end: '2026-02',
        events: [{ id: 'evt', at: '2026-01', effect: { kind: 'employmentStart', annualSalary: 96_000 } }], // $8,000/mo
        parameters: { spending: 3_000, ...commonParams }, // $5,000/mo surplus, invested
        policies: [
          { id: 'p2', kind: 'investSurplus', priority: 2 },
        ],
      }),
      scenario({
        name: 'Retired',
        start: '2026-03',
        end: '2026-04',
        parameters: { spending: 8_000, ...commonParams }, // no income now — pure deficit
        policies: [
          { id: 'p2', kind: 'fundDeficitFromCash', priority: 2 },
          { id: 'p3', kind: 'fundDeficitFromWholeLifeLoan', priority: 3 },
          { id: 'p4', kind: 'fundDeficitFromEquitySale', priority: 4 },
        ],
      }),
    ])

    const result = calculate(initialState, trajectory)

    // accumulation: 2 months of $5,000/mo surplus invested
    expect(result.monthly[1]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(60_000, 6)
    expect(result.monthly[1]!.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(5_000, 6) // untouched by working-scenario policies

    // drawdown begins the instant the Scenario changes — same engine, same state, new Policy
    // month 3: $8,000 deficit; cash (5,000) drains first, remaining 3,000 from the Whole Life loan
    expect(result.monthly[2]!.assets.find((a) => a.assetType === 'cash')!.value).toBeCloseTo(0, 6)
    expect(result.monthly[2]!.assets.find((a) => a.assetType === 'wholeLifeInsurance')!.policyLoanBalance).toBeCloseTo(3_000, 6)
    expect(result.monthly[2]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(60_000, 6) // not yet touched

    // month 4: Whole Life only has 7,000 of capacity left (10,000 - 3,000) — it
    // covers what it can, and only the final 1,000 of the 8,000 deficit spills
    // over into an Equity sale
    expect(result.monthly[3]!.assets.find((a) => a.assetType === 'wholeLifeInsurance')!.policyLoanBalance).toBeCloseTo(10_000, 6) // capacity fully used
    expect(result.monthly[3]!.assets.find((a) => a.assetType === 'equity')!.value).toBeCloseTo(59_000, 6)
  })
})

describe('35. Scenario-specific inflation affects spending', () => {
  it("each period's spending and inflation come from its own Scenario's parameters", () => {
    const initialState: FinancialState = {
      asOf: '2026-01',
      reportingCurrency: 'USD', assets: [{ id: 'cash', name: 'Cash', assetType: 'cash', holdingContext: 'none', country: 'US', currency: 'USD', value: 500_000 }],
      liabilities: [],
    }
    const trajectory = createTrajectory('Solo', [
      scenario({ name: 'A', start: '2026-01', end: '2026-06', parameters: { spending: 8_000, taxRate: 0, inflation: 0.02 }, policies: [] }),
      scenario({ name: 'B', start: '2026-07', end: '2026-12', parameters: { spending: 9_500, taxRate: 0, inflation: 0.03 }, policies: [] }),
    ])

    const result = calculate(initialState, trajectory)

    expect(netWorth(result.monthly[0]!) - netWorth(result.monthly[1]!)).toBeCloseTo(8_000, 6)
    expect(netWorth(result.monthly[6]!) - netWorth(result.monthly[7]!)).toBeCloseTo(9_500, 6)
  })
})
