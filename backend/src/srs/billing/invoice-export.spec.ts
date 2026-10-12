import ExcelJS from 'exceljs'
import { PassThrough } from 'stream'

import type { InvoiceRowDto, InvoiceListFilter } from './dto/invoice-list.dto'
import { InvoiceListQueryDto } from './dto/invoice-list.dto'
import { invoiceExportLabels } from './invoice-export-labels'
import {
  invoiceExportDaysOld,
  invoiceExportDepartment,
  invoiceExportRowDiscount,
  invoiceExportServicesText,
  writeInvoiceExportWorkbook,
} from './invoice-export-xlsx'
import {
  buildInvoiceExportReportInfo,
  invoiceExportFilename,
} from './service/invoice-export.service'
import type { InvoiceExportWoLineRow } from './repository/invoice.repository'

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
  includePartial: false,
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

describe('invoiceExportServicesText — legacy SERVICES rule', () => {
  it('Generic: invoice_service_sel_rel', () => {
    expect(invoiceExportServicesText(row({ statementType: 6, invoiceServiceSelRel: 'Wash, Wax' }))).toBe(
      'Wash, Wax',
    )
  })
  it('Individual without service name: the WO names before "|", trailing commas removed', () => {
    expect(
      invoiceExportServicesText(
        row({ statementType: 1, invoiceServicesByWo: 'PDI|12|3,Full Detail|9,' }),
      ),
    ).toBe('PDI,Full Detail')
  })
  it('By services and multi-services without name', () => {
    expect(invoiceExportServicesText(row({ statementType: 2 }))).toBe('By Services')
    expect(invoiceExportServicesText(row({ statementType: 3 }))).toBe('Multi-Services')
  })
  it('TTK without name: empty', () => {
    expect(invoiceExportServicesText(row({ statementType: 5 }))).toBe('')
  })
  it('With a service name: the name', () => {
    expect(invoiceExportServicesText(row({ statementType: 2, invoiceService: 'PDI' }))).toBe('PDI')
  })
  it('Selected services (4) without name: sel_rel with commas as spaces', () => {
    expect(invoiceExportServicesText(row({ statementType: 4, invoiceServiceSelRel: 'PDI,Wax' }))).toBe(
      'PDI Wax',
    )
  })
})

describe('invoiceExportDepartment (§8.8)', () => {
  const en = invoiceExportLabels('en')
  it('Time Tracking without department: "Timesheets", in both languages', () => {
    expect(invoiceExportDepartment(row({ statementType: 5 }), en)).toBe('Timesheets')
    expect(invoiceExportDepartment(row({ statementType: 5 }), invoiceExportLabels('es'))).toBe('Timesheets')
  })
  it('with a department: the department, also for Time Tracking', () => {
    expect(invoiceExportDepartment(row({ statementType: 5, department: 'Sales' }), en)).toBe('Sales')
    expect(invoiceExportDepartment(row({ statementType: 2, department: 'Service' }), en)).toBe('Service')
  })
  it('other types without department: empty', () => {
    expect(invoiceExportDepartment(row({ statementType: 2 }), en)).toBe('')
    expect(invoiceExportDepartment(row({ statementType: 6 }), en)).toBe('')
  })
})

describe('invoiceExportRowDiscount (§8.6)', () => {
  it("the row's share of the discount, empty when 0", () => {
    expect(invoiceExportRowDiscount(row({ discount: 180, discountAmount: 113.6912 }))).toBe(113.69)
    expect(invoiceExportRowDiscount(row({ discount: 180, discountAmount: 0 }))).toBe('')
  })
})

describe('invoiceExportDaysOld', () => {
  it('days from the creation date to the New York date of the file', () => {
    // 10/09/2026 11 PM in New York is already 10/10 in UTC: it still counts as the 9th.
    const generatedAt = new Date('2026-10-10T03:00:00Z')
    expect(invoiceExportDaysOld('2026-09-21 18:40:00', generatedAt)).toBe(18)
    expect(invoiceExportDaysOld('2026-10-09 23:59:59', generatedAt)).toBe(0)
  })
  it('empty when there is no date', () => {
    expect(invoiceExportDaysOld('', new Date())).toBe('')
  })
})

describe('invoiceExportFilename (D12)', () => {
  it('defaults by type', () => {
    expect(invoiceExportFilename(1)).toBe('report_invoice.xlsx')
    expect(invoiceExportFilename(2, '  ')).toBe('report_invoice_wo_details.xlsx')
  })
  it('keeps letters, digits, space, _ - . and adds .xlsx', () => {
    expect(invoiceExportFilename(1, 'AutoNation 9/27: open')).toBe('AutoNation 927 open.xlsx')
    expect(invoiceExportFilename(1, 'open.XLSX')).toBe('open.XLSX')
  })
})

describe('buildInvoiceExportReportInfo', () => {
  const query = Object.assign(new InvoiceListQueryDto(), { types: 'wo,ttk' })
  it('lists the 27 rows with "All" for empty filters (en)', () => {
    const rows = buildInvoiceExportReportInfo({
      labels: invoiceExportLabels('en'),
      exportType: 1,
      generatedAt: new Date('2026-10-09T15:00:00Z'),
      generatedBy: 'Tammy',
      query,
      filter: { ...FILTER, payed: '0' },
      names: { ...NO_NAMES, dealers: ['AutoNation BMW of Delray Beach'] },
    })
    expect(rows).toHaveLength(27)
    const byField = Object.fromEntries(rows.map((r) => [r.field, r.value]))
    expect(byField['Report']).toBe('Invoice Report')
    expect(byField['Dealers']).toBe('AutoNation BMW of Delray Beach')
    expect(byField['Date from']).toBe('09/01/2026')
    expect(byField['Invoice types']).toBe('Work Orders, Time Tracking')
    expect(byField['Payment']).toBe('Unpaid')
    expect(byField['Hide $0 invoices']).toBe('Yes')
    expect(byField['Department']).toBe('All')
    expect(byField['Deleted']).toBe('Hide')
  })
  it('Spanish labels and values', () => {
    const rows = buildInvoiceExportReportInfo({
      labels: invoiceExportLabels('es'),
      exportType: 2,
      generatedAt: new Date('2026-10-09T15:00:00Z'),
      generatedBy: 'Tammy',
      query: new InvoiceListQueryDto(),
      filter: FILTER,
      names: NO_NAMES,
    })
    const byField = Object.fromEntries(rows.map((r) => [r.field, r.value]))
    expect(byField['Reporte']).toBe('Invoice with Wo Details')
    expect(byField['Sucursales']).toBe('Todos')
    expect(byField['Pago']).toBe('Todas')
    expect(byField['Tipos de factura']).toBe('Todos')
  })
})

describe('writeInvoiceExportWorkbook', () => {
  const base = {
    locale: 'en' as const,
    generatedAt: new Date('2026-10-09T15:00:00Z'),
    reportInfo: [{ field: 'Report', value: 'Invoice Report' }],
    isCompanyTypeCompany: false,
    providerName: 'Auto Wax',
    includeAuthor: false,
    includeDeleted: false,
  }

  it('type 1: Report Info first, stamp on row 1, legacy headers on row 2, data from row 3', async () => {
    const wb = await readWorkbook((stream) =>
      writeInvoiceExportWorkbook({
        ...base,
        stream,
        exportType: 1,
        chunks: asChunks(
          [
            row({
              id: 1,
              dealer: 'AutoNation Honda Hollywood',
              displayFullNro: 'HHW39245',
              statementType: 1,
              fechaDesde: '2026-09-21',
              fechaHasta: '2026-09-21',
              department: 'Sales',
              invoiceServicesByWo: 'Full Detail|1,',
              subtotal: 85,
              total: 85,
            }),
          ],
          [row({ id: 2, dealer: 'AutoNation Lexus of Palm Beach', displayFullNro: '=SUM(1)', total: 150, subtotal: 150 })],
          [row({ id: 3, dealer: 'AutoNation Lexus of Palm Beach', displayFullNro: 'LPB100', statementType: 5, total: 900, subtotal: 900 })],
        ),
      }),
    )
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Report Info', 'Invoice Report'])
    const data = wb.getWorksheet('Invoice Report')!
    expect(String(data.getRow(1).getCell(1).value)).toMatch(/^Generated 10\/09\/2026 .* · Invoice Report$/)
    expect(data.getRow(2).values).toEqual([
      undefined,
      'DEALER',
      'INVOICE#',
      'DATE FROM',
      'DATE TO',
      'DEPARTMENT',
      'SERVICES',
      'SUB TOTAL',
      'DISCOUNT',
      'TOTAL',
      'TYPE',
      'DAYS OLD',
    ])
    const r3 = data.getRow(3)
    expect(r3.getCell(1).value).toBe('AutoNation Honda Hollywood')
    expect(r3.getCell(3).value).toBe('09/21/2026')
    expect(r3.getCell(5).value).toBe('Sales')
    expect(r3.getCell(6).value).toBe('Full Detail')
    expect(r3.getCell(9).value).toBe(85)
    expect(r3.getCell(10).value).toBe('Individual')
    // fechaCreate 2026-09-01, file generated 10/09/2026 in New York.
    expect(r3.getCell(11).value).toBe(38)
    // A value starting with "=" is never a formula.
    expect(data.getRow(4).getCell(2).formula).toBeUndefined()
    // A WO invoice without department stays empty; Time Tracking says "Timesheets" (§8.8).
    expect(data.getRow(4).getCell(5).value ?? '').toBe('')
    expect(data.getRow(5).getCell(5).value).toBe('Timesheets')
  })

  it('external user: COMPANY with the provider name', async () => {
    const wb = await readWorkbook((stream) =>
      writeInvoiceExportWorkbook({
        ...base,
        stream,
        exportType: 1,
        isCompanyTypeCompany: true,
        chunks: asChunks([row({ dealer: 'AutoNation Nissan Miami' })]),
      }),
    )
    const data = wb.getWorksheet('Invoice Report')!
    expect(data.getRow(2).getCell(1).value).toBe('COMPANY')
    expect(data.getRow(3).getCell(1).value).toBe('Auto Wax')
  })

  it('type 2: each line once, in the row it belongs to, with CHECK#, DISCOUNT and TOTAL (§8.6)', async () => {
    const base2: InvoiceExportWoLineRow = {
      idStatement: 7,
      fullNro: 'C1',
      rowKind: 1,
      idBilling: null,
      nroBilled: null,
      relId: 1,
      woNro: 10,
      woFullNro: 'WO10',
      ro: 'R',
      po: 'P',
      stockNumber: 'S',
      fechaAlta: '2026-09-20 18:30:00',
      vin: 'VIN',
      color: 'Red',
      year: '2024',
      make: 'Toyota',
      model: 'Camry / LE',
      service: 'PDI',
      price: 75,
      approver: '',
      checkNumber: '',
      lista: 75,
      neto: 70.5,
    }
    const paid: InvoiceExportWoLineRow = {
      ...base2,
      relId: 2,
      rowKind: 3,
      idBilling: 900,
      nroBilled: 1,
      checkNumber: '5521',
      neto: 75,
    }
    let asked: number[][] = []
    const wb = await readWorkbook((stream) =>
      writeInvoiceExportWorkbook({
        ...base,
        stream,
        exportType: 2,
        // The invoice has two grid rows, split across two chunks: its lines must come once.
        chunks: asChunks(
          [row({ id: 7, displayFullNro: 'C1', department: 'Service' })],
          [row({ id: 7, displayFullNro: 'C1-1', department: 'Service', nroBilled: 1 })],
        ),
        woLinesOf: async (ids) => {
          asked.push(ids)
          return ids.includes(7) ? [paid, base2] : []
        },
      }),
    )
    const data = wb.getWorksheet('Invoice with Wo Details')!
    expect(asked).toEqual([[7], []])
    expect(data.rowCount).toBe(4)
    expect(data.getRow(2).getCell(17).value).toBe('CHECK#')
    expect(data.getRow(2).getCell(19).value).toBe('TOTAL')
    // Balance row first, then the payment row (row kind order).
    expect(data.getRow(3).getCell(2).value).toBe('C1')
    expect(data.getRow(4).getCell(2).value).toBe('C1-1')
    expect(data.getRow(3).getCell(3).value).toBe('09/20/2026')
    expect(data.getRow(3).getCell(9).value).toBe('Camry / LE')
    expect(data.getRow(3).getCell(13).value).toBe('Service')
    expect(data.getRow(3).getCell(15).value).toBe(75)
    expect(data.getRow(3).getCell(18).value).toBe(4.5)
    expect(data.getRow(3).getCell(19).value).toBe(70.5)
    expect(data.getRow(4).getCell(17).value).toBe('5521')
    expect(data.getRow(4).getCell(18).value).toBe(0)
  })

  it('no rows: Report Info and the data sheet with its headers', async () => {
    const wb = await readWorkbook((stream) =>
      writeInvoiceExportWorkbook({ ...base, stream, exportType: 1, chunks: asChunks() }),
    )
    const data = wb.getWorksheet('Invoice Report')!
    expect(data.rowCount).toBe(2)
  })
})
