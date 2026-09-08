import ExcelJS from 'exceljs'
import { fetchPunchGrouped, fetchPunchList } from '@/lib/srs-kpis-api'
import type { PunchGroupedQueryParams } from '@/lib/ttk/punch-grouped-filters'
import type { PunchGroupedRow } from '@/lib/ttk/punch-grouped-types'
import type { PunchListCursor, PunchListQueryParams } from '@/lib/ttk/punch-list-filters'
import type { TtkListRow } from '@/lib/ttk/ttk-list-types'
import { ttkListRowToExportRecord, type TtkListExportLabels } from '@/lib/ttk/ttk-list-export-rows'
import {
  applyTitleRow,
  downloadExcelWorkbook,
  writeReportInfoSheet,
  writeStyledDataRows,
  type ReportInfoRow,
} from '@/lib/excel/srs-xlsx-theme'
import {
  formatUsCalendarDate,
  formatUsDateTimeForExport,
  todayUsForFilename,
} from '@/lib/format-us-datetime'
import { ALL_ERROR_TYPES } from '@/lib/filters/error-types-cookie'

export type PunchGroupedExportLabels = TtkListExportLabels & {
  groupedSheet: string
  totalHours: string
  /** P7 — set 1: Punches / Errors / Fixed. */
  punchCount: string
  errorCount: string
  fixedCount: string
  /** Etiqueta de la columna dinamica en modo Corregidos. */
  correctedColumn: string
  /** Nombres visibles de los tipos de error, para exportar `correctedTypes`. */
  errorTypeNames: Record<number, string>
  exportingProgress: string
  exportSheetTitle?: string
  exportSheetSubtitle?: string
  exportDetailSheetTitle?: string
  /** Etiquetas de la hoja Report Info. */
  reportInfo: {
    sheet: string
    field: string
    value: string
    report: string
    generated: string
    generatedBy: string
    screen: string
    screenValue: string
    mode: string
    scope: string
    period: string
    until: string
    dealers: string
    employee: string
    paymentType: string
    errorTypes: string
    /** Eje pendiente/corregido: sin esta fila el archivo no dice qué estado listó. */
    errorStatus: string
    /** Filtros efectivos que este Report Info venía omitiendo. */
    issueType: string
    search: string
    minHours: string
    maxHours: string
    /** §4.1bis — Working / On lunch / Out, que ahora SI se aplica al padre. */
    liveStatus: string
    all: string
  }
}

/**
 * Nombres VISIBLES de los filtros, congelados al hacer clic en exportar.
 *
 * La grilla no tiene los catálogos: los labels de dealer viven en el
 * `useSrsDealers()` del header y el payment type llega como valor técnico. Por
 * eso los baja la página y los pasa ya resueltos — la regla prohíbe exportar
 * ids o nombres técnicos.
 */
export type PunchGroupedReportInfo = {
  generatedBy: string
  mode: string
  scope: string
  dealers: string
  employee: string
  paymentType: string
  errorTypes: string
  /**
   * `xls-export-report-info` es `alwaysApply` y este Report Info venía omitiendo
   * `issueType`, `search` y min/max horas: incumplía la regla ANTES de este
   * paquete. Agregarle sólo "Status" lo dejaría igual de incompleto.
   */
  errorStatus: string
  issueType: string
  search: string
  minHours: string
  maxHours: string
  /** §4.1bis — etiqueta visible del estado en vivo elegido. */
  liveStatus: string
}

export type PunchGroupedExportMode = 'grouped' | 'detail'

export type PunchGroupedExportScope = 'all' | 'selected'

export type PunchGroupedExportInput = {
  mode: PunchGroupedExportMode
  scope?: PunchGroupedExportScope
  /** When scope is `selected`, export only these employee ids. */
  employeeIds?: number[]
  groupedParamsBase: Omit<PunchGroupedQueryParams, 'page' | 'pageSize'>
  punchListParams: Omit<PunchListQueryParams, 'afterValue' | 'afterId' | 'idEmployee'>
  includePaymentType: boolean
  labels: PunchGroupedExportLabels
  fileName: string
  reportInfo: PunchGroupedReportInfo
  /** Tipos incluidos: gobierna la columna WITH ERRORS del detalle. */
  includedErrorTypes?: readonly number[]
  /** Modo Corrected: agrega las columnas de corrección al detalle por empleado. */
  includeCorrected?: boolean
  /** Nombre visible de cada código 1|2|3, ya traducido. */
  errorTypeNames?: Record<number, string>
  onProgress?: (message: string) => void
}

const EXPORT_PAGE_SIZE = 500

export function sanitizeExcelSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31) || 'Employee'
  let candidate = base
  let n = 2
  while (used.has(candidate)) {
    const suffix = ` (${n})`
    candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    n++
  }
  used.add(candidate)
  return candidate
}

function collectPaymentTypeLabels(rows: PunchGroupedRow[]): string[] {
  const labels = new Set<string>()
  for (const row of rows) {
    for (const pt of row.byPaymentType) {
      labels.add(pt.label)
    }
  }
  return Array.from(labels).sort((a, b) => a.localeCompare(b))
}

function paymentTypeHours(row: PunchGroupedRow, label: string): number | '' {
  const match = row.byPaymentType.find((pt) => pt.label === label)
  if (!match) return ''
  return Math.round(match.hoursNumber * 100) / 100
}

function buildGroupedHeaders(
  paymentTypeLabels: string[],
  labels: PunchGroupedExportLabels,
  isCorrectedMode: boolean,
): string[] {
  return [
    labels.employee,
    labels.totalHours,
    labels.timeBreak,
    // El encabezado YA cambiaba con el modo; lo que no cambiaba era la celda.
    isCorrectedMode ? labels.correctedColumn : labels.hasError,
    // P7 — salen SIEMPRE, esten ocultas o no en pantalla: esta hoja se arma por
    // su cuenta y no mira la visibilidad de columnas. Es intencional.
    labels.punchCount,
    labels.errorCount,
    labels.fixedCount,
    ...paymentTypeLabels,
  ]
}

function buildGroupedDataRow(
  row: PunchGroupedRow,
  paymentTypeLabels: string[],
  labels: PunchGroupedExportLabels,
  isCorrectedMode: boolean,
): (string | number)[] {
  // La columna dinamica escribia SIEMPRE `Yes/No` mientras el encabezado si
  // cambiaba a *Corrected*: una columna titulada "Corrected" con "Yes" adentro,
  // que no dice QUE se corrigio. Rompe D-B y la invariante de D-11.
  const count = isCorrectedMode ? row.fixedCount : row.errorCount
  const suffix = count > 0 ? ` (${count})` : ''
  const dynamicCell = isCorrectedMode
    ? (() => {
        const types = (row.correctedTypes ?? []).map((t) => labels.errorTypeNames[t] ?? String(t))
        return types.length === 0 ? labels.no : types.join(', ') + suffix
      })()
    : row.hasError
      ? labels.yes + suffix
      : labels.no

  return [
    row.nombreEmployee,
    Math.round(row.hoursNumber * 100) / 100,
    Math.round(row.breakNumber * 100) / 100,
    dynamicCell,
    // Numeros de verdad, no strings: el mapper del backend ya los pasa por
    // Number(), asi que el XLSX escribe celdas numericas y ordenables.
    row.punchCount,
    row.errorCount,
    row.fixedCount,
    ...paymentTypeLabels.map((pt) => paymentTypeHours(row, pt)),
  ]
}

function recordsToMatrix(records: Record<string, string | number>[]): {
  headers: string[]
  rows: (string | number)[][]
} {
  if (records.length === 0) return { headers: [], rows: [] }
  const headers = Object.keys(records[0]!)
  const rows = records.map((r) => headers.map((h) => r[h] ?? ''))
  return { headers, rows }
}

async function fetchAllGroupedRows(
  base: Omit<PunchGroupedQueryParams, 'page' | 'pageSize'>,
): Promise<PunchGroupedRow[]> {
  const collected: PunchGroupedRow[] = []
  let page = 1
  // Frontera congelada: la primera respuesta la trae y las siguientes la reenvían.
  // Sin esto, exportar durante el pico de ponchado repite o saltea empleados,
  // porque cada alta nueva corre los OFFSET de las páginas que faltan.
  let snapshotAt = base.snapshotAt
  while (true) {
    const res = await fetchPunchGrouped({
      ...base,
      snapshotAt,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    })
    snapshotAt = res.snapshotAt
    collected.push(...res.results)
    if (!res.hasMore) break
    page++
  }
  return collected
}

async function fetchAllPunchesForEmployee(
  base: Omit<PunchListQueryParams, 'afterValue' | 'afterId' | 'idEmployee'>,
  employeeId: number,
): Promise<TtkListRow[]> {
  const collected: TtkListRow[] = []
  let cursor: PunchListCursor | null = null

  // Paginado por cursor, no por offset: aunque un empleado suele entrar en un solo
  // lote, el bucle queda correcto si entran ponchadas mientras se exporta.
  do {
    const page = await fetchPunchList({
      ...base,
      idEmployee: employeeId,
      pageSize: EXPORT_PAGE_SIZE,
      sort: 'punchIn',
      dir: 'desc',
      // `sort: 'punchIn'` no es nulable, asi que este cursor nunca cae en el
      // tramo de vacios — pero se migra igual, para que no quede un segundo
      // dialecto del mismo contrato.
      afterValue: cursor?.value ?? undefined,
      afterId: cursor?.id,
      afterEmpty: cursor ? (cursor.empty === 1 ? '1' : '0') : undefined,
    })
    collected.push(...page.results)
    cursor = page.hasMore ? page.nextCursor : null
  } while (cursor)

  return collected
}

function buildGroupedSubtitle(
  labels: PunchGroupedExportLabels,
  count: number,
  fechaDesde?: string,
  fechaHasta?: string,
): string {
  // Fechas US en TODO el archivo, no sólo en Report Info: con el formato ISO el
  // subtítulo mezclaba convenciones dentro del mismo xlsx.
  const period =
    fechaDesde && fechaHasta
      ? `${formatUsCalendarDate(fechaDesde)} → ${formatUsCalendarDate(fechaHasta)}`
      : undefined
  const countLabel = labels.exportSheetSubtitle?.replace('{count}', String(count)) ?? `${count}`
  const parts = [period, countLabel].filter(Boolean)
  return parts.join(' · ')
}

/**
 * Período legible del reporte, en formato US.
 *
 * Único lugar donde se arma: título, sello y Report Info lo comparten. Antes el
 * título tenía su propio fallback con las fechas ISO crudas, así que el mismo
 * archivo mezclaba `2026-06-01` arriba y `06/01/2026` en la hoja de info.
 */
function periodLabel(
  labels: PunchGroupedExportLabels,
  base: Omit<PunchGroupedQueryParams, 'page' | 'pageSize'>,
): string {
  if (!base.fechaDesde || !base.fechaHasta) return labels.reportInfo.all
  return `${formatUsCalendarDate(base.fechaDesde)} ${labels.reportInfo.until} ${formatUsCalendarDate(base.fechaHasta)}`
}

function buildStamp(
  labels: PunchGroupedExportLabels,
  info: PunchGroupedReportInfo,
  generatedAt: Date,
  base: Omit<PunchGroupedQueryParams, 'page' | 'pageSize'>,
): string {
  return `${periodLabel(labels, base)} · ${info.generatedBy} · ${formatUsDateTimeForExport(generatedAt.toISOString())}`
}

function buildReportInfoRows(
  labels: PunchGroupedExportLabels,
  info: PunchGroupedReportInfo,
  generatedAt: Date,
  base: Omit<PunchGroupedQueryParams, 'page' | 'pageSize'>,
  employeeCount: number,
): ReportInfoRow[] {
  const r = labels.reportInfo
  const period = periodLabel(labels, base)
  return [
    { field: r.report, value: `${labels.groupedSheet} (${employeeCount})` },
    { field: r.generated, value: formatUsDateTimeForExport(generatedAt.toISOString()) },
    { field: r.generatedBy, value: info.generatedBy },
    { field: r.screen, value: r.screenValue },
    { field: r.mode, value: info.mode },
    { field: r.scope, value: info.scope },
    { field: r.period, value: period },
    { field: r.dealers, value: info.dealers },
    { field: r.employee, value: info.employee },
    { field: r.paymentType, value: info.paymentType },
    { field: r.issueType, value: info.issueType },
    { field: r.errorStatus, value: info.errorStatus },
    { field: r.errorTypes, value: info.errorTypes },
    { field: r.search, value: info.search },
    { field: r.minHours, value: info.minHours },
    { field: r.maxHours, value: info.maxHours },
    // `xls-export-report-info` es alwaysApply: el archivo tiene que decir CON QUE
    // filtros se genero, y este ahora aplica de verdad a la fila agrupada.
    { field: r.liveStatus, value: info.liveStatus },
  ]
}

export async function exportPunchGroupedXlsx(input: PunchGroupedExportInput): Promise<number> {
  const {
    mode,
    scope = 'all',
    employeeIds,
    groupedParamsBase,
    punchListParams,
    includePaymentType,
    labels,
    fileName,
    reportInfo,
    includedErrorTypes = ALL_ERROR_TYPES,
    includeCorrected = false,
    errorTypeNames,
    onProgress,
  } = input

  const generatedAt = new Date()

  onProgress?.(labels.exportingProgress)

  let groupedRows = await fetchAllGroupedRows(groupedParamsBase)

  if (scope === 'selected' && employeeIds && employeeIds.length > 0) {
    const idSet = new Set(employeeIds)
    groupedRows = groupedRows.filter((r) => idSet.has(r.idUsuario))
  }

  if (groupedRows.length === 0) {
    throw new Error('No employees to export')
  }
  const paymentTypeLabels = collectPaymentTypeLabels(groupedRows)
  const usedSheetNames = new Set<string>()
  const sheetNames = new Map<number, string>()

  for (const row of groupedRows) {
    sheetNames.set(row.idUsuario, sanitizeExcelSheetName(row.nombreEmployee, usedSheetNames))
  }

  const withDetail = mode === 'detail'
  const isCorrectedMode = groupedParamsBase.issueType === 'only_fixed'
  const headers = buildGroupedHeaders(paymentTypeLabels, labels, isCorrectedMode)
  const dataRows = groupedRows.map((r) =>
    buildGroupedDataRow(r, paymentTypeLabels, labels, isCorrectedMode),
  )

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SRS Payroll Dashboard'
  workbook.created = new Date()

  const mainSheetName = sanitizeExcelSheetName(labels.groupedSheet, new Set())
  const mainWs = workbook.addWorksheet(mainSheetName, {
    views: [{ showGridLines: true }],
  })

  const title =
    labels.exportSheetTitle ?? `${labels.groupedSheet} — ${periodLabel(labels, groupedParamsBase)}`
  const subtitle = [
    buildGroupedSubtitle(
      labels,
      groupedRows.length,
      groupedParamsBase.fechaDesde,
      groupedParamsBase.fechaHasta,
    ),
    // Sello corto también en la hoja principal.
    `${reportInfo.generatedBy} · ${formatUsDateTimeForExport(generatedAt.toISOString())}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const headerRow = applyTitleRow(mainWs, title, headers.length, subtitle)

  const errorColIndex =
    headers.indexOf(isCorrectedMode ? labels.correctedColumn : labels.hasError) + 1
  const hoursColIndexes = new Set(
    [labels.totalHours, labels.timeBreak, ...paymentTypeLabels]
      .map((h) => headers.indexOf(h) + 1)
      .filter((i) => i > 0),
  )

  writeStyledDataRows(mainWs, headers, dataRows, {
    headerRow,
    hoursColIndexes,
    errorColIndex,
    yesLabel: labels.yes,
    linkColIndex: withDetail ? headers.indexOf(labels.employee) + 1 : undefined,
    linkTargets: withDetail
      ? groupedRows.map((r) => sheetNames.get(r.idUsuario))
      : undefined,
  })

  if (withDetail) {
    for (let i = 0; i < groupedRows.length; i++) {
      const employee = groupedRows[i]!
      const sheetName = sheetNames.get(employee.idUsuario)!
      onProgress?.(
        `${labels.exportingProgress} (${i + 1}/${groupedRows.length}) — ${employee.nombreEmployee}`,
      )

      const punches = await fetchAllPunchesForEmployee(punchListParams, employee.idUsuario)
      const detailRecords = punches.map((p) =>
        ttkListRowToExportRecord(p, labels, {
          includePaymentType,
          includedErrorTypes,
          includeCorrected,
          errorTypeNames,
        }),
      )
      const { headers: detailHeaders, rows: detailRows } = recordsToMatrix(
        detailRecords.length > 0
          ? detailRecords
          : [{ [labels.employee]: employee.nombreEmployee }],
      )

      const detailWs = workbook.addWorksheet(sheetName)
      const detailTitle =
        labels.exportDetailSheetTitle?.replace('{name}', employee.nombreEmployee) ??
        employee.nombreEmployee
      // Sello corto: la hoja tiene que sobrevivir a que alguien la copie sola.
      const detailHeaderRow = applyTitleRow(
        detailWs,
        detailTitle,
        Math.max(detailHeaders.length, 1),
        [
          `${punches.length} punches`,
          buildStamp(labels, reportInfo, generatedAt, groupedParamsBase),
        ].join(' · '),
      )

      const detailErrorCol = detailHeaders.indexOf(labels.hasError) + 1
      writeStyledDataRows(detailWs, detailHeaders, detailRows, {
        headerRow: detailHeaderRow,
        errorColIndex: detailErrorCol > 0 ? detailErrorCol : undefined,
        yesLabel: labels.yes,
      })
    }
  }

  writeReportInfoSheet(
    workbook,
    labels.reportInfo.sheet,
    labels.reportInfo.sheet,
    { field: labels.reportInfo.field, value: labels.reportInfo.value },
    buildReportInfoRows(labels, reportInfo, generatedAt, groupedParamsBase, groupedRows.length),
  )

  // Filename en formato US: el ISO de toISOString() mezclaba convenciones y
  // además usaba la fecha UTC, que de noche cae en el día siguiente.
  await downloadExcelWorkbook(workbook, `${fileName}-${todayUsForFilename()}.xlsx`)

  return groupedRows.length
}
