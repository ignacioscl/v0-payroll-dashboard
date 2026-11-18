/** «As of» de Open Invoices (plans/plan-reporte-javier §4.3): un domingo, no futuro, en hora de Nueva York. */
import { describe, expect, it } from 'vitest'

import { formatNyDateTime, isValidAsOf, lastSundayNyYmd, todayNyYmd } from './open-invoices-dates'

describe('open-invoices-dates', () => {
  it('último domingo: domingo → ese día; lunes → el anterior; sábado 23:30 en NY → el domingo anterior', () => {
    expect(lastSundayNyYmd(new Date('2026-09-27T16:00:00Z'))).toBe('2026-09-27')
    expect(lastSundayNyYmd(new Date('2026-09-28T16:00:00Z'))).toBe('2026-09-27')
    expect(lastSundayNyYmd(new Date('2026-10-04T03:30:00Z'))).toBe('2026-09-27')
  })
  it('hoy en Nueva York, no en UTC', () => {
    expect(todayNyYmd(new Date('2026-10-02T02:00:00Z'))).toBe('2026-10-01')
  })
  it('isValidAsOf: domingo no futuro; lunes, futuro o mal formado no', () => {
    const now = new Date('2026-10-01T15:00:00Z')
    expect(isValidAsOf('2026-09-27', now)).toBe(true)
    expect(isValidAsOf('2026-09-28', now)).toBe(false)
    expect(isValidAsOf('2026-10-04', now)).toBe(false)
    expect(isValidAsOf('2026-02-30', now)).toBe(false)
  })
  it('formatNyDateTime como el Generated del Excel', () => {
    expect(formatNyDateTime('2026-10-01T14:12:00.000Z')).toBe('10/01/2026 10:12 AM')
  })
})
