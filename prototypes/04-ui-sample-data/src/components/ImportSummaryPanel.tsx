import { renderSummary } from '../../../01-kubera-import/src/summary.ts'
import type { ImportSummary } from '../../../01-kubera-import/src/summary.ts'

type Props = { summary: ImportSummary; droppedForCurrency: string[] }

export function ImportSummaryPanel({ summary, droppedForCurrency }: Props) {
  return (
    <details className="import-summary">
      <summary>
        Initial State imported from Kubera — {summary.recognized.length} recognized, {summary.ignored.length} ignored, {summary.needsManualInput.length} need manual input
      </summary>
      {droppedForCurrency.length > 0 && (
        <p className="import-summary__currency-note">
          Excluded from this demo (single-currency USD only): {droppedForCurrency.join(', ')}
        </p>
      )}
      <pre className="import-summary__body">{renderSummary(summary)}</pre>
    </details>
  )
}
