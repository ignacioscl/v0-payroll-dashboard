import ExcelJS from 'exceljs'
import type { Writable } from 'stream'
import type { PunchListRowDto } from './dto/punch-list.dto'
import { writeReportInfoSheet } from '../shared/export/report-info-sheet'
import { THEME, applyHeaderRow, styleDataRow, thinBorder } from '../shared/export/xlsx-theme'
import { punchExportLabels } from './punch-export-labels'
import {
  formatDurationHhMmSs,
  formatNyDate,
  formatDbStampForExport,
  formatNyStamp,
  formatNyTime,
  formatPunchMethodSuffix,
  punchExportSheetName,
  resolvePunchEventMethod,
  type PunchExportLocale,
} from './punch-export-format'

const EXCEL_MAX_ROWS = 1_048_576
const STAMP_ROWS = 2

export const DEFAULT_PUNCH_EXPORT_MAX_DATA_ROWS = EXCEL_MAX_ROWS - STAMP_ROWS - 8

export type PunchExportMetaRow = { field: string; value: string }

export type WritePunchExportOptions = {
  stream: Writable
  locale: PunchExportLocale
  includePaymentType: boolean
  /** Agrega las columnas "Corrected" y "Last corrected at" (sólo modo Corrected). */
  includeCorrected?: boolean
  generatedBy: string
  generatedAt?: Date
  reportMeta: PunchExportMetaRow[]
  rows: AsyncIterable<PunchListRowDto> | Iterable<PunchListRowDto>
  maxDataRowsPerSheet?: number
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
  includeCorrected = false,
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
  if (includeCorrected) {
    const l = punchExportLabels(locale)
    cells.push(
      (row.correctedTypes ?? [])
        .map((t) => l.errorTypeNames[t as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8] ?? String(t))
        .join(', '),
    )
    // Nunca el string crudo de la base: el resto de la planilla usa MM/DD/YYYY.
    cells.push(formatDbStampForExport(row.lastCorrectedAt))
  }
  return cells
}

function columnHeaders(
  locale: PunchExportLocale,
  includePaymentType: boolean,
  includeCorrected: boolean,
): string[] {
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
  if (includeCorrected) headers.push(l.colCorrectedTypes, l.colLastCorrectedAt)
  return headers
}

export async function writePunchExportWorkbook(opts: WritePunchExportOptions): Promise<void> {
  const locale = opts.locale
  const labels = punchExportLabels(locale)
  const includePaymentType = opts.includePaymentType
  // Sólo en modo Corrected: son las dos columnas agregadas del SQL del export.
  const includeCorrected = opts.includeCorrected === true
  const headers = columnHeaders(locale, includePaymentType, includeCorrected)
  const colCount = headers.length
  const generatedAt = opts.generatedAt ?? new Date()
  const stamp = `${labels.generated} ${formatNyStamp(generatedAt)} · ${labels.reportName}`
  const maxData = opts.maxDataRowsPerSheet ?? DEFAULT_PUNCH_EXPORT_MAX_DATA_ROWS

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: opts.stream,
    useStyles: true,
    useSharedStrings: false,
  })

  writeReportInfoSheet(
    workbook,
    labels.reportInfo,
    { field: labels.field, value: labels.value },
    opts.reportMeta,
  )

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
    const values = punchRowToCells(punch, locale, includePaymentType, includeCorrected)
    const excelRow = sheet.addRow(values)
    styleDataRow(excelRow, colCount, dataOnSheet % 2 === 1)
    excelRow.commit()
    dataOnSheet += 1
  }

  sheet.commit()
  await workbook.commit()
}

// Sólo visibilidad, no comportamiento: el export del ranking de dealers del
// Dashboard arma su libro con el mismo estilo (punch-dealer-ranking-xlsx.ts).
export { THEME, thinBorder, applyHeaderRow, styleDataRow }
