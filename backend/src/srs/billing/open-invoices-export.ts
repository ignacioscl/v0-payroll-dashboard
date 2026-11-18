/**
 * Excel of Reports › Open Invoices (T5 of plans/plan-reporte-javier/PLAN.md §1.4) and of its comparison
 * with today (T7, §1.5): Report Info first, then the data sheets with the stamp on row 1. Pure: the
 * service gives the rows and names.
 */
import type ExcelJS from 'exceljs'

import { formatNyStamp, ymdToExcelDate, ymdToUs } from '../punch/punch-export-format'
import type { ReportInfoRow } from '../shared/export/report-info-sheet'
import { buildMultiSheetExportWorkbook, type TableExportColumn } from '../shared/export/table-export-xlsx'
import type { OpenInvoiceBucket, OpenInvoiceRow, OpenInvoiceSummaryRow, OpenInvoiceTotals } from './open-invoice-aging'
import type { OpenInvoicesExportLabels } from './open-invoices-export-labels'

/** «All» or the names of the dealers of the filter. */
export function openInvoicesDealersValue(labels: OpenInvoicesExportLabels, dealerNames: readonly string[] | null): string {
  return dealerNames == null ? labels.all : dealerNames.join(', ')
}

function removedValue(labels: OpenInvoicesExportLabels, removedWithRows: readonly string[]): string {
  return removedWithRows.length ? `${labels.yes} — ${removedWithRows.join(', ')}` : labels.yes
}

/**
 * Report Info of the export (§1.4, rule xls-export-report-info): when, who, screen, every filter, the
 * snapshot number and the lines of the cartel (§2), one per row under «Report rules».
 */
export function buildOpenInvoicesReportInfo(input: {
  labels: OpenInvoicesExportLabels
  generatedAt: Date
  generatedBy: string
  asOf: string
  snapshotId: number
  /** null = All. */
  dealerNames: readonly string[] | null
  includeRemovedDealers: boolean
  removedDealersWithRows: readonly string[]
}): ReportInfoRow[] {
  const { labels } = input
  return [
    { field: labels.report, value: labels.reportName },
    { field: labels.generated, value: formatNyStamp(input.generatedAt) },
    { field: labels.generatedBy, value: input.generatedBy },
    { field: labels.screen, value: labels.screenValue },
    { field: labels.asOf, value: ymdToUs(input.asOf) },
    { field: labels.snapshot, value: `#${input.snapshotId}` },
    { field: labels.dealers, value: openInvoicesDealersValue(labels, input.dealerNames) },
    ...(input.includeRemovedDealers
      ? [{ field: labels.includeRemovedDealers, value: removedValue(labels, input.removedDealersWithRows) }]
      : []),
    { field: labels.reportRules, value: labels.rulesTitle },
    ...labels.rules.map((line, i) => ({ field: `${i + 1}`, value: line })),
  ]
}

type SummarySheetRow = { dealer: string } & Omit<OpenInvoiceSummaryRow, 'dealerId'> & { isTotal?: boolean }

const BUCKET_COLUMNS: readonly [keyof OpenInvoiceTotals, keyof OpenInvoicesExportLabels][] = [
  ['current', 'colCurrent'],
  ['d15', 'col15'],
  ['d30', 'col30'],
  ['d60', 'col60'],
  ['d90', 'col90'],
  ['total', 'colTotal'],
]

function moneyColumns<T extends Record<string, unknown>>(
  labels: OpenInvoicesExportLabels,
  value: (row: T, key: keyof OpenInvoiceTotals) => number,
): TableExportColumn<T>[] {
  return BUCKET_COLUMNS.map(([key, label]) => ({
    header: labels[label] as string,
    width: 14,
    kind: 'money' as const,
    value: (r: T) => value(r, key),
  }))
}

/** Money of an invoice row in each column: its amount in the column of its bucket and in TOTAL. */
export function invoiceRowBucketValue(row: Pick<OpenInvoiceRow, 'bucket' | 'amount'>, key: keyof OpenInvoiceTotals): number {
  if (key === 'total') return row.amount
  return row.bucket === (key as OpenInvoiceBucket) ? row.amount : 0
}

export type OpenInvoicesWorkbookInput = {
  labels: OpenInvoicesExportLabels
  generatedAt: Date
  reportInfo: ReportInfoRow[]
  summary: { rows: OpenInvoiceSummaryRow[]; totals: OpenInvoiceTotals }
  invoices: OpenInvoiceRow[]
  dealerLabel: (dealerId: number) => string
}

/** The three sheets: Report Info, Summary (with the TOTAL row) and Invoices (one row per invoice × department). */
export function buildOpenInvoicesWorkbook(input: OpenInvoicesWorkbookInput): ExcelJS.Workbook {
  const { labels } = input
  const stamp = `${labels.generated} ${formatNyStamp(input.generatedAt)} · ${labels.reportName}`
  const summaryRows: SummarySheetRow[] = [
    ...input.summary.rows.map((r) => ({ ...r, dealer: input.dealerLabel(r.dealerId) })),
    { dealer: labels.totalRow, department: '', ...input.summary.totals, isTotal: true },
  ]
  const summaryColumns: TableExportColumn<SummarySheetRow>[] = [
    { header: labels.colDealer, width: 42, kind: 'text', value: (r) => r.dealer },
    { header: labels.colDepartment, width: 30, kind: 'text', value: (r) => r.department },
    ...moneyColumns<SummarySheetRow>(labels, (r, k) => r[k]),
  ]
  const invoiceColumns: TableExportColumn<OpenInvoiceRow>[] = [
    { header: labels.colDealer, width: 42, kind: 'text', value: (r) => input.dealerLabel(r.dealerId) },
    { header: labels.colInvoice, width: 16, kind: 'text', value: (r) => r.fullNro },
    { header: labels.colDateFrom, width: 12, kind: 'date', value: (r) => ymdToExcelDate(r.dateFromYmd) || null },
    { header: labels.colDateTo, width: 12, kind: 'date', value: (r) => ymdToExcelDate(r.dateToYmd) || null },
    { header: labels.colDepartment, width: 30, kind: 'text', value: (r) => r.department },
    { header: labels.colServices, width: 40, kind: 'text', value: (r) => r.services },
    { header: labels.colDaysOld, width: 10, kind: 'int', value: (r) => r.days },
    ...moneyColumns<OpenInvoiceRow>(labels, (r, k) => invoiceRowBucketValue(r, k)),
  ]
  return buildMultiSheetExportWorkbook({
    reportInfoSheet: labels.reportInfo,
    reportInfoHeader: { field: labels.field, value: labels.value },
    reportInfo: input.reportInfo,
    sheets: [
      {
        name: labels.summarySheet,
        stamp,
        columns: summaryColumns,
        rows: summaryRows,
        rowWeight: (r: SummarySheetRow) => (r.isTotal ? 'bold' : undefined),
      },
      { name: labels.invoicesSheet, stamp, columns: invoiceColumns, rows: input.invoices },
    ],
  })
}

/** A row of the comparison as the screen and the Excel show it. */
export type CompareSheetRow = {
  dealer: string
  invoice: string
  department: string
  snapshot: { amount: number; bucket: OpenInvoiceBucket | null } | null
  today: { amount: number; bucket: OpenInvoiceBucket | null } | null
  difference: number
  why: string[]
}

export function bucketLabel(labels: OpenInvoicesExportLabels, bucket: OpenInvoiceBucket | null): string {
  switch (bucket) {
    case 'current':
      return labels.colCurrent
    case 'd15':
      return labels.col15
    case 'd30':
      return labels.col30
    case 'd60':
      return labels.col60
    case 'd90':
      return labels.col90
    default:
      return ''
  }
}

/** «1,200.00 · 15+»; «—» when the invoice is not on that side. */
function sideText(labels: OpenInvoicesExportLabels, side: CompareSheetRow['snapshot']): string {
  if (!side) return '—'
  const money = side.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const b = bucketLabel(labels, side.bucket)
  return b ? `${money} · ${b}` : money
}

/**
 * Report Info of the comparison (§1.5, T7): the snapshot (number, when, by whom, As of, dealers, switch),
 * the moment of «Today» and the lines of the comparison cartel; then the «Changes» sheet.
 */
export function buildOpenInvoicesCompareWorkbook(input: {
  labels: OpenInvoicesExportLabels
  comparedAt: Date
  generatedBy: string
  snapshot: { id: number; generatedAt: Date; by: string; asOf: string; dealers: string; includeRemovedDealers: boolean }
  rows: CompareSheetRow[]
  totals: { snapshot: number; today: number; difference: number }
}): ExcelJS.Workbook {
  const { labels } = input
  const reportInfo: ReportInfoRow[] = [
    { field: labels.report, value: labels.compareReportName },
    { field: labels.generated, value: formatNyStamp(input.comparedAt) },
    { field: labels.generatedBy, value: input.generatedBy },
    { field: labels.screen, value: labels.compareScreenValue },
    {
      field: labels.snapshot,
      value: `#${input.snapshot.id} · ${labels.generated} ${formatNyStamp(input.snapshot.generatedAt)} · ${labels.snapshotBy} ${input.snapshot.by}`,
    },
    { field: labels.asOf, value: ymdToUs(input.snapshot.asOf) },
    { field: labels.dealers, value: input.snapshot.dealers },
    ...(input.snapshot.includeRemovedDealers ? [{ field: labels.includeRemovedDealers, value: labels.yes }] : []),
    { field: labels.comparedAt, value: formatNyStamp(input.comparedAt) },
    { field: labels.reportRules, value: labels.compareRulesTitle },
    ...labels.compareRules.map((line, i) => ({ field: `${i + 1}`, value: line })),
  ]
  type Row = CompareSheetRow & { isTotal?: boolean }
  const rows: Row[] = [
    ...input.rows,
    {
      dealer: labels.totalRow,
      invoice: '',
      department: '',
      snapshot: { amount: input.totals.snapshot, bucket: null },
      today: { amount: input.totals.today, bucket: null },
      difference: input.totals.difference,
      why: [],
      isTotal: true,
    },
  ]
  const columns: TableExportColumn<Row>[] = [
    { header: labels.colDealer, width: 42, kind: 'text', value: (r) => r.dealer },
    { header: labels.colInvoice, width: 16, kind: 'text', value: (r) => r.invoice },
    { header: labels.colDepartment, width: 30, kind: 'text', value: (r) => r.department },
    { header: labels.colInSnapshot, width: 20, kind: 'text', value: (r) => sideText(labels, r.snapshot) },
    { header: labels.colToday, width: 20, kind: 'text', value: (r) => sideText(labels, r.today) },
    { header: labels.colDifference, width: 14, kind: 'money', value: (r) => r.difference },
    { header: labels.colWhy, width: 70, kind: 'text', value: (r) => r.why.join('; ') },
  ]
  return buildMultiSheetExportWorkbook({
    reportInfoSheet: labels.reportInfo,
    reportInfoHeader: { field: labels.field, value: labels.value },
    reportInfo,
    sheets: [
      {
        name: labels.changesSheet,
        stamp: `${labels.generated} ${formatNyStamp(input.comparedAt)} · ${labels.compareReportName}`,
        columns,
        rows,
        rowWeight: (r: Row) => (r.isTotal ? 'bold' : undefined),
      },
    ],
  })
}
