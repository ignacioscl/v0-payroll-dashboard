/** §7.5 of plans/plan-reporte-javier/PLAN.md: compareRows and the 8 reasons of §3.6. */
import { compareReasons, compareRows, isAfterSnapshot, utcToNyLocal, type CompareInputRow } from './open-invoice-compare'
import { openInvoicesExportLabels } from './open-invoices-export-labels'

const texts = openInvoicesExportLabels('en').reasons
const fmt = (ymd: string) => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`
/** 10/01/2026 14:12:00 UTC = 10:12 AM in New York. */
const SNAP_AT = '2026-10-01 14:12:00'

function row(over: Partial<CompareInputRow>): CompareInputRow {
  return {
    sid: 1,
    fullNro: 'A-1',
    dealerId: 10,
    department: 'Sales',
    departmentKey: 'd:3',
    days: 20,
    termDays: 15,
    bucket: 'd15',
    amount: 100,
    ...over,
  }
}

const sum = (rows: CompareInputRow[]) => rows.reduce((s, r) => s + Math.round(r.amount * 100), 0)

describe('compareRows', () => {
  it('an equal invoice does not come out', () => {
    expect(compareRows([row({})], [row({})])).toEqual([])
  })

  it('paid → −amount; new → +amount', () => {
    const out = compareRows([row({ sid: 1, amount: 145 })], [row({ sid: 2, amount: 640, bucket: 'current', days: 3 })])
    const paid = out.find((c) => c.sid === 1)!
    const created = out.find((c) => c.sid === 2)!
    expect(paid.differenceCents).toBe(-14500)
    expect(paid.today).toBeNull()
    expect(created.differenceCents).toBe(64000)
    expect(created.snapshot).toBeNull()
  })

  it('same amount, another column → comes out with difference 0 and the days passed', () => {
    const [c] = compareRows([row({ days: 20, bucket: 'd15' })], [row({ days: 34, bucket: 'd30' })])
    expect(c.differenceCents).toBe(0)
    expect(c.daysPassed).toBe(14)
    expect(compareReasons(c, undefined, [], SNAP_AT, texts, fmt)).toEqual(['14 more days since the snapshot'])
  })

  it('same total, money moved to another department → Department changed', () => {
    const [c] = compareRows(
      [row({ amount: 60 }), row({ department: 'Service', departmentKey: 'd:4', amount: 40 })],
      [row({ amount: 100 })],
    )
    expect(c.departmentChanged).toBe(true)
    expect(compareReasons(c, undefined, [], SNAP_AT, texts, fmt)).toEqual(['Department changed'])
  })

  it('the department key, not the text, decides: another language is not a change', () => {
    expect(compareRows([row({ department: 'Sin departamento', departmentKey: 'n' })], [row({ department: 'No department', departmentKey: 'n' })])).toEqual([])
  })

  it('sum of Difference = total today − total snapshot, in cents', () => {
    const snap = [row({ sid: 1, amount: 145.1 }), row({ sid: 2, amount: 10.05 }), row({ sid: 3, amount: 0.07 })]
    const now = [row({ sid: 2, amount: 10.05, bucket: 'd30', days: 31 }), row({ sid: 3, amount: 0.02 }), row({ sid: 4, amount: 640.33 })]
    const out = compareRows(snap, now)
    expect(out.reduce((s, c) => s + c.differenceCents, 0)).toBe(sum(now) - sum(snap))
  })

  it('term changed → its reason', () => {
    const [c] = compareRows([row({ termDays: 30, bucket: 'current' })], [row({ termDays: 15, bucket: 'd15' })])
    expect(compareReasons(c, undefined, [], SNAP_AT, texts, fmt)).toEqual(['Payment Due On changed from 30 to 15 days'])
  })
})

describe('compareReasons (§3.6)', () => {
  const paid = compareRows([row({ sid: 7, amount: 145 })], [])[0]

  it('1 — invoice deleted', () => {
    expect(compareReasons(paid, { estado: 0, fechaCreate: '2026-09-01 10:00:00', payments: [] }, [], SNAP_AT, texts, fmt)).toEqual(['Invoice deleted'])
  })

  it('2 — paid with a payment that was not in the snapshot', () => {
    const facts = { estado: 1, fechaCreate: '2026-09-01 10:00:00', payments: [{ idBilling: 30184, checkNumber: '3400333437', fechaAlta: '2026-10-06', estado: 1 }] }
    expect(compareReasons(paid, facts, [], SNAP_AT, texts, fmt)).toEqual(['Paid: check 3400333437, entered 10/06/2026'])
  })

  it('2 — a payment entered the same day of the snapshot but after it (not in payments_json) → Paid', () => {
    const facts = { estado: 1, fechaCreate: null, payments: [{ idBilling: 9, checkNumber: 'C9', fechaAlta: '2026-10-01', estado: 1 }] }
    expect(compareReasons(paid, facts, [], SNAP_AT, texts, fmt)).toEqual(['Paid: check C9, entered 10/01/2026'])
  })

  it('an active payment that was already in the snapshot does not say «Paid»', () => {
    const c = compareRows([row({ amount: 100 })], [row({ amount: 50 })])[0]
    const facts = { estado: 1, fechaCreate: null, payments: [{ idBilling: 5, checkNumber: 'C5', fechaAlta: '2026-09-15', estado: 1 }] }
    expect(compareReasons(c, facts, [5], SNAP_AT, texts, fmt)).toEqual([texts.unknown])
  })

  it('3 — a payment of the snapshot deleted today', () => {
    const c = compareRows([], [row({ sid: 8, amount: 145 })])[0]
    const facts = { estado: 1, fechaCreate: '2026-09-01 10:00:00', payments: [{ idBilling: 24767, checkNumber: 'C1', fechaAlta: '2026-09-20', estado: 0 }] }
    expect(compareReasons(c, facts, [24767], SNAP_AT, texts, fmt)).toEqual(['Payment deleted: check C1'])
  })

  it('a payment deleted before the snapshot (not in payments_json) does not say «Payment deleted»', () => {
    const c = compareRows([], [row({ sid: 8, amount: 145 })])[0]
    const facts = { estado: 1, fechaCreate: '2026-09-01 10:00:00', payments: [{ idBilling: 1, checkNumber: 'C1', fechaAlta: '2026-09-20', estado: 0 }] }
    expect(compareReasons(c, facts, [], SNAP_AT, texts, fmt)).toEqual([texts.unknown])
  })

  it('4 — created after the snapshot (New York time of the database against the UTC instant)', () => {
    const c = compareRows([], [row({ sid: 9, amount: 640, bucket: 'current' })])[0]
    // 10:13 AM in New York is after 10:12 AM (14:12 UTC).
    expect(compareReasons(c, { estado: 1, fechaCreate: '2026-10-01 10:13:00', payments: [] }, undefined, SNAP_AT, texts, fmt)).toEqual([
      'Invoice created after the snapshot (10/01/2026)',
    ])
    // 10:11 AM in New York is before: no reason 4 → 8.
    expect(compareReasons(c, { estado: 1, fechaCreate: '2026-10-01 10:11:00', payments: [] }, undefined, SNAP_AT, texts, fmt)).toEqual([texts.unknown])
  })

  it('an invoice that was not in the snapshot (paid off then) and reopens: an old payment is not «Paid» → 8 (CODE-review 2)', () => {
    const c = compareRows([], [row({ sid: 11, amount: 50 })])[0]
    const facts = {
      estado: 1,
      fechaCreate: '2026-09-01 10:00:00',
      payments: [
        { idBilling: 1, checkNumber: 'OLD', fechaAlta: '2026-09-15', estado: 1 },
        { idBilling: 2, checkNumber: 'DEL', fechaAlta: '2026-09-16', estado: 0 },
      ],
    }
    expect(compareReasons(c, facts, undefined, SNAP_AT, texts, fmt)).toEqual([texts.unknown])
  })

  it('8 — none of the above', () => {
    expect(compareReasons(paid, { estado: 1, fechaCreate: null, payments: [] }, [], SNAP_AT, texts, fmt)).toEqual([
      "The invoice or its payments changed; SRS doesn't keep the detail",
    ])
  })

  it('several reasons at once, in order', () => {
    const c = compareRows([row({ termDays: 30, bucket: 'current', amount: 100 })], [row({ termDays: 15, bucket: 'd15', amount: 40 })])[0]
    const facts = { estado: 1, fechaCreate: null, payments: [{ idBilling: 2, checkNumber: 'C2', fechaAlta: '2026-10-05', estado: 1 }] }
    expect(compareReasons(c, facts, [], SNAP_AT, texts, fmt)).toEqual([
      'Paid: check C2, entered 10/05/2026',
      'Payment Due On changed from 30 to 15 days',
    ])
  })

  it('Spanish texts', () => {
    const es = openInvoicesExportLabels('es').reasons
    expect(compareReasons(paid, { estado: 0, fechaCreate: null, payments: [] }, [], SNAP_AT, es, fmt)).toEqual(['Invoice borrada'])
  })
})

describe('time zones', () => {
  it('utcToNyLocal in summer and winter', () => {
    expect(utcToNyLocal('2026-10-01 14:12:00')).toBe('2026-10-01 10:12:00')
    expect(utcToNyLocal('2026-12-01 04:30:00')).toBe('2026-11-30 23:30:00')
  })
  it('isAfterSnapshot: a same-second tie is not after', () => {
    expect(isAfterSnapshot('2026-10-01 10:12:00', SNAP_AT)).toBe(false)
    expect(isAfterSnapshot('2026-10-01 10:12:01', SNAP_AT)).toBe(true)
  })
})
