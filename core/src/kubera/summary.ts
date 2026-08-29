import type { ImportSummary } from './importer.ts'

function renderList(title: string, lines: string[]): string {
  if (lines.length === 0) return `${title}\n  (none)`
  return `${title}\n${lines.map((line) => `  - ${line}`).join('\n')}`
}

export function renderSummary(summary: ImportSummary): string {
  const sections = [
    renderList(
      'Recognized',
      summary.recognized.map((r) => `${r.source} → ${r.mappedTo}`),
    ),
    renderList(
      'Aggregated',
      summary.aggregated.map((a) => `${a.intoAssetId} ← ${a.sources.join(', ')}`),
    ),
    renderList(
      'Ignored (unsupported)',
      summary.ignored.map((i) => `${i.source} — ${i.reason}`),
    ),
    renderList(
      'Needs manual input',
      summary.needsManualInput.map((n) => `${n.source} — ${n.reason}`),
    ),
    renderList(
      'Unsupported currency',
      summary.unsupportedCurrency.map((u) => `${u.source} (${u.currency})`),
    ),
  ]
  return sections.join('\n\n')
}
