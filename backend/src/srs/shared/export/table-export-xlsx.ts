import ExcelJS from 'exceljs'

import { writeReportInfoSheet, type ReportInfoRow } from './report-info-sheet'
import { THEME, applyHeaderRow, styleDataRow, thinBorder } from './xlsx-theme'

/** How a column is written: text as is, numbers as numbers (money with cents, percent with one decimal). */
export type TableExportColumnKind = 'text' | 'int' | 'money' | 'pct'

export type TableExportColumn<T> = {
  header: string
  width: number
  kind: TableExportColumnKind
  /** `null` leaves the cell empty (e.g. Goal of a dealer without goal). */
  value: (row: T) => string | number | null
  /**
   * What the column counts, as an Excel note on its header (the red corner; read on hover). Optional:
   * without it the header is as before. plans/plan-reporte-tint/PLAN.md T5 (D5).
   */
  note?: string
}

/** One data sheet of a workbook: stamp on row 1, header on row 2, rows from row 3. */
export type TableExportSheet<T> = {
  name: string
  /** Short stamp on row 1 of the data sheet (xls-export-report-info). */
  stamp: string
  columns: readonly TableExportColumn<T>[]
  rows: readonly T[]
}

export type TableExportWorkbookOptions<T> = {
  reportInfoSheet: string
  reportInfoHeader: { field: string; value: string }
  reportInfo: readonly ReportInfoRow[]
  dataSheet: string
  /** Short stamp on row 1 of the data sheet (xls-export-report-info). */
  stamp: string
  columns: readonly TableExportColumn<T>[]
  rows: readonly T[]
}

export type MultiSheetExportWorkbookOptions = {
  reportInfoSheet: string
  reportInfoHeader: { field: string; value: string }
  reportInfo: readonly ReportInfoRow[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheets: readonly TableExportSheet<any>[]
}

const NUM_FMT: Record<TableExportColumnKind, string | undefined> = {
  text: undefined,
  int: undefined,
  money: '#,##0.00',
  pct: '0.0',
}

/**
 * In-memory XLSX of a small table (one row per dealer and the like): "Report Info" first, then one
 * data sheet with the stamp on row 1, the header on row 2 and the rows from row 3. Same look as the
 * dealer-ranking export (punch-dealer-ranking-xlsx.ts). plans/plan-report-info-exports-tablas §5.1.3.
 */
export function buildTableExportWorkbook<T>(opts: TableExportWorkbookOptions<T>): ExcelJS.Workbook {
  return buildMultiSheetExportWorkbook({
    reportInfoSheet: opts.reportInfoSheet,
    reportInfoHeader: opts.reportInfoHeader,
    reportInfo: opts.reportInfo,
    sheets: [{ name: opts.dataSheet, stamp: opts.stamp, columns: opts.columns, rows: opts.rows }],
  })
}

/**
 * "Report Info" first, then one data sheet per entry, each with the look of buildTableExportWorkbook
 * (T5 of plans/plan-monthly-closing/PLAN.md). The one-sheet builder calls this with one sheet.
 */
export function buildMultiSheetExportWorkbook(opts: MultiSheetExportWorkbookOptions): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook()
  writeReportInfoSheet(workbook, opts.reportInfoSheet, opts.reportInfoHeader, opts.reportInfo)
  for (const s of opts.sheets) writeDataSheet(workbook, s)
  return workbook
}

function writeDataSheet<T>(workbook: ExcelJS.Workbook, opts: TableExportSheet<T>): void {
  const colCount = opts.columns.length
  const sheet = workbook.addWorksheet(opts.name.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  sheet.columns = opts.columns.map((c) => ({ width: c.width }))

  const stampRow = sheet.addRow([opts.stamp])
  sheet.mergeCells(1, 1, 1, colCount)
  stampRow.height = 18
  const stampCell = stampRow.getCell(1)
  stampCell.font = { size: 10, color: { argb: THEME.subtitleFg } }
  stampCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.titleBg } }
  stampCell.border = thinBorder()

  const headerRow = sheet.addRow(opts.columns.map((c) => c.header))
  applyHeaderRow(sheet, 2, colCount)
  opts.columns.forEach((c, i) => {
    if (c.note) headerRow.getCell(i + 1).note = c.note
  })

  opts.rows.forEach((row, index) => {
    const excelRow = sheet.addRow(opts.columns.map((c) => c.value(row)))
    styleDataRow(excelRow, colCount, index % 2 === 1)
    opts.columns.forEach((c, i) => {
      const fmt = NUM_FMT[c.kind]
      if (fmt) excelRow.getCell(i + 1).numFmt = fmt
    })
  })
}
