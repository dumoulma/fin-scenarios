// Pure "YYYY-MM" arithmetic — Time Ticks are months (docs/architecture.md's Time
// Model). Deliberately not using Date, so results never depend on the local
// timezone or the moment the code happens to run.

export type YearMonth = string // "YYYY-MM"

function toIndex(yearMonth: YearMonth): number {
  const [year, month] = yearMonth.split('-').map(Number)
  return year! * 12 + (month! - 1)
}

function fromIndex(index: number): YearMonth {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

export function addMonths(yearMonth: YearMonth, delta: number): YearMonth {
  return fromIndex(toIndex(yearMonth) + delta)
}

/** Inclusive month count between `start` and `end` (both "YYYY-MM", `end` >= `start`). */
export function monthsBetween(start: YearMonth, end: YearMonth): number {
  return toIndex(end) - toIndex(start) + 1
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return toIndex(a) - toIndex(b)
}

export function yearOf(yearMonth: YearMonth): number {
  return Number(yearMonth.split('-')[0])
}

export function monthOf(yearMonth: YearMonth): number {
  return Number(yearMonth.split('-')[1])
}
