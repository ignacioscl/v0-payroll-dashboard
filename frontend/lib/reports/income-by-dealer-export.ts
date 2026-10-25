import ExcelJS from 'exceljs'
import {
  applyHeaderRow,
  applyTitleRow,
  autoFitColumns,
  downloadExcelWorkbook,
  SRS_XLSX_THEME,
  thinBorder,
  writeReportInfoSheet,
  type ReportInfoRow,
} from '@/lib/excel/srs-xlsx-theme'
import { formatUsDateTimeForExport, todayUsForFilename } from '@/lib/format-us-datetime'
import type { IncomeByDealer } from '@/lib/srs-kpis-api'

/** Excel number format of every money cell (cents and thousands). */
const MONEY_FMT = '#,##0.00'

export type IncomeByDealerExportLabels = {
  fileName: string
  reportInfoSheet: string
  dataSheet: string
  summarySheet: string
  title: string
  field: string
  value: string
  dealer: string
  income: string
  period: string
  dates: string
  total: string
  grandTotal: string
  generated: string
  /** Label of a year in the file: "2024", "2026 YTD"… */
  yearLabel: (year: IncomeByDealer['years'][number]) => string
  /** "01/01/2024 – 12/31/2024" */
  yearRange: (year: IncomeByDealer['years'][number]) => string
}

export type IncomeByDealerExportInput = {
  data: IncomeByDealer
  labels: IncomeByDealerExportLabels
  /** Report Info rows after the generated stamp: screen, user, every filter with its screen name. */
  reportInfo: ReportInfoRow[]
  generatedBy: string
}

function moneyCell(cell: ExcelJS.Cell, value: number, bold = false) {
  cell.value = value
  cell.numFmt = MONEY_FMT
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  cell.border = thinBorder()
  if (bold) cell.font = { bold: true }
}

function textCell(cell: ExcelJS.Cell, value: string, bold = false) {
  cell.value = value
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
  cell.border = thinBorder()
  if (bold) cell.font = { bold: true }
}

function totalRowFill(row: ExcelJS.Row, colCount: number) {
  for (let c = 1; c <= colCount; c++) {
    row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SRS_XLSX_THEME.titleBg } }
  }
}

/**
 * Income by Dealer to Excel (D2: no chart): «Report Info» first, then one table per year with its
 * Total and the Grand Total, then «Summary» (year · Income). Same numbers as the screen.
 */
export async function exportIncomeByDealerXlsx(input: IncomeByDealerExportInput): Promise<void> {
  const { data, labels, reportInfo, generatedBy } = input
  const generatedAt = new Date()
  const stamp = `${labels.generated} ${formatUsDateTimeForExport(generatedAt.toISOString())} · ${generatedBy} · ${labels.title}`

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SRS Payroll Dashboard'
  workbook.created = generatedAt

  // Data: one block per year (title row, header, dealers, Total), then the Grand Total.
  const ws = workbook.addWorksheet(labels.dataSheet, { views: [{ showGridLines: true }] })
  let r = applyTitleRow(ws, labels.title, 2, stamp)
  for (const year of data.years) {
    const yearTitle = ws.getRow(r)
    textCell(yearTitle.getCell(1), `${labels.yearLabel(year)} · ${labels.yearRange(year)}`, true)
    ws.mergeCells(r, 1, r, 2)
    r += 1
    ws.getCell(r, 1).value = labels.dealer
    ws.getCell(r, 2).value = labels.income
    applyHeaderRow(ws, r, 2)
    r += 1
    for (const row of year.dealers) {
      const excelRow = ws.getRow(r)
      textCell(excelRow.getCell(1), row.dealer)
      moneyCell(excelRow.getCell(2), row.income)
      r += 1
    }
    const totalRow = ws.getRow(r)
    textCell(totalRow.getCell(1), `${labels.total} ${labels.yearLabel(year)}`, true)
    moneyCell(totalRow.getCell(2), year.total, true)
    totalRowFill(totalRow, 2)
    r += 2
  }
  const grandRow = ws.getRow(r)
  textCell(grandRow.getCell(1), labels.grandTotal, true)
  moneyCell(grandRow.getCell(2), data.grandTotal, true)
  totalRowFill(grandRow, 2)
  autoFitColumns(ws, 2, 3, r)
  ws.getColumn(2).width = Math.max(ws.getColumn(2).width ?? 0, 18)

  // Summary: year · Income, with the Grand Total.
  const sum = workbook.addWorksheet(labels.summarySheet, { views: [{ showGridLines: true }] })
  let s = applyTitleRow(sum, labels.summarySheet, 3, stamp)
  sum.getCell(s, 1).value = labels.period
  sum.getCell(s, 2).value = labels.dates
  sum.getCell(s, 3).value = labels.income
  applyHeaderRow(sum, s, 3)
  s += 1
  for (const year of data.years) {
    const row = sum.getRow(s)
    textCell(row.getCell(1), labels.yearLabel(year))
    textCell(row.getCell(2), labels.yearRange(year))
    moneyCell(row.getCell(3), year.total)
    s += 1
  }
  const sumTotal = sum.getRow(s)
  textCell(sumTotal.getCell(1), labels.grandTotal, true)
  textCell(sumTotal.getCell(2), '')
  moneyCell(sumTotal.getCell(3), data.grandTotal, true)
  totalRowFill(sumTotal, 3)
  autoFitColumns(sum, 3, 3, s)
  sum.getColumn(3).width = Math.max(sum.getColumn(3).width ?? 0, 18)

  writeReportInfoSheet(
    workbook,
    labels.reportInfoSheet,
    labels.reportInfoSheet,
    { field: labels.field, value: labels.value },
    [{ field: labels.generated, value: formatUsDateTimeForExport(generatedAt.toISOString()) }, ...reportInfo],
  )

  await downloadExcelWorkbook(workbook, `${labels.fileName}-${todayUsForFilename()}.xlsx`)
}
