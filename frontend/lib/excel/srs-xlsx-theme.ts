import type ExcelJS from 'exceljs'

/** SRS dashboard table palette, mirroring the navy chrome.
 *  ExcelJS writes ARGB into the workbook, so these cannot be CSS tokens —
 *  keep them in step with --table-header / --navy-900 / --client-accent. */
export const SRS_XLSX_THEME = {
  headerBg: 'FF173764',
  headerFg: 'FFFFFFFF',
  titleBg: 'FFE8ECF3',
  titleFg: 'FF091C3A',
  subtitleFg: 'FF546E7A',
  zebraBg: 'FFF5F8FC',
  border: 'FFD0D7DE',
  linkFg: 'FF2563EB',
  errorBg: 'FFFFF3E0',
  errorFg: 'FFE65100',
  white: 'FFFFFFFF',
} as const

export function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: SRS_XLSX_THEME.border } }
  return { top: side, left: side, bottom: side, right: side }
}

export function applyTitleRow(
  worksheet: ExcelJS.Worksheet,
  title: string,
  colCount: number,
  subtitle?: string,
): number {
  worksheet.mergeCells(1, 1, 1, Math.max(1, colCount))
  const titleCell = worksheet.getCell(1, 1)
  titleCell.value = title
  titleCell.font = { bold: true, size: 14, color: { argb: SRS_XLSX_THEME.titleFg } }
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: SRS_XLSX_THEME.titleBg },
  }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  titleCell.border = thinBorder()
  worksheet.getRow(1).height = 28

  if (!subtitle) return 2

  worksheet.mergeCells(2, 1, 2, Math.max(1, colCount))
  const subCell = worksheet.getCell(2, 1)
  subCell.value = subtitle
  subCell.font = { size: 10, color: { argb: SRS_XLSX_THEME.subtitleFg } }
  subCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: SRS_XLSX_THEME.titleBg },
  }
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  subCell.border = thinBorder()
  worksheet.getRow(2).height = 18
  return 3
}

export function applyHeaderRow(worksheet: ExcelJS.Worksheet, rowNumber: number, colCount: number) {
  const row = worksheet.getRow(rowNumber)
  row.height = 22
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true, color: { argb: SRS_XLSX_THEME.headerFg }, size: 11 }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: SRS_XLSX_THEME.headerBg },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder()
  }
}

export type StyledDataTableOptions = {
  headerRow: number
  numericColIndexes?: Set<number>
  hoursColIndexes?: Set<number>
  errorColIndex?: number
  yesLabel?: string
  linkColIndex?: number
  linkTargets?: (string | undefined)[]
}

export function writeStyledDataRows(
  worksheet: ExcelJS.Worksheet,
  headers: string[],
  dataRows: (string | number | null | undefined)[][],
  options: StyledDataTableOptions,
) {
  const { headerRow, numericColIndexes, hoursColIndexes, errorColIndex, yesLabel, linkColIndex, linkTargets } =
    options
  const colCount = headers.length

  headers.forEach((h, i) => {
    worksheet.getCell(headerRow, i + 1).value = h
  })
  applyHeaderRow(worksheet, headerRow, colCount)

  dataRows.forEach((values, rowIdx) => {
    const excelRow = worksheet.getRow(headerRow + 1 + rowIdx)
    excelRow.height = 18
    const zebra = rowIdx % 2 === 1

    values.forEach((raw, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      const colNum = colIdx + 1
      const isErrorCell =
        errorColIndex === colNum && yesLabel != null && String(raw ?? '') === yesLabel

      if (linkColIndex === colNum && linkTargets?.[rowIdx]) {
        const sheetName = linkTargets[rowIdx]!
        const text = String(raw ?? '')
        cell.value = {
          text,
          hyperlink: `#'${sheetName.replace(/'/g, "''")}'!A1`,
          tooltip: sheetName,
        }
        cell.font = { color: { argb: SRS_XLSX_THEME.linkFg }, underline: true, size: 11 }
      } else if (typeof raw === 'number' && !Number.isNaN(raw)) {
        cell.value = raw
        if (hoursColIndexes?.has(colNum)) {
          cell.numFmt = '0.00'
        } else if (numericColIndexes?.has(colNum)) {
          cell.numFmt = '0.##'
        }
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      } else {
        cell.value = raw ?? ''
        cell.alignment = { vertical: 'middle', horizontal: 'left' }
      }

      if (isErrorCell) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SRS_XLSX_THEME.errorBg },
        }
        cell.font = { color: { argb: SRS_XLSX_THEME.errorFg }, bold: true, size: 11 }
      } else if (zebra) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SRS_XLSX_THEME.zebraBg },
        }
      }

      cell.border = thinBorder()
    })
  })

  autoFitColumns(worksheet, colCount, headerRow, headerRow + dataRows.length)
  worksheet.views = [{ state: 'frozen', ySplit: headerRow }]
  if (dataRows.length > 0) {
    worksheet.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow, column: colCount },
    }
  }
}

export function autoFitColumns(
  worksheet: ExcelJS.Worksheet,
  colCount: number,
  startRow: number,
  endRow: number,
) {
  for (let c = 1; c <= colCount; c++) {
    let maxLen = 10
    for (let r = startRow; r <= endRow; r++) {
      const v = worksheet.getCell(r, c).value
      const text =
        v && typeof v === 'object' && 'text' in v
          ? String((v as { text?: string }).text ?? '')
          : String(v ?? '')
      maxLen = Math.max(maxLen, Math.min(42, text.length + 2))
    }
    worksheet.getColumn(c).width = maxLen
  }
}

export type ReportInfoRow = { field: string; value: string }

/**
 * Hoja *Report Info*, PRIMERA del archivo (regla `xls-export-report-info`).
 *
 * Un archivo exportado circula por mail y se guarda meses: sin saber cuándo,
 * quién y con qué filtros se generó, nadie puede verificarlo ni reproducirlo.
 * Los filtros vacíos también van, como "All": que un filtro no aparezca es
 * ambiguo, que diga "All" no lo es.
 */
export function writeReportInfoSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  title: string,
  columnLabels: { field: string; value: string },
  rows: ReportInfoRow[],
): void {
  const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] })
  const headerRow = applyTitleRow(ws, title, 2)

  writeStyledDataRows(
    ws,
    [columnLabels.field, columnLabels.value],
    rows.map((r) => [r.field, r.value]),
    { headerRow },
  )

  // `addWorksheet` la agrega al final. ExcelJS ordena las hojas por `orderNo`
  // (`get worksheets()` hace `.sort((a,b) => a.orderNo - b.orderNo)`), NO por el
  // array que devuelve ese getter: mutar el array no cambia nada, porque el
  // getter reconstruye y reordena en cada lectura. Se corren los orderNo.
  // `orderNo` existe en runtime pero no está en los typings de exceljs.
  type Ordered = { id: number; orderNo: number }
  for (const other of workbook.worksheets) {
    const o = other as unknown as Ordered
    if (o.id !== ws.id) o.orderNo += 1
  }
  ;(ws as unknown as Ordered).orderNo = 0
}

export async function downloadExcelWorkbook(workbook: ExcelJS.Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
