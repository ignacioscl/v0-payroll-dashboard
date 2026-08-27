import ExcelJS from 'exceljs'
import type { Writable } from 'stream'
import type { PunchListRowDto } from './dto/punch-list.dto'
import { punchExportLabels } from './punch-export-labels'
import {
  formatDurationHhMmSs,
  formatNyDate,
  formatNyStamp,
  formatNyTime,
  formatPunchMethodSuffix,
  punchExportSheetName,
  resolvePunchEventMethod,
  type PunchExportLocale,
} from './punch-export-format'

const THEME = {
  headerBg: 'FF173764',
  headerFg: 'FFFFFFFF',
  titleBg: 'FFE8ECF3',
  titleFg: 'FF091C3A',
  subtitleFg: 'FF546E7A',
  zebraBg: 'FFF5F8FC',
  border: 'FFD0D7DE',
} as const

const EXCEL_MAX_ROWS = 1_048_576
const STAMP_ROWS = 2

export const DEFAULT_PUNCH_EXPORT_MAX_DATA_ROWS = EXCEL_MAX_ROWS - STAMP_ROWS - 8

export type PunchExportMetaRow = { field: string; value: string }

export type WritePunchExportOptions = {
  stream: Writable
  locale: PunchExportLocale
  includePaymentType: boolean
  generatedBy: string
  generatedAt?: Date
  reportMeta: PunchExportMetaRow[]
  rows: AsyncIterable<PunchListRowDto> | Iterable<PunchListRowDto>
  maxDataRowsPerSheet?: number
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: THEME.border } }
  return { top: side, left: side, bottom: side, right: side }
}

function roleDept(row: PunchListRowDto): string {
  if (!row.rolDpto) return ''
  return [row.rolDpto.role, row.rolDpto.department].filter(Boolean).join(' / ')
}

function punchTimeCell(
  iso: string | null,
  fingerId: number | null,
  faceId: number | null,
  locale: PunchExportLocale,
): string {
  const time = formatNyTime(iso)
  if (!time) return ''
  return time + formatPunchMethodSuffix(resolvePunchEventMethod(fingerId, faceId), locale)
}

export function punchRowToCells(
  row: PunchListRowDto,
  locale: PunchExportLocale,
  includePaymentType: boolean,
): (string | number)[] {
  const cells: (string | number)[] = [
    row.usuario?.nombre ?? '',
    roleDept(row),
    row.dealer?.razonSocial ?? '',
    formatNyDate(row.punchInGmt0),
    punchTimeCell(
      row.punchInGmt0,
      row.idPunchInLogFingerValidation,
      row.idPunchInLogValidation,
      locale,
    ),
    punchTimeCell(
      row.breakStartGmt0,
      row.idBreakStartLogFingerValidation,
      row.idBreakStartLogValidation,
      locale,
    ),
    punchTimeCell(
      row.breakEndGmt0,
      row.idBreakEndLogFingerValidation,
      row.idBreakEndLogValidation,
      locale,
    ),
    punchTimeCell(
      row.punchOutGmt0,
      row.idPunchOutLogFingerValidation,
      row.idPunchOutLogValidation,
      locale,
    ),
    formatDurationHhMmSs(row.timeWork),
    formatDurationHhMmSs(row.timeBreak),
  ]
  if (includePaymentType) {
    cells.push(row.objPaymentType?.name ?? '')
  }
  return cells
}

function columnHeaders(locale: PunchExportLocale, includePaymentType: boolean): string[] {
  const l = punchExportLabels(locale)
  const headers = [
    l.colEmployee,
    l.colRoleDept,
    l.colDealer,
    l.colDate,
    l.colPunchIn,
    l.colBreakStart,
    l.colBreakEnd,
    l.colPunchOut,
    l.colTimeWork,
    l.colTimeBreak,
  ]
  if (includePaymentType) headers.push(l.colPaymentType)
  return headers
}

function applyHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number, colCount: number) {
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

function styleDataRow(row: ExcelJS.Row, colCount: number, zebra: boolean) {
  row.height = 18
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c)
    cell.border = thinBorder()
    if (zebra) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.zebraBg } }
    }
  }
}

export async function writePunchExportWorkbook(opts: WritePunchExportOptions): Promise<void> {
  const locale = opts.locale
  const labels = punchExportLabels(locale)
  const includePaymentType = opts.includePaymentType
  const headers = columnHeaders(locale, includePaymentType)
  const colCount = headers.length
  const generatedAt = opts.generatedAt ?? new Date()
  const stamp = `${labels.generated} ${formatNyStamp(generatedAt)} · ${labels.reportName}`
  const maxData = opts.maxDataRowsPerSheet ?? DEFAULT_PUNCH_EXPORT_MAX_DATA_ROWS

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: opts.stream,
    useStyles: true,
    useSharedStrings: false,
  })

  const info = workbook.addWorksheet(labels.reportInfo, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  info.columns = [{ width: 28 }, { width: 90 }]
  const infoHeader = info.addRow([labels.field, labels.value])
  applyHeaderRow(info, 1, 2)
  infoHeader.commit()
  for (const meta of opts.reportMeta) {
    const r = info.addRow([meta.field, meta.value])
    r.height = 18
    r.getCell(1).border = thinBorder()
    r.getCell(2).border = thinBorder()
    r.getCell(1).font = { bold: true, color: { argb: THEME.titleFg } }
    r.commit()
  }
  info.commit()

  const widths = [28, 22, 32, 14, 18, 18, 18, 18, 14, 14, 18]

  const openDataSheet = (index: number) => {
    const sheet = workbook.addWorksheet(punchExportSheetName(index, locale), {
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

  const iterable = Symbol.asyncIterator in Object(opts.rows)
    ? (opts.rows as AsyncIterable<PunchListRowDto>)
    : (async function* () {
        for (const r of opts.rows as Iterable<PunchListRowDto>) yield r
      })()

  for await (const punch of iterable) {
    if (dataOnSheet >= maxData) {
      sheet.commit()
      sheetIndex += 1
      sheet = openDataSheet(sheetIndex)
      dataOnSheet = 0
    }
    const values = punchRowToCells(punch, locale, includePaymentType)
    const excelRow = sheet.addRow(values)
    styleDataRow(excelRow, colCount, dataOnSheet % 2 === 1)
    excelRow.commit()
    dataOnSheet += 1
  }

  sheet.commit()
  await workbook.commit()
}
