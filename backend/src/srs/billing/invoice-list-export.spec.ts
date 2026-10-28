import ExcelJS from 'exceljs'
import { PassThrough } from 'stream'

import type { InvoiceListFilter, InvoiceRowDto } from './dto/invoice-list.dto'
import { InvoiceListQueryDto } from './dto/invoice-list.dto'
import { invoiceExportLabels } from './invoice-export-labels'
import { writeInvoiceListExportWorkbook } from './invoice-list-export-xlsx'
import {
  invoiceListAuthor,
  invoiceListDiscount,
  invoiceListExportLabels,
  invoiceListPeriod,
  invoiceListServicesText,
} from './invoice-list-export-values'
import { buildInvoiceExportReportInfo } from './service/invoice-export.service'

/** plans/plan-report-info-exports-tablas §4.2 / §6: same columns and values as the grid's old Excel. */

function row(partial: Partial<InvoiceRowDto>): InvoiceRowDto {
  return {
    id: 1,
    fullNro: 'A100',
    displayFullNro: 'A100',
    statementType: 2,
    estado: 1,
    createdBySchedule: false,
    fechaCreate: '2026-09-01 10:00:00',
    subtotal: 0,
    discountAmount: 0,
    discountInvoiceAmount: 0,
    total: 0,
    tax: 0,
    sended: 0,
    isBilled: 0,
    isPartialBilled: 0,
    notesCount: 0,
    logCount: 0,
    ...partial,
  }
}

const FILTER: InvoiceListFilter = {
  idDealerProvider: 79,
  idUsuario: 1,
  dealerIds: [10],
  fechaDesde: '2026-09-01',
  fechaHasta: '2026-09-30',
  statementTypes: [],
  page: 1,
  pageSize: 25,
  includeZero: false,
  skipDealerRestriction: false,
  includeRemovedDealers: false,
  departmentIds: [],
  invoiceServiceIds: [],
  woNumbers: [],
  authorIds: [],
  authorsExclude: false,
  createdBySystem: false,
  exactMatch: false,
  dueOn: false,
  deleted: 'hide',
  employeeWorkedIds: [],
  ignorePeriod: false,
  includePartial: true,
  filterDateDone: false,
  orderDir: 'desc',
}

const NO_NAMES = { dealers: [], departments: [], services: [], authors: [], workers: [] }

async function readWorkbook(write: (stream: PassThrough) => Promise<void>): Promise<ExcelJS.Workbook> {
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise((resolve) => stream.on('end', resolve))
  await write(stream)
  await done
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.concat(chunks))
  return wb
}

async function* asChunks<T>(...chunks: T[][]): AsyncGenerator<T[]> {
  for (const c of chunks) yield c
}

describe('grid values (copied from invoice-list-table.tsx)', () => {
  const en = invoiceListExportLabels('en')
  it('Period, Author, Discount sign', () => {
    expect(invoiceListPeriod('2026-09-01', '2026-09-15')).toBe('09/01/2026 – 09/15/2026')
    expect(invoiceListPeriod('2026-09-01', '2026-09-01')).toBe('09/01/2026')
    expect(invoiceListPeriod(undefined, undefined)).toBe('—')
    expect(invoiceListAuthor(row({ createdBySchedule: true, author: 'X' }), en)).toBe('Created by schedule')
    expect(invoiceListAuthor(row({ author: '  ' }), en)).toBe('—')
    expect(invoiceListDiscount(40)).toBe(-40)
    expect(invoiceListDiscount(-10)).toBe(10)
    expect(invoiceListDiscount(0)).toBe(0)
  })
  it('Services: Individual, Generic truncated, by type, with note', () => {
    expect(
      invoiceListServicesText(row({ statementType: 1, invoiceServicesByWo: 'PDI|12|3,Full Detail|9,' }), en),
    ).toBe('Individual - PDI, Full Detail')
    expect(
      invoiceListServicesText(row({ statementType: 6, invoiceServiceSelRel: 'Trash pickup every Monday morning' }), en),
    ).toBe('Generic - Trash pickup every Monday…')
    expect(invoiceListServicesText(row({ statementType: 5 }), en)).toBe('Time Tracking')
    expect(invoiceListServicesText(row({ statementType: 2, invoiceService: 'PDI', invoiceNote: 'rush' }), en)).toBe(
      'PDI — Note: rush',
    )
  })
})

describe('Report Info of the grid export', () => {
  it('Export / Email unchanged; the list export changes the name and adds two rows after Overdue only', () => {
    const base = {
      labels: invoiceExportLabels('en'),
      exportType: 1 as const,
      generatedAt: new Date('2026-10-27T19:15:00Z'),
      generatedBy: 'Tammy',
      query: new InvoiceListQueryDto(),
      filter: FILTER,
      names: NO_NAMES,
    }
    const exportEmail = buildInvoiceExportReportInfo(base)
    expect(exportEmail).toHaveLength(27)
    expect(exportEmail[0].value).toBe('Invoice Report')

    const list = buildInvoiceExportReportInfo({
      ...base,
      listExport: {
        reportName: 'Invoice List',
        extraRows: [
          { field: 'Include partial invoices', value: 'Yes' },
          { field: 'Filter Date Completed', value: 'No' },
        ],
      },
    })
    expect(list).toHaveLength(29)
    expect(list[0].value).toBe('Invoice List')
    const i = list.findIndex((r) => r.field === 'Overdue only')
    expect(list.slice(i + 1, i + 3)).toEqual([
      { field: 'Include partial invoices', value: 'Yes' },
      { field: 'Filter Date Completed', value: 'No' },
    ])
  })
})

describe('writeInvoiceListExportWorkbook', () => {
  it('Report Info, stamp, the grid headers (Partial Invoiced only when on) and the values', async () => {
    const rows = [
      row({
        id: 7,
        displayFullNro: 'LPB52654',
        statementType: 5,
        fechaDesde: '2026-09-01',
        fechaHasta: '2026-09-15',
        author: 'Tammy',
        po: 'P1',
        ro: 'R1',
        subtotal: 1000,
        discountAmount: 100,
        total: 900,
        partialInvoiced: 450.5,
        isBilled: 1,
        checkNumber: '123',
        amount: 900,
      }),
      row({ id: 8, displayFullNro: '=SUM(A1)', subtotal: 50, total: 50 }),
    ]
    const wb = await readWorkbook((stream) =>
      writeInvoiceListExportWorkbook({
        stream,
        locale: 'en',
        generatedAt: new Date('2026-10-27T19:15:00Z'),
        reportInfo: [{ field: 'Report', value: 'Invoice List' }],
        includePartial: true,
        chunks: asChunks(rows.slice(0, 1), rows.slice(1)),
      }),
    )
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Report Info', 'Invoices'])
    const data = wb.getWorksheet('Invoices')!
    expect(data.getCell('A1').value).toBe('Generated 10/27/2026 3:15 PM ET · Invoice List')
    expect(data.getRow(2).values).toEqual([
      undefined,
      'Invoice',
      'Type',
      'Period',
      'Author',
      'Services',
      'PO',
      'RO',
      'Subtotal',
      'Discount',
      'Total',
      'Partial Invoiced',
      'Paid',
      'Check #',
      'Amount',
    ])
    expect(data.getRow(3).values).toEqual([
      undefined,
      'LPB52654',
      'Time Tracking',
      '09/01/2026 – 09/15/2026',
      'Tammy',
      'Time Tracking',
      'P1',
      'R1',
      1000,
      -100,
      900,
      450.5,
      'Paid',
      '123',
      900,
    ])
    expect(data.getRow(3).getCell(8).numFmt).toBe('#,##0.00')
    // A value that starts with "=" stays text; no payment: Unpaid, Amount empty.
    expect(data.getRow(4).getCell(1).value).toEqual({ richText: [{ text: '=SUM(A1)' }] })
    expect(data.getRow(4).getCell(12).value).toBe('Unpaid')
    expect(data.getRow(4).getCell(14).value).toBeNull()
  })

  it('without Include partial invoices there is no Partial Invoiced column (Spanish headers)', async () => {
    const wb = await readWorkbook((stream) =>
      writeInvoiceListExportWorkbook({
        stream,
        locale: 'es',
        generatedAt: new Date('2026-10-27T19:15:00Z'),
        reportInfo: [],
        includePartial: false,
        chunks: asChunks([row({ isBilled: 1 })]),
      }),
    )
    const data = wb.getWorksheet('Invoices')!
    expect(data.getRow(2).values).toEqual([
      undefined,
      'Factura',
      'Tipo',
      'Período',
      'Autor',
      'Servicios',
      'PO',
      'RO',
      'Subtotal',
      'Descuento',
      'Total',
      'Pago',
      'Cheque #',
      'Amount',
    ])
    expect(data.getRow(3).getCell(2).value).toBe('By Services')
    expect(data.getRow(3).getCell(11).value).toBe('Pagada')
  })
})
