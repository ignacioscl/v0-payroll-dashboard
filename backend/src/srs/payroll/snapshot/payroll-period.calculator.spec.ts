import { PAYMENT_TYPE_IDS } from './payment-type-ids'
import { calculatePeriod } from './payroll-period.calculator'
import { weekStart } from './payroll-dates'
import { PeriodCalcInput, PunchSourceRow, SnapshotRow } from './payroll-snapshot.types'

const PRORATED = 14479

const punch = (p: Partial<PunchSourceRow> & Pick<PunchSourceRow, 'id' | 'punchIn'>): PunchSourceRow => ({
  idAuthor: 1,
  idDealer: 10,
  fecha: p.punchIn.slice(0, 10),
  idPaymentType: PAYMENT_TYPE_IDS.HOURLY,
  hourlyRate: 15,
  payrollTax: null,
  horasHourly: 0,
  horas: 0,
  horasShopH: 0,
  piecework: 0,
  flatRate: 0,
  ...p,
})

const input = (over: Partial<PeriodCalcInput>): PeriodCalcInput => ({
  provider: { idContratista: 188, paymentMethod: 1, firstDayWeek: 1, payrollTaxPct: 0 },
  periodo: { desde: '2026-07-06', hasta: '2026-07-12' },
  corte: '9999-12-31',
  punchRows: [],
  pieceworkDayRows: [],
  salaryRows: [],
  fechaCalculo: '2026-10-01 04:30:00',
  calcVersion: 1,
  proratedDayId: PRORATED,
  ...over,
})

const sum = (rows: SnapshotRow[], f: (r: SnapshotRow) => number) =>
  Math.round(rows.reduce((a, r) => a + f(r), 0) * 1e4) / 1e4

describe('calculatePeriod', () => {
  // Provider 188, empleado 10221, dealer 59, semana 07/06–07/12, $15/h (copia de PROD 21/09).
  const real10221: PunchSourceRow[] = [
    [892335, '2026-07-06 09:30:00', 12.13],
    [892957, '2026-07-07 09:21:30', 12.17],
    [893851, '2026-07-08 09:19:00', 12.17],
    [894691, '2026-07-09 09:32:34', 12.15],
    [895753, '2026-07-10 11:43:47', 8.99],
    [896402, '2026-07-11 09:35:00', 11.87],
    [896983, '2026-07-12 13:00:00', 7.03],
  ].map(([id, punchIn, h]) =>
    punch({ id: id as number, punchIn: punchIn as string, idAuthor: 10221, idDealer: 59, horasHourly: h as number, horas: h as number }),
  )

  it('overtime semanal por día: cruza las 40 h el 07/09 (provider 188, empleado 10221)', () => {
    const rows = calculatePeriod(input({ punchRows: real10221 }))
    const ot = rows.filter((r) => r.concepto === 'overtime')
    expect(ot.map((r) => [r.fecha, r.horas])).toEqual([
      ['2026-07-09', 8.62],
      ['2026-07-10', 8.99],
      ['2026-07-11', 11.87],
      ['2026-07-12', 7.03],
    ])
    const reg = rows.filter((r) => r.concepto === 'ponchada')
    expect(sum(reg, (r) => r.monto)).toBe(600)
    expect(Math.round(sum(ot, (r) => r.monto) * 100) / 100).toBe(821.48)
    // Las horas trabajadas viven solo en las filas `ponchada` (nunca 113,02).
    expect(sum(reg, (r) => r.horas)).toBe(76.51)
    expect(sum(ot, (r) => r.horas)).toBe(36.51)
  })

  it('tarifa del período = la de la primera ponchada del tipo, como legacy (no la máxima)', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 749, paymentMethod: 3, firstDayWeek: 0, payrollTaxPct: 0 },
        periodo: { desde: '2026-07-01', hasta: '2026-07-31' },
        punchRows: [
          punch({ id: 1, punchIn: '2026-07-01 08:00:00', horasHourly: 8, horas: 8, hourlyRate: 4950.41 }),
          punch({ id: 2, punchIn: '2026-07-17 08:00:00', horasHourly: 8, horas: 8, hourlyRate: 5081.68 }),
        ],
      }),
    )
    expect(rows.every((r) => r.tarifa === 4950.41)).toBe(true)
    expect(sum(rows, (r) => r.monto)).toBe(Math.round(16 * 4950.41 * 1e4) / 1e4)
  })

  it('empresa quincenal con 50 h en una semana: sin fila overtime', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 79, paymentMethod: 2, firstDayWeek: 0, payrollTaxPct: 0 },
        periodo: { desde: '2026-07-01', hasta: '2026-07-15' },
        punchRows: [1, 2, 3, 4, 5].map((d) =>
          punch({ id: d, punchIn: `2026-07-0${d} 08:00:00`, horasHourly: 10, horas: 10 }),
        ),
      }),
    )
    expect(rows.some((r) => r.concepto === 'overtime')).toBe(false)
    expect(sum(rows, (r) => r.monto)).toBe(750)
  })

  it('salario de $200 en quincena de 16 días: 16 filas que suman exacto 200', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 79, paymentMethod: 2, firstDayWeek: 0, payrollTaxPct: 0 },
        periodo: { desde: '2026-07-31', hasta: '2026-08-15' },
        salaryRows: [{ idUsuario: 5, idDealer: 167, idPaymentType: PAYMENT_TYPE_IDS.SALARY, payment: 200, payrollTax: null }],
      }),
    )
    expect(rows).toHaveLength(16)
    expect(rows.every((r) => r.concepto === 'prorrateo' && r.idDealer === 167)).toBe(true)
    expect(sum(rows, (r) => r.monto)).toBe(200)
  })

  it('salario de $200 en quincena de 15 días: suma exacto 200', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 79, paymentMethod: 2, firstDayWeek: 0, payrollTaxPct: 0 },
        periodo: { desde: '2026-07-01', hasta: '2026-07-15' },
        salaryRows: [{ idUsuario: 5, idDealer: 167, idPaymentType: PAYMENT_TYPE_IDS.SALARY, payment: 200, payrollTax: null }],
      }),
    )
    expect(rows).toHaveLength(15)
    expect(sum(rows, (r) => r.monto)).toBe(200)
  })

  it('salario sin dealer queda con id_dealer NULL (decisión G)', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 79, paymentMethod: 2, firstDayWeek: 0, payrollTaxPct: 0 },
        periodo: { desde: '2026-07-01', hasta: '2026-07-15' },
        salaryRows: [{ idUsuario: 5, idDealer: null, idPaymentType: PAYMENT_TYPE_IDS.SALARY, payment: 2500, payrollTax: null }],
      }),
    )
    expect(rows.every((r) => r.idDealer === null)).toBe(true)
    expect(sum(rows, (r) => r.monto)).toBe(2500)
  })

  it('el período abierto prorratea solo hasta el corte', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 79, paymentMethod: 2, firstDayWeek: 0, payrollTaxPct: 0 },
        periodo: { desde: '2026-07-01', hasta: '2026-07-15' },
        corte: '2026-07-05',
        salaryRows: [{ idUsuario: 5, idDealer: 167, idPaymentType: PAYMENT_TYPE_IDS.SALARY, payment: 150, payrollTax: null }],
      }),
    )
    expect(rows.map((r) => r.fecha)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'])
    expect(sum(rows, (r) => r.monto)).toBe(50)
  })

  it('comisión de $150 en 3 dealers: 3 filas por día', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 79, paymentMethod: 2, firstDayWeek: 0, payrollTaxPct: 0 },
        periodo: { desde: '2026-08-31', hasta: '2026-09-15' },
        salaryRows: [101, 102, 103].map((d) => ({
          idUsuario: 9,
          idDealer: d,
          idPaymentType: PAYMENT_TYPE_IDS.COMMISSION,
          payment: 150,
          payrollTax: null,
        })),
      }),
    )
    const day1 = rows.filter((r) => r.fecha === '2026-08-31')
    expect(day1).toHaveLength(3)
    expect(day1.every((r) => r.monto === 9.375)).toBe(true)
  })

  it('payroll tax: 10 % solo para empleados con payroll_tax = 1', () => {
    const rows = calculatePeriod(
      input({
        provider: { idContratista: 1, paymentMethod: 2, firstDayWeek: 0, payrollTaxPct: 10 },
        periodo: { desde: '2026-07-01', hasta: '2026-07-15' },
        punchRows: [
          punch({ id: 1, punchIn: '2026-07-01 08:00:00', idAuthor: 1, idPaymentType: PAYMENT_TYPE_IDS.DAILY_RATE, hourlyRate: 100, payrollTax: 1 }),
          punch({ id: 2, punchIn: '2026-07-01 08:00:00', idAuthor: 2, idPaymentType: PAYMENT_TYPE_IDS.DAILY_RATE, hourlyRate: 100, payrollTax: 2 }),
        ],
      }),
    )
    expect(rows.find((r) => r.idUsuario === 1)?.montoTax).toBe(10)
    expect(rows.find((r) => r.idUsuario === 2)?.montoTax).toBe(0)
  })

  it('Shop/H 45 h en semanal: paga 40, sin overtime', () => {
    const rows = calculatePeriod(
      input({
        punchRows: [1, 2, 3].map((d) =>
          punch({ id: d, punchIn: `2026-07-0${d + 5} 08:00:00`, idPaymentType: PAYMENT_TYPE_IDS.SHOP_H, hourlyRate: 20, horasShopH: 15, horas: 15 }),
        ),
      }),
    )
    expect(rows.some((r) => r.concepto === 'overtime')).toBe(false)
    expect(sum(rows, (r) => r.monto)).toBe(800)
  })

  it('piecework de WO sin ponchada: id_ponchada NULL, tipo Piecework', () => {
    const rows = calculatePeriod(
      input({ pieceworkDayRows: [{ idUsuario: 3, idDealer: 10, fecha: '2026-07-07', payrollTax: null, piecework: 120 }] }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ idPonchada: null, idPaymentType: PAYMENT_TYPE_IDS.PIECEWORK, monto: 120, horas: 0 })
  })

  it('Holiday y tipos propios de la empresa: monto 0 con sus horas', () => {
    const rows = calculatePeriod(
      input({
        punchRows: [
          punch({ id: 1, punchIn: '2026-07-06 08:00:00', idPaymentType: PAYMENT_TYPE_IDS.HOLIDAY, horas: 8 }),
          punch({ id: 2, punchIn: '2026-07-07 08:00:00', idPaymentType: 99999, horas: 8 }),
        ],
      }),
    )
    expect(rows.map((r) => [r.monto, r.horas])).toEqual([
      [0, 8],
      [0, 8],
    ])
  })

  it('Daily Rate sin tarifa (ponchada 861901): monto 0, nunca NULL', () => {
    const rows = calculatePeriod(
      input({
        punchRows: [punch({ id: 861901, punchIn: '2026-05-28 08:00:00', idPaymentType: PAYMENT_TYPE_IDS.DAILY_RATE, hourlyRate: null, horas: 9 })],
        periodo: { desde: '2026-05-16', hasta: '2026-05-30' },
      }),
    )
    expect(rows[0].monto).toBe(0)
  })

  it('Prorated Day: horas × tarifa', () => {
    const rows = calculatePeriod(
      input({
        punchRows: [punch({ id: 1, punchIn: '2026-07-06 08:00:00', idPaymentType: PRORATED, hourlyRate: 20, horas: 4.5 })],
      }),
    )
    expect(rows[0].monto).toBe(90)
  })
})

describe('weekStart (misma regla que TTK_DATE_GROUP_REPORT con payment_method = 1)', () => {
  it('provider 188 (first_day_week = 1): semanas de lunes a domingo', () => {
    expect(weekStart('2026-07-06', 1)).toBe('2026-07-06')
    expect(weekStart('2026-07-12', 1)).toBe('2026-07-06')
    expect(weekStart('2026-07-05', 1)).toBe('2026-06-29')
  })
})
