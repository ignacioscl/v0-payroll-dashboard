import ExcelJS from 'exceljs'
import type { Writable } from 'stream'

import {
  formatNyStamp,
  ymdToExcelDate,
  ymdToUs,
  type PunchExportLocale,
} from '../punch/punch-export-format'
import { writeReportInfoSheet, type ReportInfoRow } from '../shared/export/report-info-sheet'
import { THEME, applyHeaderRow, styleDataRow, thinBorder } from '../shared/export/xlsx-theme'
import type { InvoiceRowDto } from './dto/invoice-list.dto'
import type { InvoiceExportType } from './dto/invoice-export.dto'
import {
  invoiceExportLabels,
  invoiceExportReportName,
  type InvoiceExportLabels,
} from './invoice-export-labels'
import type { InvoiceExportWoLineRow } from './repository/invoice.repository'
import { formatFullNroWithNroBilled } from './invoice-nro-billed'

const EXCEL_MAX_ROWS = 1_048_576
const STAMP_ROWS = 2
/** Same count as Punch (punch-export-xlsx.ts): past this, the data goes on "… 2". */
export const INVOICE_EXPORT_MAX_DATA_ROWS = EXCEL_MAX_ROWS - STAMP_ROWS - 8

/**
 * SERVICES column, copied from the legacy export (binvoice_export_xls.php, plan §1.5):
 * Generic → invoice_service_sel_rel; no service name and type ≠ 4 → by type (1: the WO service
 * names, 2: "By Services", 3: "Multi-Services", other: empty); with a service name → the name;
 * type 4 without a name → invoice_service_sel_rel with the commas turned into spaces.
 */
export function invoiceExportServicesText(row: InvoiceRowDto): string {
  const type = row.statementType
  if (type === 6) return row.invoiceServiceSelRel ?? ''
  const name = row.invoiceService?.trim() ?? ''
  if (!name && type !== 4) {
    if (type === 1) return woServiceNames(row.invoiceServicesByWo)
    if (type === 2) return 'By Services'
    if (type === 3) return 'Multi-Services'
    return ''
  }
  if (name) return name
  return (row.invoiceServiceSelRel ?? '').replace(/,/g, ' ')
}

/** InvoiceStatement::getInvoiceServicesByWoNames: the part before the first "|" of each item. */
function woServiceNames(raw?: string): string {
  if (!raw) return ''
  const names = raw.split(',').map((item) => item.split('|')[0] ?? '')
  return names.join(',').replace(/,+$/, '')
}

/**
 * DEPARTMENT of a grid row (type "Invoice"): its department; a Time Tracking invoice without one
 * says "Timesheets", as the customer asked on 10/12/2026 (plans/plan-export-invoices-nest §8.8, D34),
 * and so does a Generic one since 10/18/2026 (§8.11, D37).
 */
export function invoiceExportDepartment(row: InvoiceRowDto, labels: InvoiceExportLabels): string {
  if (row.department) return row.department
  return row.statementType === 5 || row.statementType === 6 ? labels.ttkDepartment : ''
}

/** A cell that starts with "=" stays text: no cell of the file is a formula (§1.5). */
function safeText(value: string): string | { richText: { text: string }[] } {
  return value.startsWith('=') ? { richText: [{ text: value }] } : value
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` of a date in New York, the time zone of the stamp. */
function nyYmd(date: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return p
}

/**
 * DAYS OLD: whole days from the day the invoice was created to the day the file is generated
 * (New York). Asked by the customer on 10/09/2026: "calculated from the invoice creation date"
 * (D31). A Time Tracking invoice counts from its DATE FROM instead, asked on 10/14/2026 (§8.10, D36).
 * Calendar days by their components, never through a time zone conversion of `fecha_create`.
 */
export function invoiceExportDaysOldStart(row: InvoiceRowDto): string {
  if (row.statementType === 5 && row.fechaDesde) return row.fechaDesde
  return row.fechaCreate
}

export function invoiceExportDaysOld(fechaCreate: string, generatedAt: Date): number | '' {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fechaCreate ?? '')
  if (!m) return ''
  const created = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const [y, mo, d] = nyYmd(generatedAt).split('-').map(Number)
  const today = Date.UTC(y, mo - 1, d)
  return Math.max(0, Math.round((today - created) / DAY_MS))
}

export type WriteInvoiceExportOptions = {
  stream: Writable
  locale: PunchExportLocale
  exportType: InvoiceExportType
  generatedAt: Date
  reportInfo: ReportInfoRow[]
  /** DEALER for internal users, COMPANY (the provider) for external ones (D24). */
  isCompanyTypeCompany: boolean
  /** Razón social of the provider: first column of an external user. */
  providerName: string
  /** Only when "Created by" has authors. */
  includeAuthor: boolean
  /** Only with Deleted = Only / Show all (D25). */
  includeDeleted: boolean
  /** «Include removed dealers» on: their rows say «(removed)» after the dealer (§5). */
  removedDealerIds?: ReadonlySet<number>
  /** Grid rows in chunks, in the order of the grid. */
  chunks: AsyncIterable<InvoiceRowDto[]>
  /** Type 2: the WO lines of the invoices of one chunk. */
  woLinesOf?: (statementIds: number[]) => Promise<InvoiceExportWoLineRow[]>
  maxDataRowsPerSheet?: number
}

function headersOf(opts: WriteInvoiceExportOptions): string[] {
  const entity = opts.isCompanyTypeCompany ? 'COMPANY' : 'DEALER'
  const author = opts.includeAuthor ? ['AUTHOR'] : []
  const deleted = opts.includeDeleted ? ['DELETED'] : []
  if (opts.exportType === 1) {
    return [
      entity,
      'INVOICE#',
      'DATE FROM',
      'DATE TO',
      'DEPARTMENT',
      'SERVICES',
      'SUB TOTAL',
      'DISCOUNT',
      'TOTAL',
      ...author,
      'TYPE',
      'DAYS OLD',
      ...deleted,
      // At the end, so no column the customer already uses shifts (§8.9, D35).
      'CHECK#',
      'CHECK DATE',
      'PAYMENT ENTERED',
    ]
  }
  return [
    entity,
    'INVOICE#',
    'DATE',
    'WO#',
    'VIN#',
    'STOCK#',
    'YEAR',
    'MAKE',
    'MODEL',
    'COLOR',
    'RO#',
    'PO#',
    'DEPARTMENT',
    'SERVICES',
    'PRICE',
    'APPROVER',
    ...author,
    // At the end, like legacy since 09/28 (binvoice_export_xls.php:227), so nothing shifts (§8.6).
    'CHECK#',
    'DISCOUNT',
    'TOTAL',
    ...deleted,
  ]
}

/**
 * DISCOUNT of a grid row (type "Invoice"): its share of the invoice discount in money, empty when
 * 0 — as legacy since 09/28 (binvoice_export_xls.php:189-199). plans/plan-export-invoices-nest §8.6.
 */
export function invoiceExportRowDiscount(row: InvoiceRowDto): number | '' {
  const value = money(row.discountAmount)
  return value === 0 ? '' : value
}

/**
 * Order of the WO lines in the file, as binvoice_export_xls.php:255-262: by the position of their
 * invoice in the grid, then row kind, check, nro_billed, WO number and line id.
 */
export function sortWoLines(
  lines: InvoiceExportWoLineRow[],
  positionOf: Map<number, number>,
): InvoiceExportWoLineRow[] {
  return [...lines].sort((a, b) => {
    const c = (positionOf.get(a.idStatement) ?? 0) - (positionOf.get(b.idStatement) ?? 0)
    if (c !== 0) return c
    if (a.rowKind !== b.rowKind) return a.rowKind - b.rowKind
    if ((a.idBilling ?? 0) !== (b.idBilling ?? 0)) return (a.idBilling ?? 0) - (b.idBilling ?? 0)
    if ((a.nroBilled ?? 0) !== (b.nroBilled ?? 0)) return (a.nroBilled ?? 0) - (b.nroBilled ?? 0)
    if (a.woNro !== b.woNro) return a.woNro - b.woNro
    return a.relId - b.relId
  })
}

/**
 * CHECK#, CHECK DATE and PAYMENT ENTERED of a grid row (type "Invoice"): the payment of a paid row
 * (branches 2 and 3 of the list); empty on the unpaid remainder (§8.9, D35).
 */
export function invoiceExportPaymentCells(row: InvoiceRowDto): (string | Date)[] {
  if (row.isBilled !== 1) return ['', '', '']
  return [row.checkNumber ?? '', ymdToExcelDate(row.fechaPago), ymdToExcelDate(row.fechaAltaPago)]
}

const WIDTHS_TYPE_1 = [32, 16, 13, 13, 18, 36, 13, 12, 13, 26, 12, 11, 10, 14, 13, 17]
const WIDTHS_TYPE_2 = [32, 16, 13, 14, 20, 12, 8, 14, 26, 12, 12, 12, 18, 30, 12, 22, 14, 12, 12, 26, 10]

/**
 * Invoices export: "Report Info" first, then the data sheet with the stamp on row 1, the literal
 * legacy headers on row 2 and the data from row 3 (plans/plan-export-invoices-nest §1.5, §1.6).
 * Streaming, like Punch Report.
 */
export async function writeInvoiceExportWorkbook(opts: WriteInvoiceExportOptions): Promise<void> {
  const labels = invoiceExportLabels(opts.locale)
  const reportName = invoiceExportReportName(opts.exportType)
  const headers = headersOf(opts)
  const colCount = headers.length
  const stamp = `${labels.generated} ${formatNyStamp(opts.generatedAt)} · ${reportName}`
  const maxData = opts.maxDataRowsPerSheet ?? INVOICE_EXPORT_MAX_DATA_ROWS
  const widths = opts.exportType === 1 ? WIDTHS_TYPE_1 : WIDTHS_TYPE_2
  const amountCols = new Set(
    (opts.exportType === 1
      ? ['SUB TOTAL', 'DISCOUNT', 'TOTAL']
      : ['PRICE', 'DISCOUNT', 'TOTAL']
    ).map((h) => headers.indexOf(h) + 1),
  )
  // Native Excel dates, found by header so AUTHOR / DELETED never shift them (§8.9, D35).
  const dateCols =
    opts.exportType === 1
      ? ['DATE FROM', 'DATE TO', 'CHECK DATE', 'PAYMENT ENTERED'].map((h) => headers.indexOf(h) + 1)
      : []

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: opts.stream,
    useStyles: true,
    useSharedStrings: false,
  })

  writeReportInfoSheet(
    workbook,
    labels.reportInfo,
    { field: labels.field, value: labels.value },
    opts.reportInfo,
  )

  const openDataSheet = (index: number) => {
    const sheet = workbook.addWorksheet(index <= 1 ? reportName : `${reportName} ${index}`, {
      views: [{ state: 'frozen', ySplit: 2 }],
    })
    sheet.columns = headers.map((_, i) => ({ width: widths[i] ?? 16 }))
    const stampRow = sheet.addRow([stamp])
    sheet.mergeCells(1, 1, 1, colCount)
    stampRow.height = 18
    const stampCell = stampRow.getCell(1)
    stampCell.font = { size: 10, color: { argb: THEME.subtitleFg } }
    stampCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.titleBg } }
    stampCell.border = thinBorder()
    stampRow.commit()
    const headerRow = sheet.addRow(headers)
    applyHeaderRow(sheet, 2, colCount)
    headerRow.commit()
    return sheet
  }

  let sheetIndex = 1
  let sheet = openDataSheet(sheetIndex)
  let dataOnSheet = 0

  const addDataRow = (values: (string | number | Date)[]) => {
    if (dataOnSheet >= maxData) {
      sheet.commit()
      sheetIndex += 1
      sheet = openDataSheet(sheetIndex)
      dataOnSheet = 0
    }
    const excelRow = sheet.addRow(
      values.map((v) => (typeof v === 'string' ? safeText(v) : v)),
    )
    styleDataRow(excelRow, colCount, dataOnSheet % 2 === 1)
    for (const col of amountCols) excelRow.getCell(col).numFmt = '#,##0.00'
    for (const col of dateCols) excelRow.getCell(col).numFmt = 'mm/dd/yyyy'
    excelRow.commit()
    dataOnSheet += 1
  }

  const entityOf = (row: InvoiceRowDto) => {
    if (opts.isCompanyTypeCompany) return opts.providerName
    const dealer = row.dealer ?? ''
    return row.idDealer != null && opts.removedDealerIds?.has(row.idDealer)
      ? `${dealer} ${labels.removedSuffix}`
      : dealer
  }
  const deletedOf = (row: InvoiceRowDto) =>
    opts.includeDeleted ? [row.estado === 0 ? labels.yes : ''] : []
  const authorOf = (row: InvoiceRowDto) => (opts.includeAuthor ? [row.author ?? ''] : [])
  // Type 2: the first grid row of each invoice and its position, across chunks.
  const firstRowOf = new Map<number, InvoiceRowDto>()
  const positionOf = new Map<number, number>()

  for await (const chunk of opts.chunks) {
    if (opts.exportType === 1) {
      for (const row of chunk) {
        addDataRow([
          entityOf(row),
          row.displayFullNro || row.fullNro,
          ymdToExcelDate(row.fechaDesde),
          ymdToExcelDate(row.fechaHasta),
          invoiceExportDepartment(row, labels),
          invoiceExportServicesText(row),
          money(row.subtotal),
          invoiceExportRowDiscount(row),
          money(row.total),
          ...authorOf(row),
          row.statementType === 1 ? 'Individual' : '',
          invoiceExportDaysOld(invoiceExportDaysOldStart(row), opts.generatedAt),
          ...deletedOf(row),
          ...invoiceExportPaymentCells(row),
        ])
      }
      continue
    }

    // Each WO line once, in the row of the list it belongs to (§8.6, as legacy since 09/28). An
    // invoice is written where its FIRST row of the grid appears; its lines come from the valued
    // lines query, which already knows the row of each line.
    const newStatements: InvoiceRowDto[] = []
    for (const row of chunk) {
      if (firstRowOf.has(row.id)) continue
      firstRowOf.set(row.id, row)
      positionOf.set(row.id, positionOf.size)
      newStatements.push(row)
    }
    const lines = opts.woLinesOf ? await opts.woLinesOf(newStatements.map((r) => r.id)) : []
    for (const line of sortWoLines(lines, positionOf)) {
      const row = firstRowOf.get(line.idStatement)
      if (!row) continue
      addDataRow([
        entityOf(row),
        // Number of the row the line belongs to, with the partial-payment mark of the grid (D7).
        formatFullNroWithNroBilled(line.fullNro, line.rowKind === 1 ? null : line.nroBilled),
        line.fechaAlta ? ymdToUs(line.fechaAlta.slice(0, 10)) : '',
        line.woFullNro,
        line.vin,
        line.stockNumber,
        line.year,
        line.make,
        line.model,
        line.color,
        line.ro,
        line.po,
        row.department ?? '',
        line.service,
        money(line.price),
        line.approver,
        ...authorOf(row),
        line.checkNumber,
        money(line.lista - line.neto),
        money(line.neto),
        ...deletedOf(row),
      ])
    }
  }

  sheet.commit()
  await workbook.commit()
}
