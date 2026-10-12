import type ExcelJS from 'exceljs'

import { THEME, applyHeaderRow, thinBorder } from './xlsx-theme'

export type ReportInfoRow = { field: string; value: string }

/**
 * "Report Info" sheet of the XLSX exports: Field/Value columns, navy header, widths 28 and 90,
 * first row frozen (rule xls-export-report-info). Shared by Punch and Invoices so both look the
 * same (plans/plan-export-invoices-nest §2.1.4, D5).
 */
export function writeReportInfoSheet(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  sheetName: string,
  header: { field: string; value: string },
  rows: readonly ReportInfoRow[],
): void {
  const info = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  info.columns = [{ width: 28 }, { width: 90 }]
  const infoHeader = info.addRow([header.field, header.value])
  applyHeaderRow(info, 1, 2)
  infoHeader.commit()
  for (const meta of rows) {
    const r = info.addRow([meta.field, meta.value])
    r.height = 18
    r.getCell(1).border = thinBorder()
    r.getCell(2).border = thinBorder()
    r.getCell(1).font = { bold: true, color: { argb: THEME.titleFg } }
    r.commit()
  }
  info.commit()
}
