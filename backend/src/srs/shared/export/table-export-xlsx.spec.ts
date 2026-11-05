/** Nota en el título de columna (P9 de plans/plan-reporte-tint/PLAN.md) y el armado de varias hojas (MC T5). */
import ExcelJS from 'exceljs'

import { buildMultiSheetExportWorkbook, buildTableExportWorkbook, type TableExportColumn } from './table-export-xlsx'

type Row = { name: string; amount: number }
const rows: Row[] = [{ name: 'A', amount: 1.5 }]
const columns: TableExportColumn<Row>[] = [
  { header: 'Name', width: 20, kind: 'text', value: (r) => r.name },
  { header: 'Amount', width: 12, kind: 'money', value: (r) => r.amount, note: 'What Amount counts.' },
]

async function roundTrip(wb: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const out = new ExcelJS.Workbook()
  await out.xlsx.load((await wb.xlsx.writeBuffer()) as ArrayBuffer)
  return out
}

describe('table-export-xlsx', () => {
  it('una columna con note deja la nota en su título; una sin note, no', async () => {
    const wb = await roundTrip(
      buildTableExportWorkbook({
        reportInfoSheet: 'Report Info',
        reportInfoHeader: { field: 'Field', value: 'Value' },
        reportInfo: [{ field: 'Report', value: 'Test' }],
        dataSheet: 'Data',
        stamp: 'stamp',
        columns,
        rows,
      }),
    )
    const header = wb.getWorksheet('Data')!.getRow(2)
    expect(header.getCell(1).value).toBe('Name')
    expect(header.getCell(1).note).toBeUndefined()
    const note = header.getCell(2).note as unknown
    const text = typeof note === 'string' ? note : (note as { texts: { text: string }[] }).texts.map((t) => t.text).join('')
    expect(text).toBe('What Amount counts.')
  })

  it('una hoja: mismo resultado que el armado de varias con un solo elemento', async () => {
    const base = {
      reportInfoSheet: 'Report Info',
      reportInfoHeader: { field: 'Field', value: 'Value' },
      reportInfo: [{ field: 'Report', value: 'Test' }],
    }
    const one = buildTableExportWorkbook({ ...base, dataSheet: 'Data', stamp: 's', columns, rows })
    const many = buildMultiSheetExportWorkbook({ ...base, sheets: [{ name: 'Data', stamp: 's', columns, rows }] })
    const values = (wb: ExcelJS.Workbook) =>
      wb.worksheets.map((ws) => {
        const out: unknown[] = []
        ws.eachRow((r) => out.push(r.values))
        return [ws.name, out]
      })
    expect(values(one)).toEqual(values(many))
  })

  it('varias hojas en orden, después de Report Info', () => {
    const wb = buildMultiSheetExportWorkbook({
      reportInfoSheet: 'Report Info',
      reportInfoHeader: { field: 'Field', value: 'Value' },
      reportInfo: [],
      sheets: [
        { name: 'Summary', stamp: 's', columns, rows },
        { name: 'Income', stamp: 's', columns, rows: [] },
      ],
    })
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Report Info', 'Summary', 'Income'])
  })
})
