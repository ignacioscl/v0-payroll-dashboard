import { estimatedMonthlyCents, isRunDay, nextRun, pastRunDays, pastRuns, ruleWarnings, runsInNextDays } from './recurring-schedule'
import { addDays, monthRange, previousPeriod } from './expense-period'

const monthly = { frequency: 1, weekDay: null, startDate: '2026-10-16', endDate: null, status: 1 }
const weeklyMonday = { frequency: 2, weekDay: 1, startDate: '2025-08-12', endDate: null, status: 1 }

describe('recurring-schedule (Next run, Next 30 days, Estimated monthly)', () => {
  it('mensual: el día 1 del mes siguiente, dentro de start/end', () => {
    expect(nextRun(monthly, '2026-11-02')).toBe('2026-12-01')
    expect(nextRun(monthly, '2026-11-30')).toBe('2026-12-01')
    expect(nextRun({ ...monthly, startDate: '2027-03-15' }, '2026-11-02')).toBe('2027-04-01')
    expect(nextRun({ ...monthly, endDate: '2026-11-20' }, '2026-11-02')).toBeNull()
  })

  it('semanal: el próximo week_day (0 = Sunday como date("w"))', () => {
    // 2026-11-02 es lunes: la próxima corrida de un lunes es el 09.
    expect(isRunDay(weeklyMonday, '2026-11-02')).toBe(true)
    expect(nextRun(weeklyMonday, '2026-11-02')).toBe('2026-11-09')
    expect(nextRun({ ...weeklyMonday, weekDay: 0 }, '2026-11-02')).toBe('2026-11-08')
    expect(nextRun({ ...weeklyMonday, weekDay: null }, '2026-11-02')).toBeNull()
  })

  it('una regla borrada o vencida no corre', () => {
    expect(isRunDay({ ...monthly, status: 0 }, '2026-12-01')).toBe(false)
    expect(isRunDay({ ...monthly, endDate: '2026-11-30' }, '2026-12-01')).toBe(false)
    expect(isRunDay({ ...monthly, startDate: '2026-12-02' }, '2026-12-01')).toBe(false)
  })

  it('runsInNextDays cuenta las corridas de los próximos 30 días', () => {
    expect(runsInNextDays(monthly, '2026-11-02', 30)).toBe(1)
    expect(runsInNextDays(weeklyMonday, '2026-11-02', 30)).toBe(4)
    expect(runsInNextDays({ ...monthly, endDate: '2026-11-15' }, '2026-11-02', 30)).toBe(0)
  })

  it('estimatedMonthlyCents: × 1 mensual, × 52/12 semanal', () => {
    expect(estimatedMonthlyCents(monthly, 1057500)).toBe(1057500)
    expect(estimatedMonthlyCents(weeklyMonday, 510000)).toBe(2210000)
  })
})

describe('ruleWarnings (el aviso de la lista: por qué la regla no va a generar lo que se espera)', () => {
  const fixed = { ...monthly, amount: '44.00', splitType: 2 }
  const percent = { ...monthly, amount: '1000.00', splitType: 1 }
  const dealer = (id: number, name: string, extra: object) => ({ id, dealerName: name, ...extra })

  it('una regla que se genera completa no tiene aviso', () => {
    expect(ruleWarnings(percent, [dealer(1, 'A', { percentage: '60.00' }), dealer(2, 'B', { percentage: '40.00' })], '2026-11-03')).toEqual([])
    expect(ruleWarnings(fixed, [dealer(1, 'A', { fixedAmount: '44.00' })], '2026-11-03')).toEqual([])
  })

  it('Automatic con el redondeo viejo (Insurance 15 × 6.67) no avisa: el cron los recalcula y genera', () => {
    const stale = Array.from({ length: 15 }, (_, i) => dealer(i + 1, `D${i}`, { percentage: '6.67', automatic: true }))
    expect(ruleWarnings({ ...percent, amount: '5100.00' }, stale, '2026-11-03')).toEqual([])
  })

  it('sin dealers', () => {
    expect(ruleWarnings(percent, [], '2026-11-03')).toEqual(["It has no dealers: it won't generate any expense."])
  })

  it('el mismo control que el cron (checkRun): porcentajes que no suman 100', () => {
    expect(
      ruleWarnings(percent, [dealer(1, 'A', { percentage: '90.00' }), dealer(2, 'B', { percentage: '20.00' })], '2026-11-03'),
    ).toEqual(["It won't generate any expense: percents add up to 110.00%."])
  })

  it('By fixed amount con dealers sin importe: el cron los saltea', () => {
    expect(
      ruleWarnings(
        fixed,
        [dealer(1, 'BMW Pines', { fixedAmount: '44.00' }), dealer(2, 'Bentley', { fixedAmount: null }), dealer(3, 'Mini', {})],
        '2026-11-03',
      ),
    ).toEqual(['No amount for Bentley, Mini: no expense is generated for them.'])
  })

  it('sin día de corrida antes del End date (la test2: mensual del 03/11 al 04/11)', () => {
    const rule = { ...fixed, startDate: '2026-11-03', endDate: '2026-11-04' }
    expect(ruleWarnings(rule, [dealer(1, 'A', { fixedAmount: '44.00' })], '2026-11-03')).toEqual([
      "It won't run again: there is no run day left before the end date.",
    ])
    // Hoy es día de corrida: todavía corre hoy.
    expect(ruleWarnings({ ...rule, startDate: '2026-11-01' }, [dealer(1, 'A', { fixedAmount: '44.00' })], '2026-11-01')).toEqual([])
  })
})

describe('expense-period (fechas por componentes, sin zona horaria)', () => {
  it('addDays cruza mes y año', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
  })

  it('previousPeriod: el anterior de igual largo, pegado', () => {
    expect(previousPeriod('2026-11-01', '2026-11-30')).toEqual({ from: '2026-10-02', to: '2026-10-31' })
    expect(previousPeriod('2026-11-02', '2026-11-02')).toEqual({ from: '2026-11-01', to: '2026-11-01' })
  })

  it('monthRange: el mes de la fecha', () => {
    expect(monthRange('2026-11-02')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(monthRange('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('pastRuns (tema 1 de plan-reunion-juan-18-11: gastos de los períodos ya pasados)', () => {
  const monthly = { frequency: 1, startDate: '2026-08-15', status: 1, amount: '100.00', splitType: 1 }
  const assigns = [
    { id: 1, percentage: null, automatic: 1 },
    { id: 2, percentage: null, automatic: 1 },
    { id: 3, percentage: null, automatic: 1 },
  ]

  it('mensual: los días 1 desde el inicio hasta ayer; hoy no entra (lo genera el cron)', () => {
    expect(pastRunDays(monthly, '2026-11-01')).toEqual(['2026-09-01', '2026-10-01'])
    expect(pastRunDays(monthly, '2026-11-02')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01'])
  })

  it('semanal y con End date: solo hasta el fin de la regla', () => {
    const weekly = { frequency: 2, weekDay: 1, startDate: '2026-10-01', endDate: '2026-10-20', status: 1 }
    expect(pastRunDays(weekly, '2026-11-20')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19'])
  })

  it('reparte como el cron (el centavo que sobra al de mayor %) y saltea los días que ya tienen gasto de la regla', () => {
    const { runs, problem } = pastRuns(monthly, assigns, '2026-11-20', new Set(['2026-09-01']))
    expect(problem).toBeNull()
    expect(runs.map((r) => r.date)).toEqual(['2026-10-01', '2026-11-01'])
    expect(runs[0].rows).toEqual([
      { idAssign: 1, amount: '33.33' },
      { idAssign: 2, amount: '33.33' },
      { idAssign: 3, amount: '33.34' },
    ])
  })

  it('un reparto que el cron no genera: el mismo problema y ninguna corrida', () => {
    const broken = [{ id: 1, percentage: '60', automatic: 0 }, { id: 2, percentage: '30', automatic: 0 }]
    expect(pastRuns(monthly, broken, '2026-11-20', new Set())).toEqual({ runs: [], problem: 'percents add up to 90.00%' })
    expect(pastRuns(monthly, [], '2026-11-20', new Set())).toEqual({ runs: [], problem: 'no dealers' })
  })

  it('sin períodos pendientes no hay problema que mostrar', () => {
    expect(pastRuns({ ...monthly, startDate: '2026-11-10' }, [], '2026-11-20', new Set())).toEqual({ runs: [], problem: null })
  })
})
