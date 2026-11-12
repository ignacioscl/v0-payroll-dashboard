/** P3, P4 y P5 de plans/plan-monthly-closing/PLAN.md; P5 de plans/plan-reporte-tint/PLAN.md. Funciones puras. */
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'

import { periodsEndingIn } from '../payroll/snapshot/payroll-month-periods'
import { MonthlyClosingQueryDto } from './dto/monthly-closing.dto'
import { currentNyMonth, isValidClosingMonth, monthBounds } from './dto/monthly-closing-month'
import {
  canonicalPayrollCents,
  TINT_GENERIC_FREE_COUNTS,
  groupByService,
  isNonTintWarning,
  isTintClosingLine,
  isTintService,
  largestRemainderCents,
  profitPct,
} from './monthly-closing-math'
import { closingExportPrefix, closingMonthLabel, closingPeriodLabel } from './monthly-closing-export'
import { periodStatus } from './service/monthly-closing.service'

describe('Monthly Closing — mes (P4, pareja de frontend/lib/reports/monthly-closing-month.ts)', () => {
  const now = new Date('2026-11-04T15:00:00Z')

  it('rechaza lo que no es un mes real o está fuera del rango', () => {
    for (const v of ['2026-13', '2026-9', '09-2026', 'abc', '', '2019-12', '2026-12', '2026-00', undefined, 202609]) {
      expect(isValidClosingMonth(v, now)).toBe(false)
    }
  })

  it('acepta desde 2020-01 hasta el mes actual de New York', () => {
    for (const v of ['2026-09', '2020-01', '2026-11']) expect(isValidClosingMonth(v, now)).toBe(true)
  })

  it('el mes actual es el de New York, no el de UTC', () => {
    // 1/12 a las 02:00 UTC es todavía 30/11 en New York.
    expect(currentNyMonth(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11')
  })

  it('bordes del mes, con febrero bisiesto', () => {
    expect(monthBounds('2026-09')).toEqual({ firstDay: '2026-09-01', lastDay: '2026-09-30' })
    expect(monthBounds('2028-02')).toEqual({ firstDay: '2028-02-01', lastDay: '2028-02-29' })
  })
})

describe('Monthly Closing — scope (P5 del tint, pareja de CLOSING_SCOPES del front)', () => {
  const errors = (scope: unknown) =>
    validateSync(plainToInstance(MonthlyClosingQueryDto, { month: '2026-09', idDealer: '1', scope })).map((e) => e.property)

  it('acepta all, tint y ausente', () => {
    expect(errors('all')).toEqual([])
    expect(errors('tint')).toEqual([])
    expect(errors(undefined)).toEqual([])
  })

  it('rechaza TINT, x y vacío en el campo scope', () => {
    for (const v of ['TINT', 'x', '']) expect(errors(v)).toEqual(['scope'])
  })
})

describe('Monthly Closing — períodos del mes (P3)', () => {
  const quincenas = [
    { desde: '2026-08-16', hasta: '2026-08-30' },
    { desde: '2026-08-31', hasta: '2026-09-15' },
    { desde: '2026-09-16', hasta: '2026-09-30' },
    { desde: '2026-10-01', hasta: '2026-10-15' },
  ]

  it('septiembre toma los que terminan en septiembre', () => {
    expect(periodsEndingIn(quincenas, '2026-09-01', '2026-09-30')).toEqual(quincenas.slice(1, 3))
  })

  it('estado: completo, calculado hasta un día, sin calcular', () => {
    const p = { desde: '2026-10-16', hasta: '2026-10-30' }
    expect(periodStatus(p, '2026-10-30').status).toBe('complete')
    expect(periodStatus(p, '2026-10-27')).toEqual({ ...p, status: 'partial', calculatedThrough: '2026-10-27' })
    expect(periodStatus(p, undefined)).toEqual({ ...p, status: 'notCalculated', calculatedThrough: null })
    expect(closingPeriodLabel(periodStatus(p, '2026-10-27'))).toBe('10/16/2026 – 10/30/2026 (calculated through 10/27/2026)')
    expect(closingPeriodLabel(periodStatus(p, undefined))).toBe('10/16/2026 – 10/30/2026 (not calculated yet)')
    expect(closingPeriodLabel(periodStatus(p, '2026-10-30'))).toBe('10/16/2026 – 10/30/2026')
  })
})

describe('Monthly Closing — cuentas (P5)', () => {
  it('% con un decimal y null con Income $0', () => {
    expect(profitPct(2500, 10000)).toBe(25)
    expect(profitPct(-1, 3)).toBe(-33.3)
    expect(profitPct(-500, 0)).toBeNull()
  })

  it('importe canónico: ROUND por tipo y concepto + ROUND del tax, por dealer y período', () => {
    const rows = [
      { idDealer: 1, periodoDesde: '2026-08-31', monto: 10.004, tax: 0.333 },
      { idDealer: 1, periodoDesde: '2026-08-31', monto: 5.006, tax: 0.333 },
      { idDealer: null, periodoDesde: '2026-08-31', monto: 7, tax: 0 },
    ]
    const c = canonicalPayrollCents(rows)
    // 1000 + 501 + ROUND(0.666) = 1568
    expect(c.get('1|2026-08-31')).toBe(1568)
    expect(c.get('none|2026-08-31')).toBe(700)
  })

  it('mayor resto: las filas por empleado suman el importe canónico, empate por nombre', () => {
    const rows = [
      { employee: 'Beto', amount: 1.005 },
      { employee: 'Ana', amount: 1.005 },
      { employee: 'Carla', amount: 1.001 },
    ]
    // Truncadas suman 300; falta 1 centavo y Ana y Beto empatan en resto: va a Ana por nombre.
    const out = largestRemainderCents(rows, 301)
    expect(out.reduce((a, r) => a + r.cents, 0)).toBe(301)
    expect(out.find((r) => r.employee === 'Ana')?.cents).toBe(101)
    expect(out.find((r) => r.employee === 'Beto')?.cents).toBe(100)
  })

  it('mayor resto con residuo negativo saca de las de menor resto', () => {
    const out = largestRemainderCents([{ employee: 'A', amount: 1.009 }, { employee: 'B', amount: 1.001 }], 199)
    expect(out.reduce((a, r) => a + r.cents, 0)).toBe(199)
    expect(out.find((r) => r.employee === 'A')?.cents).toBe(100)
    expect(out.find((r) => r.employee === 'B')?.cents).toBe(99)
  })
})

describe('Window Tint Closing — qué línea entra, servicio de tint y By service', () => {
  it('servicio de tint: «tint» en el nombre, sin importar mayúsculas', () => {
    expect(isTintService('Window Tint - Full Car')).toBe(true)
    expect(isTintService('TINT front')).toBe(true)
    expect(isTintService('PDI')).toBe(false)
  })

  it('WO de un tintero entra entera, diga «tint» o no; Generic libre solo con «tint»; nunca TTK ni ponchadas', () => {
    expect(isTintClosingLine({ kind: 'wo', service: 'Window Tint Full' })).toBe(true)
    expect(isTintClosingLine({ kind: 'wo', service: 'PDI' })).toBe(true)
    expect(isTintClosingLine({ kind: 'woUnbilled', service: 'Detail' })).toBe(true)
    expect(isTintClosingLine({ kind: 'genericFree', service: 'Tinting flat' })).toBe(TINT_GENERIC_FREE_COUNTS)
    expect(isTintClosingLine({ kind: 'genericFree', service: 'Detail' })).toBe(false)
    expect(isTintClosingLine({ kind: 'ttk', service: 'Peluche Window Tinting LLC' })).toBe(false)
    expect(isTintClosingLine({ kind: 'genericPunch', service: 'Peluche Window Tinting LLC' })).toBe(false)
  })

  it('By service agrupa por dealer, departamento y servicio; un servicio sin «tint» conserva su Qty y va marcado', () => {
    const lines = [
      { dealerId: 1, department: 'Used', service: 'Tint', qty: 1, cents: 7000 },
      { dealerId: 1, department: 'New', service: 'Tint', qty: 1, cents: 8000 },
      { dealerId: 1, department: 'New', service: 'Tint', qty: 2, cents: 16000 },
      { dealerId: 1, department: 'New', service: 'PDI', qty: 113, cents: 621500 },
    ]
    expect(groupByService(lines)).toEqual([
      { dealerId: 1, department: 'New', service: 'PDI', vehicles: 113, cents: 621500, tint: false, warn: true },
      { dealerId: 1, department: 'New', service: 'Tint', vehicles: 3, cents: 24000, tint: true, warn: false },
      { dealerId: 1, department: 'Used', service: 'Tint', vehicles: 1, cents: 7000, tint: true, warn: false },
    ])
  })

  it('en rojo: sin «tint» y con importe; un servicio en $0 no se marca (11/11/2026)', () => {
    expect(isNonTintWarning({ service: 'PDI', cents: 5500 })).toBe(true)
    expect(isNonTintWarning({ service: 'Others', cents: 0 })).toBe(false)
    expect(isNonTintWarning({ service: 'Window Tint - 2 Doors', cents: 8000 })).toBe(false)
    expect(isNonTintWarning({ service: 'Credit', cents: -1000 })).toBe(true)
    expect(groupByService([{ dealerId: 1, department: 'Sales', service: 'Others', qty: 2, cents: 0 }])).toEqual([
      { dealerId: 1, department: 'Sales', service: 'Others', vehicles: 2, cents: 0, tint: false, warn: false },
    ])
  })
})

describe('Monthly Closing — nombres del Excel', () => {
  it('archivo y mes', () => {
    expect(closingExportPrefix('all', '2026-09')).toBe('Monthly Closing 09-2026')
    expect(closingExportPrefix('tint', '2026-08')).toBe('Window Tint Closing 08-2026')
    expect(closingMonthLabel('2026-09')).toBe('September 2026')
  })
})
