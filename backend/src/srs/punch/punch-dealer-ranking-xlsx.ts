import ExcelJS from 'exceljs'

import type {
  DealerRankingStatus,
  PunchDealerRankingEmployeeRow,
  PunchDealerRankingRowDto,
} from './dto/punch-dealer-ranking.dto'
import { formatNyStamp, type PunchExportLocale } from './punch-export-format'
import {
  applyHeaderRow,
  styleDataRow,
  THEME,
  thinBorder,
  type PunchExportMetaRow,
} from './punch-export-xlsx'
import {
  punchDealerRankingLabels,
  type PunchDealerRankingLabels,
} from './punch-dealer-ranking-labels'

export type DealerRankingWorkbookOptions = {
  locale: PunchExportLocale
  status: DealerRankingStatus
  /** Tipos INCLUIDOS, ya parseados: sólo esos tienen columna, igual que en el modal. */
  errorTypes: readonly number[]
  generatedAt: Date
  /** Filas del Report Info, ya armadas por el servicio (con el aviso, si aplica). */
  reportMeta: PunchExportMetaRow[]
  /** Aviso de cobertura ya resuelto, o `null` si no aplica. */
  notice: string | null
  dealers: readonly PunchDealerRankingRowDto[]
  employees: readonly PunchDealerRankingEmployeeRow[]
}

type RankingRow = PunchDealerRankingRowDto & { employeeName?: string }

type RankingColumn = {
  header: string
  width: number
  value: (row: RankingRow, index: number) => string | number
}

/** Código de `TTK_PUNCH_WITH_ERROR_V2` → campo del desglose por tipo. */
const BY_TYPE_KEY = {
  1: 'clockOutMissing',
  2: 'breakMissing',
  3: 'shift20hPlus',
} as const

/**
 * Columnas de las hojas de datos, las mismas del modal: `#` (la posición en el
 * ranking), el total (Errors en Pending, Corrections en Corrected), Punches sólo en
 * Corrected, y una por cada tipo INCLUIDO. Employees suma el nombre del empleado.
 * Los números van como número, nunca como texto.
 */
function rankingColumns(
  labels: PunchDealerRankingLabels,
  status: DealerRankingStatus,
  errorTypes: readonly number[],
  withEmployee: boolean,
): RankingColumn[] {
  const columns: RankingColumn[] = [
    { header: labels.colRank, width: 6, value: (_row, index) => index + 1 },
  ]
  if (withEmployee) {
    columns.push({ header: labels.colEmployee, width: 32, value: (row) => row.employeeName ?? '' })
  }
  columns.push({ header: labels.colDealer, width: 40, value: (row) => row.dealerName })
  if (status === 'corrected') {
    columns.push({ header: labels.colCorrections, width: 14, value: (row) => row.total })
    columns.push({ header: labels.colPunches, width: 14, value: (row) => row.punches ?? 0 })
  } else {
    columns.push({ header: labels.colErrors, width: 14, value: (row) => row.total })
  }
  for (const type of errorTypes) {
    const code = type as 1 | 2 | 3
    const key = BY_TYPE_KEY[code]
    columns.push({
      header: labels.errorTypeNames[code],
      width: 18,
      value: (row) => row.byType[key],
    })
  }
  return columns
}

function addRankingSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: RankingColumn[],
  rows: readonly RankingRow[],
  stamp: string,
  notice: string | null,
): void {
  // Fila 1 el sello; fila 2 el aviso, sólo si aplica. El encabezado va debajo.
  const headerRowNumber = notice ? 3 : 2
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: headerRowNumber }],
  })
  sheet.columns = columns.map((c) => ({ width: c.width }))
  const colCount = columns.length

  // Sello corto (xls-export-report-info): sobrevive a que alguien copie la hoja sola.
  const stampRow = sheet.addRow([stamp])
  sheet.mergeCells(1, 1, 1, colCount)
  stampRow.height = 18
  const stampCell = stampRow.getCell(1)
  stampCell.font = { size: 10, color: { argb: THEME.subtitleFg } }
  stampCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.titleBg } }
  stampCell.border = thinBorder()

  if (notice) {
    const noticeRow = sheet.addRow([notice])
    sheet.mergeCells(2, 1, 2, colCount)
    noticeRow.height = 30
    const noticeCell = noticeRow.getCell(1)
    noticeCell.font = { bold: true, color: { argb: THEME.titleFg } }
    noticeCell.alignment = { vertical: 'middle', wrapText: true }
    noticeCell.border = thinBorder()
  }

  sheet.addRow(columns.map((c) => c.header))
  applyHeaderRow(sheet, headerRowNumber, colCount)

  rows.forEach((row, index) => {
    const excelRow = sheet.addRow(columns.map((c) => c.value(row, index)))
    styleDataRow(excelRow, colCount, index % 2 === 1)
  })
}

/**
 * Libro del export del ranking de dealers: Report Info + Dealers + Employees.
 *
 * Se arma en memoria con `ExcelJS.Workbook`: son decenas o cientos de filas (72
 * dealers y 535 filas empleado × dealer para dos meses del provider 79), no las
 * 34.000+ que obligaron a Punch Report a escribir en stream. El estilo es el suyo.
 */
export function buildDealerRankingWorkbook(opts: DealerRankingWorkbookOptions): ExcelJS.Workbook {
  const labels = punchDealerRankingLabels(opts.locale)
  const reportName = labels.reportNames[opts.status]
  const stamp = `${labels.generated} ${formatNyStamp(opts.generatedAt)} · ${reportName}`

  const workbook = new ExcelJS.Workbook()

  // Report Info es la primera hoja, en dos columnas Field / Value, como en P4.
  const info = workbook.addWorksheet(labels.reportInfo, {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  info.columns = [{ width: 28 }, { width: 90 }]
  info.addRow([labels.field, labels.value])
  applyHeaderRow(info, 1, 2)
  for (const meta of opts.reportMeta) {
    const r = info.addRow([meta.field, meta.value])
    r.height = 18
    r.getCell(1).border = thinBorder()
    r.getCell(2).border = thinBorder()
    r.getCell(1).font = { bold: true, color: { argb: THEME.titleFg } }
  }

  addRankingSheet(
    workbook,
    labels.sheetDealers,
    rankingColumns(labels, opts.status, opts.errorTypes, false),
    opts.dealers,
    stamp,
    opts.notice,
  )
  addRankingSheet(
    workbook,
    labels.sheetEmployees,
    rankingColumns(labels, opts.status, opts.errorTypes, true),
    opts.employees,
    stamp,
    opts.notice,
  )

  return workbook
}
