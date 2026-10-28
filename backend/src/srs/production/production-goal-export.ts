import type { DealerProductionRowDto } from './dto/production-kpi.dto'
import type { ProductionGoalExportLabels } from './production-goal-export-labels'
import { formatNyStamp, ymdToUs } from '../punch/punch-export-format'
import type { ReportInfoRow } from '../shared/export/report-info-sheet'
import type { TableExportColumn } from '../shared/export/table-export-xlsx'

/** Range like the screen's subtitle (production-vs-goal/page.tsx): one day, or «from – to». */
export function productionGoalDatesValue(fechaDesde: string, fechaHasta: string): string {
  const from = ymdToUs(fechaDesde)
  const to = ymdToUs(fechaHasta || fechaDesde)
  return from === to ? from : `${from} – ${to}`
}

/**
 * Report Info of the Production vs Goal export (plans/plan-report-info-exports-tablas §4.1):
 * when, who, screen and every filter. «Include removed dealers» only when it is on, with the removed
 * dealers that have rows in the file (rule include-removed-dealers), like the Invoices export.
 */
export function buildProductionGoalReportInfo(input: {
  labels: ProductionGoalExportLabels
  generatedAt: Date
  generatedBy: string
  fechaDesde: string
  fechaHasta: string
  dealerNames: readonly string[]
  filterDateDone: boolean
  includeRemovedDealers: boolean
  removedDealersWithRows: readonly string[]
}): ReportInfoRow[] {
  const { labels } = input
  return [
    { field: labels.report, value: labels.reportName },
    { field: labels.generated, value: formatNyStamp(input.generatedAt) },
    { field: labels.generatedBy, value: input.generatedBy },
    { field: labels.screen, value: labels.screenValue },
    { field: labels.dates, value: productionGoalDatesValue(input.fechaDesde, input.fechaHasta) },
    { field: labels.dealers, value: input.dealerNames.join(', ') },
    { field: labels.filterDateDone, value: input.filterDateDone ? labels.yes : labels.no },
    ...(input.includeRemovedDealers
      ? [
          {
            field: labels.includeRemovedDealers,
            value: input.removedDealersWithRows.length
              ? `${labels.yes} — ${input.removedDealersWithRows.join(', ')}`
              : labels.yes,
          },
        ]
      : []),
  ]
}

/**
 * The 5 columns of the grid (production-dealer-table.tsx), with the same values as the export it
 * replaces: Goal and Attainment % empty when the dealer has no goal; a removed dealer's name with
 * the suffix.
 */
export function productionGoalColumns(
  labels: ProductionGoalExportLabels,
  removedIds: ReadonlySet<number>,
): TableExportColumn<DealerProductionRowDto>[] {
  return [
    {
      header: labels.colDealer,
      width: 40,
      kind: 'text',
      value: (r) => (removedIds.has(r.dealerId) ? `${r.dealer} ${labels.removedSuffix}` : r.dealer),
    },
    { header: labels.colWosDone, width: 12, kind: 'int', value: (r) => r.wos },
    { header: labels.colProductionValue, width: 18, kind: 'money', value: (r) => r.value },
    { header: labels.colGoal, width: 16, kind: 'money', value: (r) => (r.goal > 0 ? r.goal : null) },
    {
      header: labels.colAttainmentPct,
      width: 14,
      kind: 'pct',
      value: (r) => (r.goal > 0 ? r.attainmentPct : null),
    },
  ]
}

/** Grid's initial order: Attainment % high to low (production-dealer-table.tsx). */
export function sortLikeProductionGrid(rows: readonly DealerProductionRowDto[]): DealerProductionRowDto[] {
  return [...rows].sort((a, b) => b.attainmentPct - a.attainmentPct)
}
