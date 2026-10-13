import type ExcelJS from 'exceljs'

/**
 * Look of the XLSX exports (navy header, zebra rows, thin borders). Lived in
 * punch-export-xlsx.ts; moved here so Punch, the dealer ranking and Invoices share it without
 * importing each other (plans/plan-export-invoices-nest §2.1.4).
 */
export const THEME = {
  headerBg: 'FF173764',
  headerFg: 'FFFFFFFF',
  titleBg: 'FFE8ECF3',
  titleFg: 'FF091C3A',
  subtitleFg: 'FF546E7A',
  zebraBg: 'FFF5F8FC',
  border: 'FFD0D7DE',
} as const

export function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: THEME.border } }
  return { top: side, left: side, bottom: side, right: side }
}

export function applyHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number, colCount: number) {
  const row = sheet.getRow(rowNumber)
  row.height = 22
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true, color: { argb: THEME.headerFg }, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder()
  }
}

export function styleDataRow(row: ExcelJS.Row, colCount: number, zebra: boolean) {
  row.height = 18
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.border = thinBorder()
    if (zebra) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.zebraBg } }
    }
  }
}
