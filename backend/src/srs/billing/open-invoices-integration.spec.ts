/**
 * Reports › Open Invoices against the local copy of PROD (§7.2 and §7.4 of plans/plan-reporte-javier/PLAN.md).
 * Read only. Skips itself, with a warning, when the database is not the local copy.
 *
 * Certification of the money (rule «queries de plata certificadas»): the report's query (shared engine,
 * T1 + T2) against an independent control that does not use the engine — GET_STATEMENT_ROW_AMOUNTS kind 1
 * (balance today, migration 006) of the same invoices — dealer by dealer, to the cent.
 */
import 'dotenv/config'
import { DataSource } from 'typeorm'

import { srsDataSourceOptions } from 'src/srs/srs.datasource'
import { OpenInvoicesRepository, type OpenInvoicesFilter } from './repository/open-invoices.repository'
import { bindSqlParams, valuedLinesCtesSql } from './invoice-valued-lines-sql'
import { moneyToCents } from '../shared/kpi/srs-kpi-row-money'

const LOCAL_COPY = 'srssui5_srs_20261112'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) console.warn(`SKIPPED open-invoices-integration.spec.ts: the database is not the local copy ${LOCAL_COPY} on 127.0.0.1:3307`)
const describeIf = ready ? describe : describe.skip

const AUTO_WAX = 79
const AUTO_WAX_ADMIN = 76
/** The 15 AutoNation dealers of Tammy's sheet (consultas/control-independiente-006-saldo-hoy.sql). */
const AUTONATION = [903, 286, 344, 664, 353, 86, 627, 301, 85, 364, 628, 76, 744, 665, 78]

function filter(asOf: string, dealerIds: number[]): OpenInvoicesFilter {
  return {
    idDealerProvider: AUTO_WAX,
    idUsuario: AUTO_WAX_ADMIN,
    dealerIds,
    skipDealerRestriction: true,
    includeRemovedDealers: false,
    asOf,
  }
}

/** Independent control: balance today of each invoice that entered by the Sunday, by dealer, in cents. */
async function controlByDealer(srs: DataSource, asOf: string, dealerIds: number[]): Promise<Map<number, number>> {
  const rows: { dealer: unknown; total: unknown }[] = await srs.query(
    `SELECT s.id_dealer AS dealer,
            ROUND(SUM(JSON_VALUE(GET_STATEMENT_ROW_AMOUNTS(?, s.id, 1, NULL, NULL), '$.total')), 2) AS total
     FROM INVOICE_STATEMENT s
     WHERE s.id_dealer_provider = ? AND s.estado = 1
       AND (CASE WHEN s.statement_type IN (5,6) AND s.fecha_hasta IS NOT NULL THEN s.fecha_hasta <= ?
                 ELSE s.fecha_create < DATE_ADD(?, INTERVAL 1 DAY) END)
       AND s.id_dealer IN (${dealerIds.join(',')})
     GROUP BY s.id_dealer`,
    [AUTO_WAX, AUTO_WAX, asOf, asOf],
  )
  return new Map(rows.map((r) => [Number(r.dealer), moneyToCents(r.total)]))
}

function centsByDealer(rows: { dealerId: number; amount: number }[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of rows) out.set(r.dealerId, (out.get(r.dealerId) ?? 0) + moneyToCents(r.amount))
  return out
}

function diffs(a: Map<number, number>, b: Map<number, number>): string[] {
  const ids = new Set([...a.keys(), ...b.keys()])
  const out: string[] = []
  for (const id of ids) {
    if ((a.get(id) ?? 0) !== (b.get(id) ?? 0)) out.push(`${id}: report ${(a.get(id) ?? 0) / 100} vs control ${(b.get(id) ?? 0) / 100}`)
  }
  return out
}

describeIf('Open Invoices — integration against the local copy (read only)', () => {
  let srs: DataSource
  let repo: OpenInvoicesRepository

  beforeAll(async () => {
    srs = new DataSource({ ...srsDataSourceOptions, name: 'open-invoices-it', logging: false } as never)
    await srs.initialize()
    repo = new OpenInvoicesRepository(srs)
  }, 60_000)

  afterAll(async () => {
    await srs?.destroy()
  })

  it.each(['2026-09-27', '2026-11-08'])(
    'As of %s, 15 AutoNation: each dealer to the cent against GET_STATEMENT_ROW_AMOUNTS kind 1',
    async (asOf) => {
      const rows = await repo.openRows(filter(asOf, AUTONATION))
      const control = await controlByDealer(srs, asOf, AUTONATION)
      const report = centsByDealer(rows)
      // The control also has the invoices with balance 0: drop them before comparing.
      for (const [id, c] of control) if (c === 0) control.delete(id)
      expect(diffs(report, control)).toEqual([])
      const total = [...report.values()].reduce((s, c) => s + c, 0)
      console.log(`As of ${asOf}, 15 AutoNation: ${rows.length} rows, $${(total / 100).toFixed(2)}`)
    },
    300_000,
  )

  it('As of 2026-11-08, every dealer of Auto Wax: each dealer to the cent, and the time', async () => {
    const all: { id: unknown }[] = await srs.query(
      'SELECT dr.id_dealer_customer AS id FROM DEALER_REL dr WHERE dr.id_dealer_provider = ? AND dr.estado = 1 AND dr.fecha_end IS NULL',
      [AUTO_WAX],
    )
    const ids = all.map((r) => Number(r.id))
    const t0 = Date.now()
    const rows = await repo.openRows(filter('2026-11-08', ids))
    const ms = Date.now() - t0
    console.log(`As of 2026-11-08, ${ids.length} dealers: ${rows.length} rows in ${ms} ms`)
    const control = await controlByDealer(srs, '2026-11-08', ids)
    for (const [id, c] of control) if (c === 0) control.delete(id)
    expect(diffs(centsByDealer(rows), control)).toEqual([])
    expect(ms).toBeLessThan(30_000)
  }, 600_000)

  it('As of 2026-11-08: the TTK of the week created after the Sunday enter; no Generic with DATE TO after it', async () => {
    // In this copy the TTK of the week 09/21–09/27 are already paid; the week 11/02–11/08 is not.
    const rows = await repo.openRows(filter('2026-11-08', AUTONATION))
    const ttkCreatedAfter = rows.filter((r) => r.statementType === 5 && r.createdYmd > '2026-11-08')
    expect(ttkCreatedAfter.length).toBeGreaterThan(0)
    expect(ttkCreatedAfter.every((r) => r.dateToYmd != null && r.dateToYmd <= '2026-11-08')).toBe(true)
    expect(rows.every((r) => !(r.statementType === 6 && r.dateToYmd != null && r.dateToYmd > '2026-11-08'))).toBe(true)
  }, 300_000)

  it('Timesheets split by position adds up to the same Timesheets of before (v5) to the cent', async () => {
    const f = filter('2026-09-27', AUTONATION)
    const rows = await repo.openRows(f)
    const split = rows.filter((r) => r.puestoKey != null).reduce((s, r) => s + moneyToCents(r.amount), 0)
    // v5: the open TTK and Generic lines without department of the same invoices, in one row, with the same engine.
    const sids = [...new Set(rows.filter((r) => r.puestoKey != null).map((r) => r.sid))]
    const sql =
      ' WITH ' +
      valuedLinesCtesSql({ statementIds: sids }, ` AND s.id IN (${sids.join(',')}) `) +
      ' SELECT ROUND(SUM(t.m), 2) AS total FROM (SELECT ROUND(SUM(l.neto_linea), 2) AS m FROM lineas l ' +
      '   WHERE l.row_kind = 1 AND l.dept = 0 AND l.statement_type IN (5,6) GROUP BY l.sid) t'
    const b = bindSqlParams(sql, AUTO_WAX)
    const v5: { total: unknown }[] = await srs.query(b.sql, b.params)
    expect(split).toBe(moneyToCents(v5[0]?.total))
    expect(rows.some((r) => r.puestoKey != null && r.puestoKey.startsWith('P:') && r.puestoKey.length > 2)).toBe(true)
  }, 300_000)
})
