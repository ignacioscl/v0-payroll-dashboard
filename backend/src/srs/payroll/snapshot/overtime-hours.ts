import { weekStart } from './payroll-dates'

const WEEKLY_REGULAR_HOURS = 40

export interface DayHours {
  idUsuario: number
  idDealer: number
  /** YYYY-MM-DD */
  fecha: string
  horas: number
}

export interface OvertimeHoursResult {
  hours: number
  employeesOver40: number
}

/**
 * «Overtime Hours» (plan §6.6, Q2): horas sobre 40 por semana, por empleado y dealer, se paguen o
 * no. La semana se mira entera aunque empiece antes del rango (`rows` llega con el rango ampliado a
 * semanas enteras); por cada (empleado, dealer, semana) se recorren los días en orden y las horas de
 * un día que pasan el acumulado de 40 son las extra de ese día. Al rango se le suman solo las extra
 * de sus días. Nunca `Σh − 40` de la semana: atribuiría horas trabajadas después del rango.
 *
 * Ejemplo real (Auto Wax, empleado 6540, dealer 627, semana 06/29–07/05, 62,24 h): cruza las 40 el
 * 07/02 → 22,24 h extra en la quincena 07/01–07/15 y 0 en la anterior.
 */
export function overtimeHoursInRange(
  rows: DayHours[],
  fechaDesde: string,
  fechaHasta: string,
  firstDayWeek: number,
): OvertimeHoursResult {
  const groups = new Map<string, DayHours[]>()
  for (const r of rows) {
    const key = `${r.idUsuario}|${r.idDealer}|${weekStart(r.fecha, firstDayWeek)}`
    const list = groups.get(key)
    if (list) list.push(r)
    else groups.set(key, [r])
  }

  let hours = 0
  const employees = new Set<number>()
  for (const list of groups.values()) {
    list.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    let acc = 0
    for (const d of list) {
      const before = acc
      acc += d.horas
      const extra = Math.max(0, acc - WEEKLY_REGULAR_HOURS) - Math.max(0, before - WEEKLY_REGULAR_HOURS)
      if (extra > 0 && d.fecha >= fechaDesde && d.fecha <= fechaHasta) {
        hours += extra
        employees.add(d.idUsuario)
      }
    }
  }
  return { hours: Math.round((hours + Number.EPSILON) * 100) / 100, employeesOver40: employees.size }
}
