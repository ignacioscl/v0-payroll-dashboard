import ExcelJS from 'exceljs'
import type { Writable } from 'stream'

import { formatNyStamp, type PunchExportLocale } from '../punch/punch-export-format'
import { writeReportInfoSheet, type ReportInfoRow } from '../shared/export/report-info-sheet'
import { THEME, applyHeaderRow, styleDataRow, thinBorder } from '../shared/export/xlsx-theme'
import type { InvoiceRowDto } from './dto/invoice-list.dto'
import { invoiceExportLabels } from './invoice-export-labels'
import { INVOICE_EXPORT_MAX_DATA_ROWS } from './invoice-export-xlsx'
import { invoiceListExportColumns, invoiceListExportLabels } from './invoice-list-export-values'

export type WriteInvoiceListExportOptions = {
  stream: Writable
  locale: PunchExportLocale
  generatedAt: Date
  reportInfo: ReportInfoRow[]
  includePartial: boolean
  /** Grid rows in chunks, in the order of the grid. */
  chunks: AsyncIterable<InvoiceRowDto[]>
  maxDataRowsPerSheet?: number
}

/** A cell that starts with "=" stays text: no cell of the file is a formula. */
function safeText(value: string): string | { richText: { text: string }[] } {
  return value.startsWith('=') ? { richText: [{ text: value }] } : value
}

/**
 * «Export» of the Invoices grid (plans/plan-report-info-exports-tablas §6): "Report Info" first,
 * then "Invoices" with the stamp on row 1, the grid's headers on row 2 and its rows from row 3.
 * Streaming, like Export / Email (invoice-export-xlsx.ts): the list can be thousands of rows.
 */
export async function writeInvoiceListExportWorkbook(opts: WriteInvoiceListExportOptions): Promise<void> {
  const info = invoiceExportLabels(opts.locale)
  const labels = invoiceListExportLabels(opts.locale)
  const columns = invoiceListExportColumns(labels, opts.includePartial)
  const colCount = columns.length
  const stamp = `${info.generated} ${formatNyStamp(opts.generatedAt)} · ${labels.reportName}`
  const maxData = opts.maxDataRowsPerSheet ?? INVOICE_EXPORT_MAX_DATA_ROWS

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: opts.stream,
    useStyles: true,
    useSharedStrings: false,
  })

  writeReportInfoSheet(workbook, info.reportInfo, { field: info.field, value: info.value }, opts.reportInfo)

  const openDataSheet = (index: number) => {
    const sheet = workbook.addWorksheet(index <= 1 ? labels.dataSheet : `${labels.dataSheet} ${index}`, {
      views: [{ state: 'frozen', ySplit: 2 }],
    })
    sheet.columns = columns.map((c) => ({ width: c.width }))
    const stampRow = sheet.addRow([stamp])
    sheet.mergeCells(1, 1, 1, colCount)
    stampRow.height = 18
    const stampCell = stampRow.getCell(1)
    stampCell.font = { size: 10, color: { argb: THEME.subtitleFg } }
    stampCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.titleBg } }
    stampCell.border = thinBorder()
    stampRow.commit()
    const headerRow = sheet.addRow(columns.map((c) => c.header))
    applyHeaderRow(sheet, 2, colCount)
    headerRow.commit()
    return sheet
  }

  let sheetIndex = 1
  let sheet = openDataSheet(sheetIndex)
  let dataOnSheet = 0

  for await (const chunk of opts.chunks) {
    for (const row of chunk) {
      if (dataOnSheet >= maxData) {
        sheet.commit()
        sheetIndex += 1
        sheet = openDataSheet(sheetIndex)
        dataOnSheet = 0
      }
      const excelRow = sheet.addRow(
        columns.map((c) => {
          const v = c.value(row)
          return typeof v === 'string' ? safeText(v) : v
        }),
      )
      styleDataRow(excelRow, colCount, dataOnSheet % 2 === 1)
      columns.forEach((c, i) => {
        if (c.money) excelRow.getCell(i + 1).numFmt = '#,##0.00'
      })
      excelRow.commit()
      dataOnSheet += 1
    }
  }

  sheet.commit()
  await workbook.commit()
}
