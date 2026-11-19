import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import {
  buildDealerFilterSql,
  removedDealersOfProviderListSql,
  removedDealersProvider,
} from '../../shared/kpi/srs-kpi-dealer-filter'
import { bindSqlParams, valuedLinesCtesSql } from '../invoice-valued-lines-sql'
import type { OpenInvoiceSqlRow } from '../open-invoice-aging'

/** What the Open Invoices query needs (the provider and the user always come from the session). */
export type OpenInvoicesFilter = {
  idDealerProvider: number
  idUsuario: number
  dealerIds: number[]
  skipDealerRestriction: boolean
  includeRemovedDealers: boolean
  /** The «As of» Sunday, `YYYY-MM-DD`. */
  asOf: string
}

/** Ids per batch of an `IN (…)` list (§4.2, T6/T7). */
export const OPEN_INVOICES_IN_BATCH = 1000

/** Invoices per run of the engine (every dealer of Auto Wax: ~5,500 candidates on 11/17/2026). */
export const OPEN_INVOICES_ENGINE_BATCH = 5000

function ymd(value: unknown): string {
  return value == null ? '' : String(value).slice(0, 10)
}

function nullableYmd(value: unknown): string | null {
  const s = ymd(value)
  return s === '' || s.startsWith('0000') ? null : s
}

function intList(ids: readonly number[]): string {
  return ids.map((id) => Math.trunc(Number(id))).join(',')
}

function batches<T>(items: readonly T[], size = OPEN_INVOICES_IN_BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Reports › Open Invoices (T2 of plans/plan-reporte-javier/PLAN.md): read-only report SQL on the SRS
 * connection. Every table is filtered by the session provider (rule tenant-scope-every-query).
 */
@Injectable()
export class OpenInvoicesRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  /**
   * One row per invoice × department × position with its open amount (§3.1, §3.2, §3.4):
   * - candidates: active invoices of the company and of the dealers of the combo (or removed ones with
   *   the switch), that entered by the «As of» Sunday (WO created by then; TTK and Generic with DATE TO
   *   by then), and that still have some line with no active payment (neither of the whole invoice nor
   *   of the line). They limit the engine before its window functions.
   * - Two steps, not one CTE: MariaDB evaluates a CTE again each time it is used, and the engine uses it
   *   four times (pl, ps, fac, lin): 72 s with every dealer of Auto Wax against 11 s in two steps
   *   (local copy, 11/17/2026). Same result: the engine works invoice by invoice, so the batches of ids
   *   do not change a cent.
   * - the shared engine (T1) values their lines; `row_kind = 1` keeps the lines without an active
   *   payment today, `neto_linea` is their open money (discount and tax included).
   * - TTK and Generic lines without department are split by position: the role of the punch
   *   (`P:<role>`) or `G` for a free line of a Generic invoice.
   */
  async openRows(f: OpenInvoicesFilter): Promise<OpenInvoiceSqlRow[]> {
    const dealer = buildDealerFilterSql(
      'statement',
      f.idUsuario,
      f.dealerIds,
      f.skipDealerRestriction,
      removedDealersProvider(f),
    )
    const cand =
      ' SELECT s.id AS sid FROM INVOICE_STATEMENT s ' +
      dealer.join +
      ' WHERE s.id_dealer_provider = :prov AND s.estado = 1 ' +
      '   AND (CASE WHEN s.statement_type IN (5,6) AND s.fecha_hasta IS NOT NULL ' +
      '             THEN s.fecha_hasta <= ? ' +
      '             ELSE s.fecha_create < DATE_ADD(?, INTERVAL 1 DAY) END) ' +
      dealer.and +
      '   AND NOT EXISTS (SELECT 1 FROM BILLING_WO_REL bw ' +
      '        JOIN BILLING b ON b.id = bw.id_billing AND b.estado = 1 AND b.id_dealer_provider = :prov ' +
      '        WHERE bw.id_statement = s.id) ' +
      '   AND EXISTS (SELECT 1 FROM INVOICE_STATEMENT_INV_REL r ' +
      '        WHERE r.id_statement = s.id AND IFNULL(r.only_timecard, 0) = 0 ' +
      '          AND NOT EXISTS (SELECT 1 FROM BILLING_WO_REL bw ' +
      '               JOIN BILLING b ON b.id = bw.id_billing AND b.estado = 1 AND b.id_dealer_provider = :prov ' +
      '               WHERE bw.id_statement_inv_rel = r.id) ' +
      // Only invoices that can owe something: an unpaid line with a list amount other than 0, or some
      // line paid on its own (the balance row of a partly paid invoice can keep a cent of rounding).
      // Without either, every row is a balance row of lines at $0: the engine gives exactly $0.
      '          AND (IFNULL(r.amount, 0) <> 0 ' +
      '               OR EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL isr WHERE isr.id_invoice = r.id_invoice ' +
      '                          AND isr.id_service_invoice = r.id_invoice_service AND isr.price * IFNULL(isr.qty, 1) <> 0) ' +
      '               OR EXISTS (SELECT 1 FROM INVOICE_STATEMENT_INV_REL r2 ' +
      '                          JOIN BILLING_WO_REL bw2 ON bw2.id_statement_inv_rel = r2.id ' +
      '                          JOIN BILLING b2 ON b2.id = bw2.id_billing AND b2.estado = 1 AND b2.id_dealer_provider = :prov ' +
      '                          WHERE r2.id_statement = s.id))) '
    const puestoKey =
      " CASE WHEN l.dept = 0 AND l.statement_type IN (5,6) THEN " +
      "      CASE WHEN l.id_employee_work IS NULL THEN 'G' " +
      "           ELSE CONCAT('P:', IFNULL(l.puesto, '')) END " +
      ' END '
    const candBound = bindSqlParams(cand, f.idDealerProvider, [f.asOf, f.asOf, ...dealer.params])
    const candRows: { sid: unknown }[] = await this.srs.query(candBound.sql, candBound.params)
    const sids = candRows.map((r) => Number(r.sid))
    const rows: Record<string, unknown>[] = []
    for (const part of batches(sids, OPEN_INVOICES_ENGINE_BATCH)) {
      const sql =
        ' WITH ' +
        valuedLinesCtesSql({ statementIds: part }, ` AND s.id IN (${intList(part)}) `) +
        ' SELECT l.sid, l.id_dealer, l.statement_type, l.full_nro, l.fecha_desde, l.fecha_hasta, ' +
        '        DATE(l.statement_fecha_create) AS fecha_create, l.dept, dp.nombre AS department, ' +
        `        ${puestoKey} AS puesto_key, ` +
        "        GROUP_CONCAT(DISTINCT l.service_name ORDER BY l.service_name SEPARATOR ', ') AS services, " +
        '        ROUND(SUM(l.neto_linea), 2) AS open_amount ' +
        ' FROM lineas l ' +
        ' LEFT JOIN DEPARTMENT dp ON dp.id = l.dept ' +
        ' WHERE l.row_kind = 1 ' +
        ' GROUP BY l.sid, l.id_dealer, l.statement_type, l.full_nro, l.fecha_desde, l.fecha_hasta, ' +
        `          DATE(l.statement_fecha_create), l.dept, dp.nombre, ${puestoKey} ` +
        ' HAVING open_amount <> 0 '
      const bound = bindSqlParams(sql, f.idDealerProvider)
      rows.push(...((await this.srs.query(bound.sql, bound.params)) as Record<string, unknown>[]))
    }
    return rows.map((r) => ({
      sid: Number(r.sid),
      fullNro: String(r.full_nro ?? ''),
      dealerId: Number(r.id_dealer),
      statementType: Number(r.statement_type),
      createdYmd: ymd(r.fecha_create),
      dateFromYmd: nullableYmd(r.fecha_desde),
      dateToYmd: nullableYmd(r.fecha_hasta),
      deptId: Number(r.dept ?? 0),
      deptName: r.department == null ? null : String(r.department),
      puestoKey: r.puesto_key == null ? null : String(r.puesto_key),
      services: String(r.services ?? ''),
      amount: Number(r.open_amount ?? 0),
    }))
  }

  /** «Payment Due On» of each dealer for the company (DEALER_REL.due_on); a dealer without row → null. */
  async dueOnByDealer(idDealerProvider: number, dealerIds: readonly number[]): Promise<Map<number, number | null>> {
    const out = new Map<number, number | null>()
    const ids = [...new Set(dealerIds)]
    for (const part of batches(ids)) {
      const rows: { id: unknown; dueOn: unknown }[] = await this.srs.query(
        `SELECT dr.id_dealer_customer AS id, MAX(dr.due_on) AS dueOn
         FROM DEALER_REL dr
         WHERE dr.id_dealer_provider = ? AND dr.id_dealer_customer IN (${intList(part)})
         GROUP BY dr.id_dealer_customer`,
        [idDealerProvider],
      )
      for (const r of rows) out.set(Number(r.id), r.dueOn == null ? null : Number(r.dueOn))
    }
    return out
  }

  /**
   * Dealer names for the company (GET_DEALER_NAME_BY_PROVIDER, rule dealer-display-name-by-provider).
   * Only for ids that came out of a query already scoped to the session.
   */
  async dealerNames(idDealerProvider: number, dealerIds: readonly number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    const ids = [...new Set(dealerIds)].filter((id) => id > 0)
    for (const part of batches(ids)) {
      const rows: { id: unknown; name: unknown }[] = await this.srs.query(
        `SELECT c.id AS id, GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS name
         FROM CONTRATISTA c WHERE c.id IN (${intList(part)})`,
        [idDealerProvider],
      )
      for (const r of rows) out.set(Number(r.id), String(r.name ?? r.id))
    }
    return out
  }

  /** Every removed dealer of the company (rule include-removed-dealers): the rows are marked «(removed)». */
  async removedDealersOfProvider(idDealerProvider: number): Promise<{ dealerId: number; dealer: string }[]> {
    const q = removedDealersOfProviderListSql(idDealerProvider)
    const rows: { dealerId: unknown; dealer: unknown }[] = await this.srs.query(q.sql, q.params)
    return rows.map((r) => ({ dealerId: Number(r.dealerId), dealer: String(r.dealer ?? '') }))
  }

  /**
   * Active payments (BILLING.estado = 1) linked to each invoice, of the whole invoice or of one of its
   * lines, at this moment (§3.6, `payments_json`). In batches of 1,000 ids.
   */
  async activeBillingIdsBySid(idDealerProvider: number, sids: readonly number[]): Promise<Map<number, number[]>> {
    const out = new Map<number, number[]>()
    for (const part of batches([...new Set(sids)])) {
      const list = intList(part)
      const rows: { sid: unknown; idBilling: unknown }[] = await this.srs.query(
        `SELECT x.sid, x.id_billing AS idBilling FROM (
           SELECT bw.id_statement AS sid, bw.id_billing FROM BILLING_WO_REL bw
           WHERE bw.id_statement IN (${list})
           UNION
           SELECT r.id_statement AS sid, bw.id_billing FROM BILLING_WO_REL bw
           JOIN INVOICE_STATEMENT_INV_REL r ON r.id = bw.id_statement_inv_rel
           WHERE r.id_statement IN (${list})
         ) x
         JOIN BILLING b ON b.id = x.id_billing AND b.estado = 1 AND b.id_dealer_provider = ?
         ORDER BY x.sid, x.id_billing`,
        [idDealerProvider],
      )
      for (const r of rows) {
        const sid = Number(r.sid)
        const list2 = out.get(sid) ?? []
        list2.push(Number(r.idBilling))
        out.set(sid, list2)
      }
    }
    return out
  }
}
