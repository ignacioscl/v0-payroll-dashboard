import { overtimeHoursInRange } from './overtime-hours'

const days = (idUsuario: number, idDealer: number, list: [string, number][]) =>
  list.map(([fecha, horas]) => ({ idUsuario, idDealer, fecha, horas }))

describe('overtimeHoursInRange', () => {
  // Auto Wax, empleado 6540, dealer 627, semana 06/29–07/05 (plan §6.6).
  const e6540 = days(6540, 627, [
    ['2026-06-29', 11.35],
    ['2026-06-30', 11.43],
    ['2026-07-01', 11.14],
    ['2026-07-02', 11.36],
    ['2026-07-03', 8.63],
    ['2026-07-04', 8.33],
  ])

  it('la semana se mira entera: 22,24 h extra en la quincena 07/01–07/15', () => {
    expect(overtimeHoursInRange(e6540, '2026-07-01', '2026-07-15', 1)).toEqual({ hours: 22.24, employeesOver40: 1 })
  })

  it('0 h en la quincena anterior (06/16–06/30): todavía no pasó las 40', () => {
    expect(overtimeHoursInRange(e6540, '2026-06-16', '2026-06-30', 1).hours).toBe(0)
  })

  // Empleado 5331, dealer 744, semana 07/27–08/02: cruza las 40 recién el 07/31.
  const e5331 = days(5331, 744, [
    ['2026-07-27', 10.9],
    ['2026-07-28', 7.78],
    ['2026-07-29', 11.42],
    ['2026-07-30', 8.21],
    ['2026-07-31', 11.29],
    ['2026-08-01', 11.45],
    ['2026-08-02', 8.28],
  ])

  it('nunca Σh − 40 de la semana: 0 h en 07/16–07/30 y 29,33 h en 07/31–08/15', () => {
    expect(overtimeHoursInRange(e5331, '2026-07-16', '2026-07-30', 1).hours).toBe(0)
    expect(overtimeHoursInRange(e5331, '2026-07-31', '2026-08-15', 1).hours).toBe(29.33)
  })

  it('por empleado y dealer: 30 h en cada uno de dos dealers no es overtime', () => {
    const rows = [
      ...days(1, 10, [['2026-07-06', 30]]),
      ...days(1, 20, [['2026-07-07', 30]]),
    ]
    expect(overtimeHoursInRange(rows, '2026-07-06', '2026-07-12', 1).hours).toBe(0)
  })
})
