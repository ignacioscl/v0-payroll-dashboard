import { FIXED_AMOUNT_TYPE_IDS, PAYMENT_TYPE_IDS, PIECEWORK_TYPE_IDS } from './payment-type-ids'
import { diffDays, eachDay, minDate } from './payroll-dates'
import {
  PeriodCalcInput,
  PunchSourceRow,
  SalarySourceRow,
  SnapshotConcepto,
  SnapshotRow,
} from './payroll-snapshot.types'

/**
 * Cálculo de un período de payroll (semana, quincena o mes de UNA empresa) repartido por día.
 * TypeScript puro: no toca la base.
 *
 * Las reglas del período son las del TTK Payroll Report de legacy
 * (`public/php/dao/reports/TTKEmployeeReportDao.php`, `load()`, nivel 2, líneas 495-543):
 *  - Hourly: horas × tarifa de la primera ponchada Hourly del (empleado, dealer) en el período
 *    (`firstRate`); en empresas semanales las primeras 40 h del período van a tarifa normal y el
 *    resto a overtime ×1,5.
 *  - Shop/H: igual, con tope 40 en semanales y SIN overtime (legacy paga las primeras 40).
 *  - Extra y Prorated Day: horas × tarifa de la primera ponchada del tipo.
 *  - Daily Rate, Half Day, Closing, Sunday, Shop, Overtime manual, Other: `hourly_rate` de la
 *    ponchada como monto fijo.
 *  - Piecework / Flat Rate: lo que devuelve la función de legacy por ponchada o por día de WO.
 *  - Salary / Commission: MAX(payment) por (empleado, dealer) y por período, no por ponchada.
 *  - Cualquier otro tipo: $0 con sus horas.
 *
 * El reparto por día es decisión de Ignacio (30/09/2026):
 *  - cada ponchada va al día de su `punch_in` y al dealer de la ponchada;
 *  - el overtime va al día en que el acumulado del período pasa las 40 h;
 *  - salario y comisión se reparten en partes iguales entre los días calendario del período y
 *    van al dealer de la ficha (NULL si la ficha no tiene dealer);
 *  - nada posterior a `corte` (hoy − 2) entra.
 *
 * Contrato de horas: las horas trabajadas de una ponchada viven SOLO en su fila `ponchada`.
 * La fila `overtime` repite en `horas` la parte pagada a 1,5 como detalle del pago; quien
 * suma horas trabajadas lee únicamente `concepto = 'ponchada'`.
 */

const WEEKLY = 1
const OVERTIME_FACTOR = 1.5
const WEEKLY_REGULAR_HOURS = 40

const round4 = (n: number): number => Math.round((n + Number.EPSILON) * 1e4) / 1e4
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 1e2) / 1e2

/**
 * Tarifa del período para un tipo pagado por hora: la de la PRIMERA ponchada de ese tipo del
 * (empleado, dealer) en el período, igual que legacy. El DAO agrupa el nivel 1 por (empleado, tipo,
 * dealer, período) y deja `hourly_rate` sin agregar (`CASE WHEN tew.type_payment = 1 THEN
 * tew.hourly_rate …` dentro del GROUP BY): MariaDB devuelve la de la primera fila del grupo y el
 * `MAX` del nivel 2 recorre un solo valor. No es la máxima (corrección al plan §3.3, 03/10/2026:
 * Mooi tiene 5 empleados con aumento a mitad de mes y legacy les paga todo el mes con la primera).
 * `rows` llega ordenado por `punch_in, id`. Una tarifa NULL da 0, nunca un monto NULL.
 */
function firstRate(rows: PunchSourceRow[], typeId: number | null): number {
  if (typeId === null) return 0
  const first = rows.find((r) => r.idPaymentType === typeId)
  return first?.hourlyRate ?? 0
}

export function calculatePeriod(input: PeriodCalcInput): SnapshotRow[] {
  const { provider, periodo, corte, proratedDayId } = input
  const diasPeriodo = diffDays(periodo.desde, periodo.hasta) + 1
  const weekly = provider.paymentMethod === WEEKLY
  const taxPct = provider.payrollTaxPct > 0 ? provider.payrollTaxPct : 0
  const rows: SnapshotRow[] = []

  const push = (
    r: {
      idDealer: number | null
      idUsuario: number
      idPaymentType: number
      concepto: SnapshotConcepto
      fecha: string
      idPonchada: number | null
      horas: number
      monto: number
      tarifa: number | null
    },
    payrollTax: number | null,
  ) => {
    const monto = round4(r.monto)
    rows.push({
      idContratista: provider.idContratista,
      idDealer: r.idDealer,
      idUsuario: r.idUsuario,
      idPaymentType: r.idPaymentType,
      concepto: r.concepto,
      fecha: r.fecha,
      idPonchada: r.idPonchada,
      horas: round2(r.horas),
      monto,
      // Solo los empleados con payroll_tax = 1 pagan el % de la empresa (DDL 6057-6064).
      montoTax: payrollTax === 1 && taxPct > 0 ? round4((monto * taxPct) / 100) : 0,
      tarifa: r.tarifa,
      periodoDesde: periodo.desde,
      periodoHasta: periodo.hasta,
      diasPeriodo,
      paymentMethod: provider.paymentMethod,
      fechaCalculo: input.fechaCalculo,
      calcVersion: input.calcVersion,
    })
  }

  // ---- Ponchadas: un grupo por (empleado, dealer), como el nivel 2 de legacy ----
  const groups = new Map<string, PunchSourceRow[]>()
  for (const p of input.punchRows) {
    if (p.fecha > corte) continue
    const key = `${p.idAuthor}|${p.idDealer}`
    const list = groups.get(key)
    if (list) list.push(p)
    else groups.set(key, [p])
  }

  for (const list of groups.values()) {
    list.sort((a, b) => (a.punchIn === b.punchIn ? a.id - b.id : a.punchIn < b.punchIn ? -1 : 1))

    const rateHourly = firstRate(list, PAYMENT_TYPE_IDS.HOURLY)
    const rateShopH = firstRate(list, PAYMENT_TYPE_IDS.SHOP_H)
    const rateExtra = firstRate(list, PAYMENT_TYPE_IDS.EXTRA)
    const rateProrated = firstRate(list, proratedDayId)

    let accHourly = 0
    let accShopH = 0

    for (const p of list) {
      const base = {
        idDealer: p.idDealer,
        idUsuario: p.idAuthor,
        idPaymentType: p.idPaymentType,
        fecha: p.fecha,
        idPonchada: p.id,
        horas: p.horas,
      }
      const type = p.idPaymentType

      if (type === PAYMENT_TYPE_IDS.HOURLY) {
        const h = p.horasHourly
        const regular = weekly ? Math.min(h, Math.max(0, WEEKLY_REGULAR_HOURS - accHourly)) : h
        const overtime = h - regular
        accHourly += h
        push(
          { ...base, concepto: 'ponchada', monto: regular * rateHourly, tarifa: rateHourly || null },
          p.payrollTax,
        )
        if (overtime > 0) {
          push(
            {
              ...base,
              concepto: 'overtime',
              horas: overtime,
              monto: overtime * OVERTIME_FACTOR * rateHourly,
              tarifa: rateHourly || null,
            },
            p.payrollTax,
          )
        }
        continue
      }

      if (type === PAYMENT_TYPE_IDS.SHOP_H) {
        const h = p.horasShopH
        const paid = weekly ? Math.min(h, Math.max(0, WEEKLY_REGULAR_HOURS - accShopH)) : h
        accShopH += h
        push({ ...base, concepto: 'ponchada', monto: paid * rateShopH, tarifa: rateShopH || null }, p.payrollTax)
        continue
      }

      if (type === PAYMENT_TYPE_IDS.EXTRA) {
        push({ ...base, concepto: 'ponchada', monto: p.horas * rateExtra, tarifa: rateExtra || null }, p.payrollTax)
        continue
      }

      if (proratedDayId !== null && type === proratedDayId) {
        push(
          { ...base, concepto: 'ponchada', monto: p.horas * rateProrated, tarifa: rateProrated || null },
          p.payrollTax,
        )
        continue
      }

      if (FIXED_AMOUNT_TYPE_IDS.includes(type)) {
        // Una tarifa NULL nunca da un monto NULL: da 0, como el SUM de legacy.
        push({ ...base, concepto: 'ponchada', monto: p.hourlyRate ?? 0, tarifa: p.hourlyRate }, p.payrollTax)
        continue
      }

      if (PIECEWORK_TYPE_IDS.includes(type)) {
        push({ ...base, concepto: 'ponchada', monto: p.piecework, tarifa: null }, p.payrollTax)
        continue
      }

      if (type === PAYMENT_TYPE_IDS.FLAT_RATE) {
        push({ ...base, concepto: 'ponchada', monto: p.flatRate, tarifa: p.hourlyRate }, p.payrollTax)
        continue
      }

      // Rama por defecto: Holiday, Sickday, Overtime by hours y los tipos propios de cada
      // empresa (Mooi: Franco, Vacaciones, PRESENTE…). Legacy no les paga nada; la fila queda
      // con sus horas y monto 0 para que ninguna ponchada se pierda.
      push({ ...base, concepto: 'ponchada', monto: 0, tarifa: p.hourlyRate }, p.payrollTax)
    }
  }

  // ---- Piecework de días de WO sin ponchada en ese dealer ----
  for (const w of input.pieceworkDayRows) {
    if (w.fecha > corte || !w.piecework) continue
    push(
      {
        idDealer: w.idDealer,
        idUsuario: w.idUsuario,
        idPaymentType: PAYMENT_TYPE_IDS.PIECEWORK,
        concepto: 'ponchada',
        fecha: w.fecha,
        idPonchada: null,
        horas: 0,
        monto: w.piecework,
        tarifa: null,
      },
      w.payrollTax,
    )
  }

  // ---- Salario y comisión: MAX(payment) por (empleado, dealer, tipo), repartido por día ----
  const salaries = new Map<string, SalarySourceRow>()
  for (const s of input.salaryRows) {
    const key = `${s.idUsuario}|${s.idDealer ?? 'null'}|${s.idPaymentType}`
    const prev = salaries.get(key)
    if (!prev || s.payment > prev.payment) salaries.set(key, s)
  }

  const lastDay = minDate(periodo.hasta, corte)
  for (const s of salaries.values()) {
    if (!(s.payment > 0)) continue
    const perDay = round4(s.payment / diasPeriodo)
    for (const fecha of eachDay(periodo.desde, lastDay)) {
      // El último día del período absorbe el redondeo: la suma de los días da exacto `payment`.
      const monto = fecha === periodo.hasta ? round4(s.payment - perDay * (diasPeriodo - 1)) : perDay
      push(
        {
          idDealer: s.idDealer,
          idUsuario: s.idUsuario,
          idPaymentType: s.idPaymentType,
          concepto: 'prorrateo',
          fecha,
          idPonchada: null,
          horas: 0,
          monto,
          tarifa: s.payment,
        },
        s.payrollTax,
      )
    }
  }

  return rows
}
