/**
 * Comparison of an Open Invoices snapshot with today (T7 of plans/plan-reporte-javier/PLAN.md, §1.5 and
 * §3.6). Pure: no SQL. The facts that only the database knows (deleted invoice, payments, creation
 * date) come in `facts`, from the reasons query, only for the invoices that changed.
 */
import type { OpenInvoiceSnapshotRow } from '../../features/open-invoice-snapshot/dto/open-invoice-snapshot.dto'
import type { OpenInvoiceBucket } from './open-invoice-aging'
import type { OpenInvoiceReasonTexts } from './open-invoices-export-labels'

/** Same shape for the snapshot rows and today's rows. */
export type CompareInputRow = Pick<
  OpenInvoiceSnapshotRow,
  'sid' | 'fullNro' | 'dealerId' | 'department' | 'departmentKey' | 'days' | 'termDays' | 'bucket' | 'amount'
> & { createdYmd?: string }

export type CompareSide = { amount: number; bucket: OpenInvoiceBucket | null }

/** One invoice that changed, before its reasons. */
export type CompareChangedInvoice = {
  sid: number
  fullNro: string
  dealerId: number
  /** The department(s) of the invoice: today's when it is open today, else the snapshot's. */
  department: string
  snapshot: CompareSide | null
  today: CompareSide | null
  /** today − snapshot, in cents. */
  differenceCents: number
  /** Facts of the data (reasons 5, 6 and 7 of §3.6). */
  termChange: { from: number; to: number } | null
  daysPassed: number | null
  departmentChanged: boolean
}

type InvoiceAgg = {
  sid: number
  fullNro: string
  dealerId: number
  cents: number
  /** departmentKey → cents, to know if the money moved between departments. */
  byDept: Map<string, number>
  departments: string[]
  buckets: Set<OpenInvoiceBucket>
  days: number
  termDays: number
}

function aggregate(rows: readonly CompareInputRow[]): Map<number, InvoiceAgg> {
  const out = new Map<number, InvoiceAgg>()
  for (const r of rows) {
    let a = out.get(r.sid)
    if (!a) {
      a = { sid: r.sid, fullNro: r.fullNro, dealerId: r.dealerId, cents: 0, byDept: new Map(), departments: [], buckets: new Set(), days: r.days, termDays: r.termDays }
      out.set(r.sid, a)
    }
    const c = Math.round(Number(r.amount) * 100)
    a.cents += c
    a.byDept.set(r.departmentKey, (a.byDept.get(r.departmentKey) ?? 0) + c)
    if (!a.departments.includes(r.department)) a.departments.push(r.department)
    a.buckets.add(r.bucket)
    a.days = Math.max(a.days, r.days)
    a.termDays = r.termDays
  }
  return out
}

/** The column of an invoice: every row of an invoice falls in the same one (same days, same term). */
function bucketOf(a: InvoiceAgg | undefined): OpenInvoiceBucket | null {
  if (!a) return null
  return [...a.buckets][0] ?? null
}

function sameDeptSplit(a: InvoiceAgg, b: InvoiceAgg): boolean {
  const keys = new Set([...a.byDept.keys(), ...b.byDept.keys()])
  for (const k of keys) if ((a.byDept.get(k) ?? 0) !== (b.byDept.get(k) ?? 0)) return false
  return true
}

/**
 * Sums snapshot and today by invoice (`sid`) in cents and returns the invoices that changed: amount,
 * column or department (§3.6, step 4). An invoice equal on both sides does not come out.
 */
export function compareRows(
  snapshotRows: readonly CompareInputRow[],
  todayRows: readonly CompareInputRow[],
): CompareChangedInvoice[] {
  const before = aggregate(snapshotRows)
  const now = aggregate(todayRows)
  const sids = [...new Set([...before.keys(), ...now.keys()])]
  const out: CompareChangedInvoice[] = []
  for (const sid of sids) {
    const a = before.get(sid)
    const b = now.get(sid)
    const aCents = a?.cents ?? 0
    const bCents = b?.cents ?? 0
    const aBucket = bucketOf(a)
    const bBucket = bucketOf(b)
    const deptMoved = !!a && !!b && aCents === bCents && !sameDeptSplit(a, b)
    if (a && b && aCents === bCents && aBucket === bBucket && !deptMoved) continue
    const ref = (b ?? a)!
    const termChange = a && b && a.termDays !== b.termDays ? { from: a.termDays, to: b.termDays } : null
    const daysPassed =
      a && b && aCents === bCents && aBucket !== bBucket && b.days > a.days ? b.days - a.days : null
    out.push({
      sid,
      fullNro: ref.fullNro,
      dealerId: ref.dealerId,
      department: ref.departments.join(', '),
      snapshot: a ? { amount: aCents / 100, bucket: aBucket } : null,
      today: b ? { amount: bCents / 100, bucket: bBucket } : null,
      differenceCents: bCents - aCents,
      termChange,
      daysPassed,
      departmentChanged: deptMoved,
    })
  }
  return out
}

/** What the reasons query says of an invoice (§3.6): its state, creation and its payments today. */
export type CompareInvoiceFacts = {
  estado: number | null
  /** `YYYY-MM-DD HH:MM:SS` as the connection returns it (server time, like legacy writes it). */
  fechaCreate: string | null
  payments: { idBilling: number; checkNumber: string; fechaAlta: string; estado: number }[]
}

/**
 * The reasons of an invoice that changed, in the order of §3.6; all that apply. 1 deleted; 2 a payment
 * active today that was not in the snapshot; 3 a payment of the snapshot deleted today; 4 created after
 * the snapshot (only for an invoice not in it); 5 term changed; 6 days passed; 7 department changed;
 * 8 none of the above.
 */
export function compareReasons(
  inv: CompareChangedInvoice,
  facts: CompareInvoiceFacts | undefined,
  snapshotPayments: readonly number[] | undefined,
  snapshotGeneratedAtUtc: string,
  texts: OpenInvoiceReasonTexts,
  formatDate: (ymd: string) => string,
  /** Every payment active in the snapshot, of any invoice: a deleted one of these was deleted after the snapshot. */
  snapshotAllPayments?: ReadonlySet<number>,
): string[] {
  const out: string[] = []
  // Reasons 2 and 3 only for an invoice the snapshot captured: one that was not in it (paid off or at $0 then) has no
  // payment list, and its payments may be older than the snapshot (CODE-review 2). Without proof, reason 8.
  const captured = snapshotPayments !== undefined
  const before = new Set(snapshotPayments ?? [])
  if (facts?.estado === 0) out.push(texts.deleted)
  if (captured) {
    for (const p of facts?.payments ?? []) {
      if (p.estado === 1 && !before.has(p.idBilling)) out.push(texts.paid(p.checkNumber, formatDate(p.fechaAlta)))
    }
    for (const p of facts?.payments ?? []) {
      if (p.estado === 0 && before.has(p.idBilling)) out.push(texts.paymentDeleted(p.checkNumber))
    }
  } else if (snapshotAllPayments) {
    // Not in the snapshot (paid off then) and owes again: if one of its payments was active in the snapshot (on another
    // invoice, same check) and is deleted today, it was deleted after the snapshot. Reason 2 stays out (CODE-review 2).
    for (const p of facts?.payments ?? []) {
      if (p.estado === 0 && snapshotAllPayments.has(p.idBilling)) out.push(texts.paymentDeleted(p.checkNumber))
    }
  }
  if (!inv.snapshot && facts?.fechaCreate && isAfterSnapshot(facts.fechaCreate, snapshotGeneratedAtUtc)) {
    out.push(texts.created(formatDate(facts.fechaCreate)))
  }
  if (inv.termChange) out.push(texts.termChanged(inv.termChange.from, inv.termChange.to))
  if (inv.daysPassed != null) out.push(texts.daysPassed(inv.daysPassed))
  if (inv.departmentChanged) out.push(texts.departmentChanged)
  if (out.length === 0) out.push(texts.unknown)
  return out
}

/**
 * `YYYY-MM-DD HH:MM:SS` UTC → the same instant in New York local time, as a DATETIME text.
 */
export function utcToNyLocal(utc: string): string {
  const d = new Date(`${utc.slice(0, 19).replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`
}

/**
 * `fecha_create` is a DATETIME written by legacy with the database clock, which runs in `SYSTEM` = New
 * York in PROD (plans/plan-export-invoices-nest V1, plans/plan-bug-ttk-salida-despues-de-las-23); the
 * connection returns it as stored (dateStrings). The snapshot instant is UTC: it is taken to New York
 * before comparing. A same-second tie is not «after».
 */
export function isAfterSnapshot(fechaCreateNyLocal: string, snapshotGeneratedAtUtc: string): boolean {
  return fechaCreateNyLocal.slice(0, 19) > utcToNyLocal(snapshotGeneratedAtUtc)
}
