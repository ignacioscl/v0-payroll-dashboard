import {
  PUNCH_DATE_ORDER_ERROR,
  PUNCH_DATE_RANGE_ERROR,
  assertPunchDateRange,
  maxInclusiveFechaHasta,
} from './punch-date-range'

describe('punch date range (D8)', () => {
  it('acepta un año de calendario: 2025-01-01 … 2025-12-31', () => {
    expect(() => assertPunchDateRange('2025-01-01', '2025-12-31')).not.toThrow()
  })

  it('acepta el día anterior al aniversario (2025-03-15 … 2026-03-14)', () => {
    expect(() => assertPunchDateRange('2025-03-15', '2026-03-14')).not.toThrow()
    expect(maxInclusiveFechaHasta('2025-03-15')).toBe('2026-03-14')
  })

  it('rechaza el aniversario inclusive (más de un año)', () => {
    expect(() => assertPunchDateRange('2025-03-15', '2026-03-15')).toThrow(PUNCH_DATE_RANGE_ERROR)
  })

  it('rechaza 14 meses', () => {
    expect(() => assertPunchDateRange('2025-01-01', '2026-02-28')).toThrow(PUNCH_DATE_RANGE_ERROR)
  })

  it('rechaza fechaDesde posterior a fechaHasta', () => {
    expect(() => assertPunchDateRange('2026-04-30', '2026-04-01')).toThrow(PUNCH_DATE_ORDER_ERROR)
  })

  it('acepta el mismo día', () => {
    expect(() => assertPunchDateRange('2026-04-01', '2026-04-01')).not.toThrow()
  })

  describe('años bisiestos: 29-feb → aniversario cae en 1-mar del año no bisiesto', () => {
    it('max inclusive es 28-feb del año siguiente', () => {
      expect(maxInclusiveFechaHasta('2024-02-29')).toBe('2025-02-28')
    })

    it('acepta 2024-02-29 … 2025-02-28', () => {
      expect(() => assertPunchDateRange('2024-02-29', '2025-02-28')).not.toThrow()
    })

    it('rechaza 2024-02-29 … 2025-03-01', () => {
      expect(() => assertPunchDateRange('2024-02-29', '2025-03-01')).toThrow(PUNCH_DATE_RANGE_ERROR)
    })
  })

  it('un año que incluye el 29-feb (2024-01-01 … 2024-12-31) es válido', () => {
    expect(() => assertPunchDateRange('2024-01-01', '2024-12-31')).not.toThrow()
  })
})
