/**
 * Reports › Open Invoices — the pure rules of the report, each in one place (T3 of
 * plans/plan-reporte-javier/PLAN.md, §3.3 and §3.4). No SQL here: the screen, the Excel and the
 * snapshot all go through these functions, so they always agree.
 */
import { addDays, todayInZone, weekdayMondayZero } from '../payroll/snapshot/payroll-dates'
import { centsToMoney, moneyToCents } from '../shared/kpi/srs-kpi-row-money'

/** The business time zone: «Generated» of the Excel and the end of the days. */
export const OPEN_INVOICES_TIME_ZONE = 'America/New_York'

/** Payment term when the dealer has no «Payment Due On», or one shorter than the first column (§3.3). */
export const OPEN_INVOICES_DEFAULT_TERM_DAYS = 15

export type OpenInvoiceBucket = 'current' | 'd15' | 'd30' | 'd60' | 'd90'

export const OPEN_INVOICE_BUCKETS: readonly OpenInvoiceBucket[] = ['current', 'd15', 'd30', 'd60', 'd90']

/**
 * Calendar days from `startYmd` to `endYmd` (both `YYYY-MM-DD`, compared by their components, never
 * through a time zone), never negative. Same day = 0. Shared with DAYS OLD of the «Invoice» Excel.
 */
export function daysBetweenYmd(startYmd: string, endYmd: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(startYmd ?? '')
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(endYmd ?? '')
  if (!a || !b) return 0
  const start = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]))
  const end = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
  return Math.max(0, Math.round((end - start) / 86_400_000))
}

/**
 * Where the days of an invoice start (§3.3, cartel line 3): TTK (5) and Generic (6) with DATE TO →
 * DATE TO; everything else → the day the invoice was created.
 */
export function openInvoiceDaysStart(
  statementType: number,
  createdYmd: string,
  dateToYmd: string | null | undefined,
): string {
  if ((statementType === 5 || statementType === 6) && dateToYmd) return dateToYmd
  return createdYmd
}

/** The dealer's term (§3.5, P1 = B): its «Payment Due On»; empty, 0 or under 15 → 15 (cartel line 5). */
export function openInvoiceTermDays(dueOn: number | null | undefined): number {
  const n = Number(dueOn ?? 0)
  return Number.isFinite(n) && n >= OPEN_INVOICES_DEFAULT_TERM_DAYS ? n : OPEN_INVOICES_DEFAULT_TERM_DAYS
}

/**
 * The column of an invoice (§3.3, cartel line 4): under its term → Current; from there, by age:
 * 15–29 → 15+, 30–59 → 30+, 60–89 → 60+, 90 or more → 90+. The term only moves the end of Current:
 * with a term of 30, the 15+ column stays empty for that dealer.
 */
export function openInvoiceBucket(days: number, termDays: number): OpenInvoiceBucket {
  if (days < termDays) return 'current'
  if (days >= 90) return 'd90'
  if (days >= 60) return 'd60'
  if (days >= 30) return 'd30'
  if (days >= 15) return 'd15'
  return 'current'
}

/** Today in New York (`YYYY-MM-DD`): the day the report runs, the end of the days. */
export function openInvoicesToday(now: Date = new Date()): string {
  return todayInZone(OPEN_INVOICES_TIME_ZONE, now)
}

/** The last Sunday on or before today in New York: the default «As of». */
export function lastSundayYmd(now: Date = new Date()): string {
  const today = openInvoicesToday(now)
  // weekdayMondayZero: Monday 0 … Sunday 6.
  const back = (weekdayMondayZero(today) + 1) % 7
  return addDays(today, -back)
}

export function isSundayYmd(ymd: string): boolean {
  return weekdayMondayZero(ymd) === 6
}

/** Texts of the department column (§3.4). Approved word by word (P5, 10/28/2026). */
export type OpenInvoiceDepartmentLabels = {
  /** «Timesheets»: TTK and Generic invoices without department. */
  ttkDepartment: string
  /** «No department» for a Work Order invoice without one (the text of Due On Billing). */
  noDepartment: string
  /** «Generic»: free lines of a Generic invoice. */
  genericPosition: string
  /** «No position»: a punch without position. */
  noPosition: string
}

/**
 * The department of a row of an invoice: its department; a TTK or Generic one without department
 * says «Timesheets»; a WO one without department says `labels.noDepartment` (the «Invoice» Excel
 * passes '', as it did before).
 */
export function statementDepartmentLabel(
  name: string | null | undefined,
  statementType: number,
  labels: Pick<OpenInvoiceDepartmentLabels, 'ttkDepartment' | 'noDepartment'>,
): string {
  if (name) return name
  return statementType === 5 || statementType === 6 ? labels.ttkDepartment : labels.noDepartment
}

/**
 * Key of the position of a Timesheets row, from the SQL (§4.2, T2.3): null when the row is not split
 * by position (it has a department, or it is a WO); 'G' a free line of a Generic invoice; 'P:<role>'
 * a punch with its position the day it punched ('P:' = no position).
 */
export type OpenInvoicePuestoKey = string | null

/**
 * Department of a row of Open Invoices (cartel line 6, v6): statementDepartmentLabel and, for TTK and
 * Generic rows split by position, « · » and the position: 'G' → Generic, 'P:' → No position,
 * 'P:Valet' → Valet. The screen, the Excel and the snapshot all use it.
 */
export function openInvoiceDepartmentLabel(
  name: string | null | undefined,
  statementType: number,
  puestoKey: OpenInvoicePuestoKey,
  labels: OpenInvoiceDepartmentLabels,
): string {
  const base = statementDepartmentLabel(name, statementType, labels)
  if (puestoKey == null) return base
  if (puestoKey === 'G') return `${base} · ${labels.genericPosition}`
  const role = puestoKey.startsWith('P:') ? puestoKey.slice(2).trim() : puestoKey.trim()
  return `${base} · ${role || labels.noPosition}`
}

/**
 * The same row as a key that does not depend on the language (for the comparison: a snapshot exported
 * in Spanish compared in English is not a department change).
 */
export function openInvoiceDepartmentKey(deptId: number, puestoKey: OpenInvoicePuestoKey): string {
  if (puestoKey != null) return `t:${puestoKey === 'G' ? 'G' : `P:${puestoKey.startsWith('P:') ? puestoKey.slice(2).trim() : puestoKey.trim()}`}`
  return deptId > 0 ? `d:${deptId}` : 'n'
}

/** One row of an invoice as the SQL returns it (one per invoice × department × position). */
export type OpenInvoiceSqlRow = {
  sid: number
  fullNro: string
  dealerId: number
  statementType: number
  /** `YYYY-MM-DD` of fecha_create. */
  createdYmd: string
  dateFromYmd: string | null
  dateToYmd: string | null
  deptId: number
  deptName: string | null
  puestoKey: OpenInvoicePuestoKey
  services: string
  /** Open amount of the row, rounded to cents by the SQL. */
  amount: number
}

/** A row of the Invoices sheet (and of the snapshot): the SQL row plus its days, term and column. */
export type OpenInvoiceRow = OpenInvoiceSqlRow & {
  department: string
  departmentKey: string
  days: number
  termDays: number
  bucket: OpenInvoiceBucket
}

export type OpenInvoiceBucketCents = Record<OpenInvoiceBucket, number>

/** A row of the Summary (dealer × department), in money. */
export type OpenInvoiceSummaryRow = {
  dealerId: number
  department: string
  current: number
  d15: number
  d30: number
  d60: number
  d90: number
  total: number
}

export type OpenInvoiceTotals = Omit<OpenInvoiceSummaryRow, 'dealerId' | 'department'>

/** Adds days, term, column and the department label to each SQL row (§3.3, §3.4). */
export function buildOpenInvoiceRows(
  sqlRows: readonly OpenInvoiceSqlRow[],
  termByDealer: ReadonlyMap<number, number | null>,
  todayYmd: string,
  labels: OpenInvoiceDepartmentLabels,
): OpenInvoiceRow[] {
  return sqlRows.map((r) => {
    const days = daysBetweenYmd(openInvoiceDaysStart(r.statementType, r.createdYmd, r.dateToYmd), todayYmd)
    const termDays = openInvoiceTermDays(termByDealer.get(r.dealerId))
    return {
      ...r,
      department: openInvoiceDepartmentLabel(r.deptName, r.statementType, r.puestoKey, labels),
      departmentKey: openInvoiceDepartmentKey(r.deptId, r.puestoKey),
      days,
      termDays,
      bucket: openInvoiceBucket(days, termDays),
    }
  })
}

function emptyCents(): OpenInvoiceBucketCents {
  return { current: 0, d15: 0, d30: 0, d60: 0, d90: 0 }
}

function toMoneyRow(c: OpenInvoiceBucketCents): OpenInvoiceTotals {
  const total = c.current + c.d15 + c.d30 + c.d60 + c.d90
  return {
    current: centsToMoney(c.current),
    d15: centsToMoney(c.d15),
    d30: centsToMoney(c.d30),
    d60: centsToMoney(c.d60),
    d90: centsToMoney(c.d90),
    total: centsToMoney(total),
  }
}

/**
 * Summary dealer × department, summing in cents (each row once to cents, then added). Rows that add
 * up to $0 are dropped (§1.2). Order: dealer name, then department.
 */
export function summarizeOpenInvoices(
  rows: readonly OpenInvoiceRow[],
  dealerName: (dealerId: number) => string,
): { rows: OpenInvoiceSummaryRow[]; totals: OpenInvoiceTotals } {
  const groups = new Map<string, { dealerId: number; department: string; cents: OpenInvoiceBucketCents }>()
  const all = emptyCents()
  for (const r of rows) {
    const key = `${r.dealerId}|${r.department}`
    let g = groups.get(key)
    if (!g) {
      g = { dealerId: r.dealerId, department: r.department, cents: emptyCents() }
      groups.set(key, g)
    }
    const c = moneyToCents(r.amount)
    g.cents[r.bucket] += c
    all[r.bucket] += c
  }
  const out = [...groups.values()]
    .map((g) => ({ dealerId: g.dealerId, department: g.department, ...toMoneyRow(g.cents) }))
    .filter((r) => moneyToCents(r.total) !== 0)
    .sort(
      (a, b) =>
        dealerName(a.dealerId).localeCompare(dealerName(b.dealerId)) ||
        a.dealerId - b.dealerId ||
        a.department.localeCompare(b.department),
    )
  return { rows: out, totals: toMoneyRow(all) }
}

/** Order of the Invoices sheet: dealer, invoice, department. */
export function sortOpenInvoiceRows(
  rows: readonly OpenInvoiceRow[],
  dealerName: (dealerId: number) => string,
): OpenInvoiceRow[] {
  return [...rows].sort(
    (a, b) =>
      dealerName(a.dealerId).localeCompare(dealerName(b.dealerId)) ||
      a.dealerId - b.dealerId ||
      a.fullNro.localeCompare(b.fullNro, undefined, { numeric: true }) ||
      a.sid - b.sid ||
      a.department.localeCompare(b.department),
  )
}
