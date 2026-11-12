import type ExcelJS from 'exceljs'
import {
  applyHeaderRow,
  applyTitleRow,
  autoFitColumns,
  downloadExcelWorkbook,
  SRS_XLSX_THEME,
  thinBorder,
  writeReportInfoSheet,
  writeStyledDataRows,
  type ReportInfoRow,
} from '@/lib/excel/srs-xlsx-theme'
import { formatUsDateTimeForExport, todayUsForFilename } from '@/lib/format-us-datetime'
import type {
  IncomeByDealer,
  IncomeByDealerYear,
  IncomeServicesByDealer,
  IncomeServicesDealer,
  IncomeVehicleRow,
  KpiQueryParams,
} from '@/lib/srs-kpis-api'

/**
 * «By dealer and service» of the Export of Income by Dealer (plans/plan-income-by-dealer-por-servicio §5.3 and T4). The
 * file of today («Income by dealer», income-by-dealer-export.ts) does not change. Same sheets as the Excel GC approved
 * (plans/plan-excel-gc-por-servicio/scripts/excel-gc.ts), with the filters of the screen.
 */

const MONEY_FMT = '#,##0.00'
const INT_FMT = '#,##0'
const QTY_DECIMALS_FMT = '#,##0.0#'

const toCents = (n: number) => Math.round(n * 100)

/** One year of the file: the dealers of the screen, in its order, each with its services. */
export type IncomeServicesExportYear = {
  year: IncomeByDealerYear
  dealers: IncomeServicesDealer[]
  vehiclesList: IncomeVehicleRow[]
  woQty: number
  /** Different VINs of the year: a vehicle that went through two dealers counts once. */
  vehicles: number
  woIncome: number
  otherIncome: number
  income: number
}

function emptyDealer(dealerId: number, dealer: string): IncomeServicesDealer {
  return {
    dealerId,
    dealer,
    income: 0,
    wo: { qty: 0, vehicles: 0, income: 0, services: [] },
    generic: { income: 0, lines: [] },
    ttk: { income: 0, lines: [] },
  }
}

/**
 * Asks the services one dealer and one year at a time, one after the other (§8: a request of every dealer of a big
 * company takes minutes and the pool is small), and checks each dealer to the cent against its row of the screen.
 * Without `includeRemovedDealers`: with it, the request of one dealer would also bring every removed one (T3).
 */
export async function collectIncomeServices(
  data: IncomeByDealer,
  base: Pick<KpiQueryParams, 'filterDateDone'>,
  fetchOne: (params: KpiQueryParams) => Promise<IncomeServicesByDealer>,
): Promise<IncomeServicesExportYear[]> {
  const out: IncomeServicesExportYear[] = []
  const mismatches: string[] = []
  for (const year of data.years) {
    const dealers: IncomeServicesDealer[] = []
    const vehiclesList: IncomeVehicleRow[] = []
    for (const row of year.dealers) {
      const res = await fetchOne({
        fechaDesde: year.fechaDesde,
        fechaHasta: year.fechaHasta,
        idDealer: String(row.dealerId),
        filterDateDone: base.filterDateDone,
        withVehicles: true,
      })
      const y = res.years[0]
      const d = y?.dealers.find((x) => x.dealerId === row.dealerId) ?? emptyDealer(row.dealerId, row.dealer)
      if (toCents(d.income) !== toCents(row.income)) {
        mismatches.push(`${year.year} · ${row.dealer} (${row.dealerId}): services ${d.income} vs screen ${row.income}`)
      }
      // The name of the screen (the same function on the backend).
      dealers.push({ ...d, dealer: row.dealer })
      vehiclesList.push(...(y?.vehiclesList ?? []).filter((v) => v.dealerId === row.dealerId).map((v) => ({ ...v, dealer: row.dealer })))
    }
    out.push(summarizeYear(year, dealers, vehiclesList))
  }
  if (mismatches.length > 0) {
    throw new Error(`Income by dealer and service does not match the screen: ${mismatches.join('; ')}`)
  }
  return out
}

/** Totals of a year, in cents; Vehicles = different VINs of the union of the dealers. */
export function summarizeYear(
  year: IncomeByDealerYear,
  dealers: IncomeServicesDealer[],
  vehiclesList: IncomeVehicleRow[],
): IncomeServicesExportYear {
  const sum = (f: (d: IncomeServicesDealer) => number) => dealers.reduce((a, d) => a + toCents(f(d)), 0) / 100
  const woIncome = sum((d) => d.wo.income)
  const otherIncome = sum((d) => d.generic.income + d.ttk.income)
  return {
    year,
    dealers,
    vehiclesList,
    woQty: sum((d) => d.wo.qty),
    vehicles: new Set(vehiclesList.map((v) => v.vin)).size,
    woIncome,
    otherIncome,
    income: sum((d) => d.income),
  }
}

/** "NewCarDetail, Cilajet ×2" */
export function vehicleServicesText(services: { service: string; qty: number }[]): string {
  return services.map((s) => (s.qty > 1 ? `${s.service} ×${s.qty}` : s.service)).join(', ')
}

export type IncomeServicesExportLabels = {
  fileName: string
  reportInfoSheet: string
  summarySheet: string
  vehiclesSheet: string
  title: string
  field: string
  value: string
  generated: string
  dealer: string
  total: string
  grandTotal: string
  removedSuffix: string
  includesRemovedDealers: string
  sectionWo: string
  sectionGeneric: string
  sectionTtk: string
  service: string
  description: string
  employee: string
  qty: string
  vehicles: string
  income: string
  totalWo: string
  totalGeneric: string
  totalTtk: string
  /** "Total {dealer}" already applied. */
  totalDealer: (dealer: string) => string
  woQty: string
  woIncome: string
  otherIncome: string
  period: string
  vin: string
  make: string
  model: string
  carYear: string
  services: string
  yearLabel: (year: IncomeByDealerYear) => string
  yearRange: (year: IncomeByDealerYear) => string
}

export type IncomeServicesExportInput = {
  years: IncomeServicesExportYear[]
  labels: IncomeServicesExportLabels
  /** Report Info: the rows of today's file plus how each number is counted (§5.4). */
  reportInfo: ReportInfoRow[]
  generatedBy: string
  removedIds?: ReadonlySet<number>
  removedNames?: string[]
}

function moneyCell(cell: ExcelJS.Cell, value: number, bold = false) {
  cell.value = value
  cell.numFmt = MONEY_FMT
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  cell.border = thinBorder()
  if (bold) cell.font = { bold: true }
}

function qtyCell(cell: ExcelJS.Cell, value: number | null, bold = false) {
  cell.value = value
  cell.numFmt = value !== null && !Number.isInteger(value) ? QTY_DECIMALS_FMT : INT_FMT
  cell.alignment = { vertical: 'middle', horizontal: 'right' }
  cell.border = thinBorder()
  if (bold) cell.font = { bold: true }
}

function textCell(cell: ExcelJS.Cell, value: string, bold = false) {
  cell.value = value
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
  cell.border = thinBorder()
  if (bold) cell.font = { bold: true }
}

function fillRow(row: ExcelJS.Row, colCount: number, argb: string) {
  for (let c = 1; c <= colCount; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

/** Excel sheet names: up to 31 characters, without : \ / ? * [ ]. */
function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)
}

/**
 * Arma el libro. Recibe `exceljs` ya cargado (`Excel`): la pantalla lo carga recién al exportar
 * (plans/plan-buenas-practicas-v0, 1.6) y el test lo importa directo.
 */
export function buildIncomeServicesWorkbook(
  Excel: typeof ExcelJS,
  input: IncomeServicesExportInput,
  generatedAt = new Date(),
): ExcelJS.Workbook {
  const { years, labels, reportInfo, generatedBy, removedIds, removedNames = [] } = input
  const stamp = `${labels.generated} ${formatUsDateTimeForExport(generatedAt.toISOString())} · ${generatedBy} · ${labels.title}`
  const dealerName = (d: IncomeServicesDealer) =>
    removedIds?.has(d.dealerId) ? `${d.dealer} ${labels.removedSuffix}` : d.dealer

  const workbook = new Excel.Workbook()
  workbook.creator = 'SRS Payroll Dashboard'
  workbook.created = generatedAt

  // Summary: one block per year, one row per dealer; Total of the year; Grand Total with amounts only.
  const SC = 6
  const sum = workbook.addWorksheet(sheetName(labels.summarySheet), { views: [{ showGridLines: true }] })
  let s = applyTitleRow(sum, labels.title, SC, stamp)
  for (const y of years) {
    textCell(sum.getCell(s, 1), `${labels.yearLabel(y.year)} · ${labels.yearRange(y.year)}`, true)
    sum.mergeCells(s, 1, s, SC)
    s += 1
    ;[labels.dealer, labels.woQty, labels.vehicles, labels.woIncome, labels.otherIncome, labels.income].forEach(
      (h, i) => (sum.getCell(s, i + 1).value = h),
    )
    applyHeaderRow(sum, s, SC)
    s += 1
    for (const d of y.dealers) {
      textCell(sum.getCell(s, 1), dealerName(d))
      qtyCell(sum.getCell(s, 2), d.wo.qty)
      qtyCell(sum.getCell(s, 3), d.wo.vehicles)
      moneyCell(sum.getCell(s, 4), d.wo.income)
      moneyCell(sum.getCell(s, 5), (toCents(d.generic.income) + toCents(d.ttk.income)) / 100)
      moneyCell(sum.getCell(s, 6), d.income)
      s += 1
    }
    const tr = sum.getRow(s)
    textCell(tr.getCell(1), `${labels.total} ${labels.yearLabel(y.year)}`, true)
    qtyCell(tr.getCell(2), y.woQty, true)
    qtyCell(tr.getCell(3), y.vehicles, true)
    moneyCell(tr.getCell(4), y.woIncome, true)
    moneyCell(tr.getCell(5), y.otherIncome, true)
    moneyCell(tr.getCell(6), y.income, true)
    fillRow(tr, SC, SRS_XLSX_THEME.titleBg)
    s += 2
  }
  const grandCents = (f: (y: IncomeServicesExportYear) => number) => years.reduce((a, y) => a + toCents(f(y)), 0) / 100
  const gr = sum.getRow(s)
  // WO Qty and Vehicles stay empty: a vehicle that came in two years would count twice.
  textCell(gr.getCell(1), labels.grandTotal, true)
  textCell(gr.getCell(2), '')
  textCell(gr.getCell(3), '')
  moneyCell(gr.getCell(4), grandCents((y) => y.woIncome), true)
  moneyCell(gr.getCell(5), grandCents((y) => y.otherIncome), true)
  moneyCell(gr.getCell(6), grandCents((y) => y.income), true)
  fillRow(gr, SC, SRS_XLSX_THEME.titleBg)
  if (removedNames.length > 0) {
    s += 1
    sum.getCell(s, 1).value = `${labels.includesRemovedDealers}: ${removedNames.join(', ')}`
    sum.getCell(s, 1).font = { italic: true }
  }
  autoFitColumns(sum, SC, 3, s)
  for (const c of [4, 5, 6]) sum.getColumn(c).width = Math.max(sum.getColumn(c).width ?? 0, 18)

  // One sheet per year: each dealer with its sections and «Total ‹dealer›».
  for (const y of years) {
    const ws = workbook.addWorksheet(sheetName(labels.yearLabel(y.year)), { views: [{ showGridLines: true }] })
    let r = applyTitleRow(ws, `${labels.title} · ${labels.yearLabel(y.year)}`, 4, `${labels.yearRange(y.year)} · ${stamp}`)
    const section = (title: string, cols: string[]) => {
      textCell(ws.getCell(r, 1), title, true)
      r += 1
      cols.forEach((h, i) => (ws.getCell(r, i + 1).value = h))
      applyHeaderRow(ws, r, 4)
      r += 1
    }
    const totalRow = (label: string, qty: number | null, vehicles: number | null, income: number) => {
      const tr = ws.getRow(r)
      textCell(tr.getCell(1), label, true)
      if (qty === null) textCell(tr.getCell(2), '')
      else qtyCell(tr.getCell(2), qty, true)
      if (vehicles === null) textCell(tr.getCell(3), '')
      else qtyCell(tr.getCell(3), vehicles, true)
      moneyCell(tr.getCell(4), income, true)
      fillRow(tr, 4, SRS_XLSX_THEME.titleBg)
      r += 2
    }
    for (const d of y.dealers) {
      const titleRow = ws.getRow(r)
      textCell(titleRow.getCell(1), dealerName(d), true)
      ws.mergeCells(r, 1, r, 4)
      titleRow.getCell(1).font = { bold: true, size: 12, color: { argb: SRS_XLSX_THEME.titleFg } }
      r += 1
      if (d.wo.services.length > 0) {
        section(labels.sectionWo, [labels.service, labels.qty, labels.vehicles, labels.income])
        for (const x of d.wo.services) {
          textCell(ws.getCell(r, 1), x.service)
          qtyCell(ws.getCell(r, 2), x.qty)
          qtyCell(ws.getCell(r, 3), x.vehicles)
          moneyCell(ws.getCell(r, 4), x.income)
          r += 1
        }
        totalRow(labels.totalWo, d.wo.qty, d.wo.vehicles, d.wo.income)
      }
      if (d.generic.lines.length > 0) {
        section(labels.sectionGeneric, [labels.description, labels.qty, '', labels.income])
        for (const g of d.generic.lines) {
          textCell(ws.getCell(r, 1), g.description)
          if (g.qty === null) textCell(ws.getCell(r, 2), '')
          else qtyCell(ws.getCell(r, 2), g.qty)
          textCell(ws.getCell(r, 3), '')
          moneyCell(ws.getCell(r, 4), g.income)
          r += 1
        }
        totalRow(labels.totalGeneric, null, null, d.generic.income)
      }
      if (d.ttk.lines.length > 0) {
        section(labels.sectionTtk, [labels.employee, '', '', labels.income])
        for (const l of d.ttk.lines) {
          textCell(ws.getCell(r, 1), l.employee)
          textCell(ws.getCell(r, 2), '')
          textCell(ws.getCell(r, 3), '')
          moneyCell(ws.getCell(r, 4), l.income)
          r += 1
        }
        totalRow(labels.totalTtk, null, null, d.ttk.income)
      }
      const tr = ws.getRow(r)
      textCell(tr.getCell(1), labels.totalDealer(dealerName(d)), true)
      textCell(tr.getCell(2), '')
      textCell(tr.getCell(3), '')
      moneyCell(tr.getCell(4), d.income, true)
      for (let c = 1; c <= 4; c++) {
        tr.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SRS_XLSX_THEME.headerBg } }
        tr.getCell(c).font = { bold: true, color: { argb: SRS_XLSX_THEME.headerFg } }
      }
      r += 3
    }
    autoFitColumns(ws, 4, 3, r)
    ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 0, 34)
    for (const c of [2, 3]) ws.getColumn(c).width = 12
    ws.getColumn(4).width = 18
  }

  // Vehicles: one row per vehicle (VIN) and dealer in each year, with its services.
  const vh = workbook.addWorksheet(sheetName(labels.vehiclesSheet), { views: [{ showGridLines: true }] })
  const vRow = applyTitleRow(vh, `${labels.title} · ${labels.vehiclesSheet}`, 9, stamp)
  const vData: (string | number)[][] = []
  for (const y of years) {
    for (const v of y.vehiclesList) {
      vData.push([
        labels.yearLabel(y.year),
        removedIds?.has(v.dealerId) ? `${v.dealer} ${labels.removedSuffix}` : v.dealer,
        v.vin,
        v.make,
        v.model,
        v.carYear ?? '',
        vehicleServicesText(v.services),
        v.qty,
        v.income,
      ])
    }
  }
  writeStyledDataRows(
    vh,
    [labels.period, labels.dealer, labels.vin, labels.make, labels.model, labels.carYear, labels.services, labels.qty, labels.income],
    vData,
    { headerRow: vRow, numericColIndexes: new Set([8]) },
  )
  for (let i = 0; i < vData.length; i++) {
    const qty = vData[i][7] as number
    vh.getCell(vRow + 1 + i, 8).numFmt = Number.isInteger(qty) ? INT_FMT : QTY_DECIMALS_FMT
    vh.getCell(vRow + 1 + i, 9).numFmt = MONEY_FMT
  }
  vh.getColumn(7).width = 60

  writeReportInfoSheet(
    workbook,
    labels.reportInfoSheet,
    labels.reportInfoSheet,
    { field: labels.field, value: labels.value },
    [{ field: labels.generated, value: formatUsDateTimeForExport(generatedAt.toISOString()) }, ...reportInfo],
  )
  return workbook
}

export async function exportIncomeServicesXlsx(input: IncomeServicesExportInput): Promise<void> {
  const Excel = (await import('exceljs')).default
  const workbook = buildIncomeServicesWorkbook(Excel, input)
  await downloadExcelWorkbook(workbook, `${input.labels.fileName}-${todayUsForFilename()}.xlsx`)
}
