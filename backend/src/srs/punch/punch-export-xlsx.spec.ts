import { PassThrough } from 'stream'

import ExcelJS from 'exceljs'

import { writePunchExportWorkbook } from './punch-export-xlsx'
import type { PunchListRowDto } from './dto/punch-list.dto'

function row(id: number): PunchListRowDto {
  return {
    id,
    punchInGmt0: '2026-07-23T21:56:00.000Z',
    punchOutGmt0: '2026-07-24T01:56:00.000Z',
    breakStartGmt0: null,
    breakEndGmt0: null,
    timeWork: '04:00:00',
    timeBreak: '00:00:00',
    numberWork: 4,
    numberBrake: 0,
    estado: 1,
    hasLog: 0,
    manualCreate: 0,
    fixedAt: null,
    fixedBy: null,
    fixedErrorSnapshot: null,
    usuario: { id: 1, nombre: `Emp ${id}`, thumbnailUuid: null },
    rolDpto: { role: 'Tech', department: 'Service' },
    dealer: { id: 639, razonSocial: 'Test Dealer' },
    badPunch: null,
    objPaymentType: { id: 4, name: 'Hourly' },
    hourlyRate: 20,
    typePayment: 4,
    idPunchInLogValidation: null,
    idBreakStartLogValidation: null,
    idBreakEndLogValidation: null,
    idPunchOutLogValidation: null,
    idPunchInLogFingerValidation: 1,
    idBreakStartLogFingerValidation: null,
    idBreakEndLogFingerValidation: null,
    idPunchOutLogFingerValidation: null,
  }
}

describe('writePunchExportWorkbook', () => {
  it('en modo Corrected agrega las dos columnas y la fila Status del Report Info', async () => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    const finished = new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    const corrected: PunchListRowDto = {
      ...row(1),
      estado: 0,
      correctedTypes: [1, 2],
      lastCorrectedAt: '2026-08-27 18:16:53',
    }

    await writePunchExportWorkbook({
      stream,
      locale: 'en',
      includePaymentType: true,
      includeCorrected: true,
      generatedBy: 'Tester',
      generatedAt: new Date('2026-09-06T12:00:00.000Z'),
      reportMeta: [
        { field: 'Report', value: 'Punch Report' },
        // El eje de estado salió de `issueType`: sin esta fila el archivo lista
        // corregidos y dice que no hay filtro.
        { field: 'Status', value: 'Corrected' },
      ],
      rows: [corrected],
    })
    await finished

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.concat(chunks))

    const info = wb.getWorksheet('Report Info')
    expect(info?.getCell('A3').value).toBe('Status')
    expect(info?.getCell('B3').value).toBe('Corrected')

    const data = wb.getWorksheet('Punch Report')
    const headers = (data!.getRow(2).values as unknown[]).slice(1).map(String)
    expect(headers).toContain('Corrected')
    expect(headers).toContain('Last corrected at')

    const cells = (data!.getRow(3).values as unknown[]).slice(1).map(String)
    expect(cells).toContain('Without clock out, Break missing')
    // Formateada como el resto de la planilla, no el string crudo de la base.
    // Ver .cursor/rules/export-date-format.mdc.
    expect(cells).toContain('08/27/2026, 6:16 PM')
  })

  it('sin modo Corrected las dos columnas no existen', async () => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    const finished = new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    await writePunchExportWorkbook({
      stream,
      locale: 'en',
      includePaymentType: true,
      generatedBy: 'Tester',
      generatedAt: new Date('2026-09-06T12:00:00.000Z'),
      reportMeta: [{ field: 'Report', value: 'Punch Report' }],
      rows: [row(1)],
    })
    await finished

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.concat(chunks))
    const headers = (wb.getWorksheet('Punch Report')!.getRow(2).values as unknown[])
      .slice(1)
      .map(String)
    expect(headers).not.toContain('Last corrected at')
  })

  it('Report Info es la primera hoja y rota Punch Report 2 con umbral sintético', async () => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (c: Buffer) => chunks.push(c))
    const finished = new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    await writePunchExportWorkbook({
      stream,
      locale: 'en',
      includePaymentType: true,
      generatedBy: 'Ada Lovelace',
      generatedAt: new Date('2026-08-26T22:47:00.000Z'),
      reportMeta: [
        { field: 'Report', value: 'Punch Report (Individual)' },
        { field: 'Dealers', value: 'Test Dealer' },
      ],
      rows: [row(1), row(2), row(3)],
      maxDataRowsPerSheet: 2,
    })
    await finished

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(Buffer.concat(chunks))
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'Report Info',
      'Punch Report',
      'Punch Report 2',
    ])

    const info = wb.getWorksheet('Report Info')
    expect(info?.getCell('A1').value).toBe('Field')
    expect(info?.getCell('B1').value).toBe('Value')
    expect(info?.getCell('A2').value).toBe('Report')

    const first = wb.getWorksheet('Punch Report')
    expect(String(first?.getCell('A1').value)).toContain('Generated')
    expect(first?.getCell('C2').value).toBe('Dealer')
    expect(first?.getCell('C3').value).toBe('Test Dealer')

    const second = wb.getWorksheet('Punch Report 2')
    expect(second?.getCell('C2').value).toBe('Dealer')
    expect(String(second?.getCell('A1').value)).toContain('Generated')
  })
})
