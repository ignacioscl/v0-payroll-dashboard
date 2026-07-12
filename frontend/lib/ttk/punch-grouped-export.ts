import ExcelJS from 'exceljs'
import { fetchPunchGrouped } from '@/lib/srs-kpis-api'
import type { PunchGroupedQueryParams } from '@/lib/ttk/punch-grouped-filters'
import type { PunchGroupedRow } from '@/lib/ttk/punch-grouped-types'
import { srsProxyUrl } from '@/lib/srs-proxy-url'
import { throwIfSrsFail } from '@/lib/srs/parse-srs-response'
import type { TtkListResponse, TtkListRow } from '@/lib/ttk/ttk-list-types'
import { ttkListRowToExportRecord, type TtkListExportLabels } from '@/lib/ttk/ttk-list-export-rows'
import { SrsPhpPath } from '@/types/enum-url'
import {
  applyTitleRow,
  downloadExcelWorkbook,
  writeStyledDataRows,
} from '@/lib/excel/srs-xlsx-theme'

export type PunchGroupedExportLabels = TtkListExportLabels & {
  groupedSheet: string
  totalHours: string
  exportingProgress: string
  exportSheetTitle?: string
  exportSheetSubtitle?: string
  exportDetailSheetTitle?: string
}

export type PunchGroupedExportMode = 'grouped' | 'detail'

export type PunchGroupedExportScope = 'all' | 'selected'

export type PunchGroupedExportInput = {
  mode: PunchGroupedExportMode
  scope?: PunchGroupedExportScope
  /** When scope is `selected`, export only these employee ids. */
  employeeIds?: number[]
  groupedParamsBase: Omit<PunchGroupedQueryParams, 'page' | 'pageSize'>
  ttkListExtra: Record<string, string | number>
  includePaymentType: boolean
  labels: PunchGroupedExportLabels
  fileName: string
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
): string[] {
  return [
    labels.employee,
    labels.totalHours,
    labels.timeBreak,
    labels.hasError,
    ...paymentTypeLabels,
  ]
}

function buildGroupedDataRow(
  row: PunchGroupedRow,
  paymentTypeLabels: string[],
  labels: PunchGroupedExportLabels,
): (string | number)[] {
  return [
    row.nombreEmployee,
    Math.round(row.hoursNumber * 100) / 100,
    Math.round(row.breakNumber * 100) / 100,
    row.hasError ? labels.yes : labels.no,
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
  while (true) {
    const res = await fetchPunchGrouped({ ...base, page, pageSize: EXPORT_PAGE_SIZE })
    collected.push(...res.results)
    if (!res.hasMore) break
    page++
  }
  return collected
}

async function fetchTtkListPage(
  params: Record<string, string | number>,
): Promise<TtkListResponse> {
  const url = srsProxyUrl(SrsPhpPath.TTK_LIST, params)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`ttk-list (${res.status})`)
  }
  const data = (await res.json()) as TtkListResponse
  throwIfSrsFail(data, 'Failed to load punches')
  return data
}

async function fetchAllPunchesForEmployee(
  baseExtra: Record<string, string | number>,
  employeeId: number,
): Promise<TtkListRow[]> {
  const collected: TtkListRow[] = []
  let pageIndex = 0
  let total = 0

  do {
    const params: Record<string, string | number> = {
      ...baseExtra,
      id_employee: employeeId,
      'search[value]': '',
      draw: pageIndex + 1,
      start: pageIndex * EXPORT_PAGE_SIZE,
      length: EXPORT_PAGE_SIZE,
      order_by: 'tew.punch_in DESC',
    }
    const data = await fetchTtkListPage(params)
    const batch = data.data ?? []
    collected.push(...batch)
    total = Number(data.recordsFiltered ?? data.recordsTotal ?? 0)
    pageIndex++
    if (batch.length === 0) break
  } while (collected.length < total)

  return collected
}

function buildGroupedSubtitle(
  labels: PunchGroupedExportLabels,
  count: number,
  fechaDesde?: string,
  fechaHasta?: string,
): string {
  const period =
    fechaDesde && fechaHasta ? `${fechaDesde} → ${fechaHasta}` : undefined
  const countLabel = labels.exportSheetSubtitle?.replace('{count}', String(count)) ?? `${count}`
  const parts = [period, countLabel].filter(Boolean)
  return parts.join(' · ')
}

export async function exportPunchGroupedXlsx(input: PunchGroupedExportInput): Promise<number> {
  const {
    mode,
    scope = 'all',
    employeeIds,
    groupedParamsBase,
    ttkListExtra,
    includePaymentType,
    labels,
    fileName,
    onProgress,
  } = input

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
  const headers = buildGroupedHeaders(paymentTypeLabels, labels)
  const dataRows = groupedRows.map((r) => buildGroupedDataRow(r, paymentTypeLabels, labels))

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'SRS Payroll Dashboard'
  workbook.created = new Date()

  const mainSheetName = sanitizeExcelSheetName(labels.groupedSheet, new Set())
  const mainWs = workbook.addWorksheet(mainSheetName, {
    views: [{ showGridLines: true }],
  })

  const title =
    labels.exportSheetTitle ??
    `${labels.groupedSheet} — ${groupedParamsBase.fechaDesde ?? ''} / ${groupedParamsBase.fechaHasta ?? ''}`
  const subtitle = buildGroupedSubtitle(
    labels,
    groupedRows.length,
    groupedParamsBase.fechaDesde,
    groupedParamsBase.fechaHasta,
  )
  const headerRow = applyTitleRow(mainWs, title, headers.length, subtitle)

  const errorColIndex = headers.indexOf(labels.hasError) + 1
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

      const punches = await fetchAllPunchesForEmployee(ttkListExtra, employee.idUsuario)
      const detailRecords = punches.map((p) =>
        ttkListRowToExportRecord(p, labels, { includePaymentType }),
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
      const detailHeaderRow = applyTitleRow(
        detailWs,
        detailTitle,
        Math.max(detailHeaders.length, 1),
        `${punches.length} punches`,
      )

      const detailErrorCol = detailHeaders.indexOf(labels.hasError) + 1
      writeStyledDataRows(detailWs, detailHeaders, detailRows, {
        headerRow: detailHeaderRow,
        errorColIndex: detailErrorCol > 0 ? detailErrorCol : undefined,
        yesLabel: labels.yes,
      })
    }
  }

  const stamp = new Date().toISOString().slice(0, 10)
  await downloadExcelWorkbook(workbook, `${fileName}-${stamp}.xlsx`)

  return groupedRows.length
}
