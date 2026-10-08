/* eslint-disable no-console */
/**
 * Prueba de paridad del snapshot de payroll contra el TTK Payroll Report de legacy
 * (plans/plan-payroll-spend/PLAN.md §7). Solo lectura: corre el repositorio fuente y el
 * calculator, suma por (período, dealer, tipo) y compara con el TSV del oráculo PHP
 * (plans/plan-payroll-spend/paridad/oracle_legacy.php).
 *
 * Uso (desde v0-payroll-dashboard/backend, con el .env local apuntando a la copia de PROD):
 *   TTK_PRORATED_DAY_ID=14479 PROV=79 \
 *   PERIODS="2026-07-01|2026-07-15,2026-07-16|2026-07-30" \
 *   ORACLE=/ruta/oracle.tsv \
 *   npx ts-node -T scripts/payroll-parity.ts
 *
 * Sin ORACLE imprime el TSV del snapshot con las mismas columnas del oráculo.
 */
import 'reflect-metadata'
import { readFileSync } from 'fs'
import { DataSource } from 'typeorm'

import { srsDataSourceOptions } from '../src/srs/srs.datasource'
import { PAYMENT_TYPE_IDS, proratedDayId } from '../src/srs/payroll/snapshot/payment-type-ids'
import { calculatePeriod } from '../src/srs/payroll/snapshot/payroll-period.calculator'
import { PayrollSourceRepository } from '../src/srs/payroll/snapshot/payroll-source.repository'
import { SnapshotRow } from '../src/srs/payroll/snapshot/payroll-snapshot.types'

const COLS = [
  'payHoursReg',
  'payHoursOt',
  'piecework',
  'salary',
  'commission',
  'flatRate',
  'dailyPay',
  'halfDay',
  'closing',
  'sunday',
  'proratedDay',
  'extra',
  'shop',
  'payHoursShoph',
  'overtime',
  'otherPay',
  'payrollTaxes',
] as const
type Col = (typeof COLS)[number]

function columnOf(row: SnapshotRow, prorated: number | null): Col | null {
  if (row.concepto === 'overtime') return 'payHoursOt'
  switch (row.idPaymentType) {
    case PAYMENT_TYPE_IDS.HOURLY:
      return 'payHoursReg'
    case PAYMENT_TYPE_IDS.PIECEWORK:
    case PAYMENT_TYPE_IDS.PIECEWORK_BY_PERCENT:
      return 'piecework'
    case PAYMENT_TYPE_IDS.SALARY:
      return 'salary'
    case PAYMENT_TYPE_IDS.COMMISSION:
      return 'commission'
    case PAYMENT_TYPE_IDS.FLAT_RATE:
      return 'flatRate'
    case PAYMENT_TYPE_IDS.DAILY_RATE:
      return 'dailyPay'
    case PAYMENT_TYPE_IDS.HALF_DAY:
      return 'halfDay'
    case PAYMENT_TYPE_IDS.CLOSING:
      return 'closing'
    case PAYMENT_TYPE_IDS.SUNDAY:
      return 'sunday'
    case PAYMENT_TYPE_IDS.EXTRA:
      return 'extra'
    case PAYMENT_TYPE_IDS.SHOP:
      return 'shop'
    case PAYMENT_TYPE_IDS.SHOP_H:
      return 'payHoursShoph'
    case PAYMENT_TYPE_IDS.OVERTIME_MANUAL:
      return 'overtime'
    case PAYMENT_TYPE_IDS.OTHER:
      return 'otherPay'
    default:
      return prorated !== null && row.idPaymentType === prorated ? 'proratedDay' : null
  }
}

type Totals = Record<Col, number>
const emptyTotals = (): Totals => Object.fromEntries(COLS.map((c) => [c, 0])) as Totals

async function main() {
  const prov = Number(process.env.PROV ?? 79)
  const periods = (process.env.PERIODS ?? '')
    .split(',')
    .filter(Boolean)
    .map((p) => {
      const [desde, hasta] = p.split('|')
      return { desde, hasta }
    })
  if (!periods.length) throw new Error('PERIODS vacío: "YYYY-MM-DD|YYYY-MM-DD,..."')

  const ds = new DataSource({ ...srsDataSourceOptions, entities: [], logging: false } as any)
  await ds.initialize()
  const repo = new PayrollSourceRepository(ds)
  const provider = await repo.getProvider(prov)
  if (!provider) throw new Error(`Provider ${prov} no existe`)
  const prorated = proratedDayId()

  // snapshot[period][dealer] = totals ; dealer 'null' = Without dealer
  const snap = new Map<string, Map<string, Totals>>()
  for (const periodo of periods) {
    const t0 = Date.now()
    const [punchRows, pieceworkDayRows, salaryRows] = await Promise.all([
      repo.getPunchRows(prov, periodo.desde, periodo.hasta),
      repo.getPieceworkDayRows(prov, periodo.desde, periodo.hasta),
      repo.getSalaryRows(prov, periodo.desde),
    ])
    const rows = calculatePeriod({
      provider,
      periodo,
      corte: '9999-12-31',
      punchRows,
      pieceworkDayRows,
      salaryRows,
      fechaCalculo: '2026-01-01 00:00:00',
      calcVersion: 1,
      proratedDayId: prorated,
    })
    const key = `${periodo.desde}..${periodo.hasta}`
    const byDealer = new Map<string, Totals>()
    for (const r of rows) {
      const d = String(r.idDealer)
      if (!byDealer.has(d)) byDealer.set(d, emptyTotals())
      const t = byDealer.get(d)!
      const col = columnOf(r, prorated)
      if (col) t[col] += r.monto
      t.payrollTaxes += r.montoTax
    }
    snap.set(key, byDealer)
    console.error(
      `[${key}] ponchadas=${punchRows.length} wo-dia=${pieceworkDayRows.length} fichas=${salaryRows.length} filas=${rows.length} (${Date.now() - t0} ms)`,
    )
  }
  await ds.destroy()

  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

  if (!process.env.ORACLE) {
    console.log(['period', 'id_dealer', ...COLS].join('\t'))
    for (const [period, byDealer] of snap) {
      for (const [dealer, t] of byDealer) {
        console.log([period, dealer, ...COLS.map((c) => r2(t[c]))].join('\t'))
      }
    }
    return
  }

  // ---- Comparación contra el oráculo ----
  const lines = readFileSync(process.env.ORACLE, 'utf8').split('\n').filter(Boolean)
  const header = lines[0].split('\t')
  const idx = (name: string) => header.indexOf(name)
  let diffs = 0
  let compared = 0
  const seen = new Set<string>()
  for (const line of lines.slice(1)) {
    const f = line.split('\t')
    const period = f[idx('period')]
    const dealer = f[idx('id_dealer')]
    if (dealer === 'TOTAL' || !snap.has(period)) continue
    seen.add(`${period}|${dealer}`)
    const t = snap.get(period)!.get(dealer) ?? emptyTotals()
    for (const c of COLS) {
      const legacy = Number(f[idx(c)] ?? 0)
      const mine = r2(t[c])
      compared++
      if (Math.abs(legacy - mine) > 0.011) {
        diffs++
        console.log(`DIFF ${period} dealer=${dealer} ${c}: legacy=${legacy} snapshot=${mine}`)
      }
    }
  }
  // Dealers que el snapshot tiene y legacy no (incluye 'null' = Without dealer)
  for (const [period, byDealer] of snap) {
    for (const [dealer, t] of byDealer) {
      if (seen.has(`${period}|${dealer}`)) continue
      const total = COLS.reduce((a, c) => a + t[c], 0)
      console.log(`SOLO-SNAPSHOT ${period} dealer=${dealer} total=${r2(total)} salary=${r2(t.salary)}`)
    }
  }
  for (const [period, byDealer] of snap) {
    const total = emptyTotals()
    for (const [dealer, t] of byDealer) if (dealer !== 'null') for (const c of COLS) total[c] += t[c]
    console.log(`TOTAL-SNAPSHOT ${period} ` + COLS.map((c) => `${c}=${r2(total[c])}`).join(' '))
  }
  console.log(`celdas comparadas=${compared} diferencias=${diffs}`)
  process.exitCode = diffs ? 1 : 0
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
