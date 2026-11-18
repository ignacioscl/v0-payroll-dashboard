/** T3 and §7.3 / §7.5 of plans/plan-reporte-javier/PLAN.md: the pure rules of Open Invoices. */
import {
  buildOpenInvoiceRows,
  daysBetweenYmd,
  isSundayYmd,
  lastSundayYmd,
  openInvoiceBucket,
  openInvoiceDaysStart,
  openInvoiceDepartmentKey,
  openInvoiceDepartmentLabel,
  openInvoiceTermDays,
  statementDepartmentLabel,
  summarizeOpenInvoices,
  type OpenInvoiceSqlRow,
} from './open-invoice-aging'
import { invoiceExportDaysOld } from './invoice-export-xlsx'

const LABELS = { ttkDepartment: 'Timesheets', noDepartment: 'No department', genericPosition: 'Generic', noPosition: 'No position' }

describe('openInvoiceBucket (cartel line 4)', () => {
  it.each([
    [0, 'current'],
    [14, 'current'],
    [15, 'd15'],
    [29, 'd15'],
    [30, 'd30'],
    [59, 'd30'],
    [60, 'd60'],
    [89, 'd60'],
    [90, 'd90'],
    [258, 'd90'],
  ])('term 15: %i days → %s', (days, bucket) => {
    expect(openInvoiceBucket(days, 15)).toBe(bucket)
  })

  it('term 30: 29 → Current, 30 → 30+ (15+ stays empty)', () => {
    expect(openInvoiceBucket(29, 30)).toBe('current')
    expect(openInvoiceBucket(30, 30)).toBe('d30')
    expect(openInvoiceBucket(15, 30)).toBe('current')
  })

  it('term 60 and 120 only move the end of Current', () => {
    expect(openInvoiceBucket(59, 60)).toBe('current')
    expect(openInvoiceBucket(60, 60)).toBe('d60')
    expect(openInvoiceBucket(100, 120)).toBe('current')
    expect(openInvoiceBucket(120, 120)).toBe('d90')
  })
})

describe('openInvoiceTermDays (cartel line 5)', () => {
  it.each([
    [null, 15],
    [undefined, 15],
    [0, 15],
    [7, 15],
    [15, 15],
    [30, 30],
    [120, 120],
  ])('Payment Due On %p → %i', (dueOn, term) => {
    expect(openInvoiceTermDays(dueOn as number | null | undefined)).toBe(term)
  })
})

describe('openInvoiceDaysStart (cartel line 3)', () => {
  it('TTK and Generic with DATE TO → DATE TO', () => {
    expect(openInvoiceDaysStart(5, '2026-09-28', '2026-09-27')).toBe('2026-09-27')
    expect(openInvoiceDaysStart(6, '2026-10-02', '2026-09-30')).toBe('2026-09-30')
  })
  it('TTK without DATE TO → created; WO → created', () => {
    expect(openInvoiceDaysStart(5, '2026-09-28', null)).toBe('2026-09-28')
    expect(openInvoiceDaysStart(1, '2026-09-20', '2026-09-27')).toBe('2026-09-20')
  })
})

describe('daysBetweenYmd', () => {
  it('same day = 0, across the year, never negative', () => {
    expect(daysBetweenYmd('2026-10-01', '2026-10-01')).toBe(0)
    expect(daysBetweenYmd('2025-12-31', '2026-01-01')).toBe(1)
    expect(daysBetweenYmd('2026-10-05', '2026-10-01')).toBe(0)
    expect(daysBetweenYmd('2026-03-07', '2026-03-09')).toBe(2) // DST in New York in between
  })

  it('DAYS OLD of the «Invoice» Excel gives what it gave before', () => {
    // 10/01/2026 15:00 UTC = 11:00 AM in New York.
    const at = new Date('2026-10-01T15:00:00Z')
    expect(invoiceExportDaysOld('2026-09-27 08:00:00', at)).toBe(4)
    expect(invoiceExportDaysOld('2026-10-01', at)).toBe(0)
    expect(invoiceExportDaysOld('', at)).toBe('')
    // 02:00 UTC of 10/02 is still 10/01 in New York.
    expect(invoiceExportDaysOld('2026-09-30', new Date('2026-10-02T02:00:00Z'))).toBe(1)
  })
})

describe('lastSundayYmd (New York)', () => {
  it('Sunday → that day; Monday → the day before; Saturday 23:30 → the Sunday before', () => {
    expect(lastSundayYmd(new Date('2026-09-27T16:00:00Z'))).toBe('2026-09-27')
    expect(lastSundayYmd(new Date('2026-09-28T16:00:00Z'))).toBe('2026-09-27')
    // Saturday 10/03 23:30 in New York = Sunday 10/04 03:30 UTC.
    expect(lastSundayYmd(new Date('2026-10-04T03:30:00Z'))).toBe('2026-09-27')
  })
  it('isSundayYmd', () => {
    expect(isSundayYmd('2026-09-27')).toBe(true)
    expect(isSundayYmd('2026-09-28')).toBe(false)
  })
})

describe('department (cartel line 6)', () => {
  it('statementDepartmentLabel: TTK and Generic without department → Timesheets; WO → No department', () => {
    expect(statementDepartmentLabel(null, 5, LABELS)).toBe('Timesheets')
    expect(statementDepartmentLabel('', 6, LABELS)).toBe('Timesheets')
    expect(statementDepartmentLabel(null, 1, LABELS)).toBe('No department')
    expect(statementDepartmentLabel('Sales', 1, LABELS)).toBe('Sales')
  })

  it('openInvoiceDepartmentLabel: P:Valet, P:, G and no key', () => {
    expect(openInvoiceDepartmentLabel(null, 5, 'P:Valet', LABELS)).toBe('Timesheets · Valet')
    expect(openInvoiceDepartmentLabel(null, 5, 'P:', LABELS)).toBe('Timesheets · No position')
    expect(openInvoiceDepartmentLabel(null, 6, 'G', LABELS)).toBe('Timesheets · Generic')
    expect(openInvoiceDepartmentLabel(null, 6, 'P:Porter', LABELS)).toBe('Timesheets · Porter')
    expect(openInvoiceDepartmentLabel('Sales', 1, null, LABELS)).toBe('Sales')
    expect(openInvoiceDepartmentLabel(null, 5, null, LABELS)).toBe('Timesheets')
  })

  it('the key does not depend on the language', () => {
    expect(openInvoiceDepartmentKey(12, null)).toBe('d:12')
    expect(openInvoiceDepartmentKey(0, null)).toBe('n')
    expect(openInvoiceDepartmentKey(0, 'G')).toBe('t:G')
    expect(openInvoiceDepartmentKey(0, 'P:Valet')).toBe('t:P:Valet')
    expect(openInvoiceDepartmentKey(0, 'P:')).toBe('t:P:')
  })
})

function sql(over: Partial<OpenInvoiceSqlRow>): OpenInvoiceSqlRow {
  return {
    sid: 1,
    fullNro: 'A-1',
    dealerId: 10,
    statementType: 1,
    createdYmd: '2026-09-20',
    dateFromYmd: null,
    dateToYmd: null,
    deptId: 3,
    deptName: 'Sales',
    puestoKey: null,
    services: '',
    amount: 0,
    ...over,
  }
}

describe('buildOpenInvoiceRows + summarizeOpenInvoices', () => {
  const today = '2026-10-01'
  const rows = buildOpenInvoiceRows(
    [
      sql({ sid: 1, amount: 100.1, createdYmd: '2026-09-20' }), // 11 days → current
      sql({ sid: 2, amount: 0.2, createdYmd: '2026-08-01' }), // 61 → 60+
      sql({ sid: 3, statementType: 5, deptId: 0, deptName: null, puestoKey: 'P:Valet', amount: 50, createdYmd: '2026-09-28', dateToYmd: '2026-09-27' }),
      sql({ sid: 4, dealerId: 20, amount: 70, createdYmd: '2026-09-10' }), // 21 days, term 30 → current
      sql({ sid: 5, deptId: 4, deptName: 'Service', amount: 0.1, createdYmd: '2026-09-20' }),
      sql({ sid: 6, deptId: 4, deptName: 'Service', amount: -0.1, createdYmd: '2026-09-20' }),
    ],
    new Map([[20, 30]]),
    today,
    LABELS,
  )

  it('days, term and column per row', () => {
    expect(rows.map((r) => [r.sid, r.days, r.termDays, r.bucket])).toEqual([
      [1, 11, 15, 'current'],
      [2, 61, 15, 'd60'],
      [3, 4, 15, 'current'],
      [4, 21, 30, 'current'],
      [5, 11, 15, 'current'],
      [6, 11, 15, 'current'],
    ])
    expect(rows[2].department).toBe('Timesheets · Valet')
  })

  it('sums in cents and drops groups that add up to $0', () => {
    const names = new Map([[10, 'B dealer'], [20, 'A dealer']])
    const s = summarizeOpenInvoices(rows, (id) => names.get(id) ?? '')
    expect(s.rows.map((r) => [r.dealerId, r.department, r.current, r.d60, r.total])).toEqual([
      [20, 'Sales', 70, 0, 70],
      [10, 'Sales', 100.1, 0.2, 100.3],
      [10, 'Timesheets · Valet', 50, 0, 50],
    ])
    expect(s.rows.find((r) => r.department === 'Service')).toBeUndefined()
    expect(s.totals).toEqual({ current: 220.1, d15: 0, d30: 0, d60: 0.2, d90: 0, total: 220.3 })
  })
})
