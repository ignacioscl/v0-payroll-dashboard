/** How the query joins CONTRATISTA (dealer) for RESTRICTION_DEALER_V2. */
export type SrsKpiDealerJoin =
  | 'invoice'
  | 'ttk'
  | 'statement'
  | 'billing'
  | 'dailyReport'

export interface SrsKpiDealerFilterSql {
  join: string
  and: string
  params: number[]
}

/**
 * Rol efectivo (PHP `$usr->rol`): Admin General / Admin Company skip RESTRICTION_DEALER_V2.
 * No abre otras compañías: el tenant sigue siendo `idDealerProvider`
 * (session para Admin General, `id_contratista_owner` para Admin Company).
 */
export const SRS_ROL_ADMIN_GENERAL = 1
export const SRS_ROL_ADMIN_COMPANY = 2

export function skipDealerRestrictionForRol(idRol: number): boolean {
  return idRol === SRS_ROL_ADMIN_GENERAL || idRol === SRS_ROL_ADMIN_COMPANY
}

/** What removedDealersProvider needs from a KPI filter or from the invoice list filter. */
export interface RemovedDealersScope {
  idDealerProvider: number
  skipDealerRestriction: boolean
  includeRemovedDealers?: boolean
}

/**
 * «Include removed dealers» (T1.7 of plans/plan-totales-income-centavos/PLAN.md): the provider whose
 * removed dealers are added, or null. Only for users that already see every dealer of their company
 * (Admin General / Admin Company); for anyone else it is always null, whatever the request says.
 * The provider is the one of the session (JWT), never one from the request.
 * The front shows the switch only when /srs/kpis/billing/removed-dealers-available says so (§4).
 */
export function removedDealersProvider(f: RemovedDealersScope): number | null {
  return f.includeRemovedDealers === true && f.skipDealerRestriction ? f.idDealerProvider : null
}

/**
 * «Removed dealer of this provider» (D8): the dealer is in DEALER_REL_REMOVED of the provider and
 * has no DEALER_REL row with it (a dealer removed and added again is back in the combo).
 * Bind `?` twice, both = the session provider.
 */
export function removedDealerOfProviderSql(dealerCol: string): string {
  return `${dealerCol} IN (SELECT drr.id_dealer_customer FROM DEALER_REL_REMOVED drr
                           WHERE drr.id_dealer_provider = ?)
             AND NOT EXISTS (SELECT 1 FROM DEALER_REL dr_rm
                             WHERE dr_rm.id_dealer_customer = ${dealerCol} AND dr_rm.id_dealer_provider = ?)`
}

/**
 * Every removed dealer (removedDealerOfProviderSql) of the provider, with its name for the provider
 * (dealerId · dealer, by name), without looking at money or dates: the screens mark every row of
 * these dealers as «Removed», a deleted invoice included (§5 of plan-totales-income-centavos, M1).
 */
export function removedDealersOfProviderListSql(idDealerProvider: number): {
  sql: string
  params: number[]
} {
  const p = idDealerProvider
  return {
    sql: `SELECT c.id AS dealerId, GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealer
          FROM CONTRATISTA c
          WHERE ${removedDealerOfProviderSql('c.id')}
          ORDER BY dealer`,
    params: [p, p, p],
  }
}

/**
 * The removed dealers (removedDealerOfProviderSql) of the provider with money in the range, with
 * their name for the provider (dealerId · dealer, by name). Same money as the reports: a WO with
 * some service with value (woHasPositiveTotalSql), dated like the reports (woPeriodColumn / Done
 * only with filterDateDone), or a statement of any type overlapping the range with some line with
 * amount. range = null: whole history («Owed, all dates»). Every table is filtered by
 * id_dealer_provider = the session provider. «Include removed dealers» shows only when there is one.
 */
export function removedDealersWithMoneySql(
  idDealerProvider: number,
  range: { fechaDesde: string; fechaHasta: string } | null,
  filterDateDone: boolean,
  doneWorkflowId: number,
): { sql: string; params: (number | string)[] } {
  const p = idDealerProvider
  const woPeriod = woPeriodColumn(filterDateDone)
  const woDates = range ? ` AND ${woPeriod} >= ? AND ${woPeriod} < DATE_ADD(?, INTERVAL 1 DAY)` : ''
  const woDateParams = range ? [range.fechaDesde, range.fechaHasta] : []
  const stDates = range ? ' AND s.fecha_desde <= ? AND s.fecha_hasta >= ?' : ''
  const stDateParams = range ? [range.fechaHasta, range.fechaDesde] : []
  const sql = `SELECT x.id_dealer AS dealerId, GET_DEALER_NAME_BY_PROVIDER(?, x.id_dealer) AS dealer
     FROM (SELECT d.id_dealer FROM INVOICE i JOIN DEPARTMENT d ON d.id = i.id_department
           WHERE i.estado = 1 AND i.id_dealer_provider = ?${woDates}
             ${woStatusFilterSql(filterDateDone, doneWorkflowId)}
             AND ${removedDealerOfProviderSql('d.id_dealer')}
             AND EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL z WHERE z.id_invoice = i.id
                         AND z.price * IFNULL(z.qty, 1) > 0)
           UNION
           SELECT s.id_dealer FROM INVOICE_STATEMENT s JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id
           WHERE s.estado = 1 AND s.id_dealer_provider = ?${stDates} AND IFNULL(r.amount, 0) > 0
             AND ${removedDealerOfProviderSql('s.id_dealer')}) x
     ORDER BY dealer`
  return {
    sql,
    params: [p, p, ...woDateParams, p, p, p, ...stDateParams, p, p],
  }
}

/**
 * WHERE fragment for dealer scope (header combo + optional RESTRICTION_DEALER_V2).
 *
 * removedDealersOf (Admin General / Admin Company only, see removedDealersProvider): also lets in
 * the dealers that provider removed with «Remove» in legacy (DEALER_REL_REMOVED, migration 017) and
 * that have no DEALER_REL row with it again (re-added ones are already in the combo). Dealers removed
 * before the record existed never enter (D8 of plans/plan-totales-income-centavos/PLAN.md §4). It never
 * widens the company: every query that uses this clause filters its data table by
 * id_dealer_provider = the session provider, so a removed dealer only brings its invoices and WO
 * with this company. Ignored for restricted users.
 */
export function buildDealerRestrictionClause(
  idUsuario: number,
  dealerIds: number[],
  skipDealerRestriction = false,
  removedDealersOf: number | null = null,
): Pick<SrsKpiDealerFilterSql, 'and' | 'params'> {
  if (dealerIds.length === 0) {
    throw new Error('At least one dealer id is required')
  }
  const placeholders = dealerIds.map(() => '?').join(',')
  if (skipDealerRestriction) {
    if (removedDealersOf !== null && Number.isInteger(removedDealersOf) && removedDealersOf > 0) {
      return {
        and: ` AND (c.id IN (${placeholders}) OR (${removedDealerOfProviderSql('c.id')}))`,
        params: [...dealerIds, removedDealersOf, removedDealersOf],
      }
    }
    return {
      and: ` AND c.id IN (${placeholders})`,
      params: [...dealerIds],
    }
  }
  return {
    and: ` AND RESTRICTION_DEALER_V2(?, c.id) = 1 AND c.id IN (${placeholders})`,
    params: [idUsuario, ...dealerIds],
  }
}

/**
 * Dealer scope from header combo: RESTRICTION_DEALER_V2 + explicit IN list.
 * Admin General / Admin Company: only IN list (mirrors PHP ProductionReportService).
 */
export function buildDealerFilterSql(
  kind: SrsKpiDealerJoin,
  idUsuario: number,
  dealerIds: number[],
  skipDealerRestriction = false,
  removedDealersOf: number | null = null,
): SrsKpiDealerFilterSql {
  const { and, params } = buildDealerRestrictionClause(
    idUsuario,
    dealerIds,
    skipDealerRestriction,
    removedDealersOf,
  )

  switch (kind) {
    case 'invoice':
      return {
        join: ' JOIN DEPARTMENT d ON d.id = i.id_department JOIN CONTRATISTA c ON c.id = d.id_dealer',
        and,
        params,
      }
    case 'ttk':
      return {
        join: ' JOIN CONTRATISTA c ON c.id = tew.id_dealer',
        and,
        params,
      }
    case 'statement':
      return {
        join: ' JOIN CONTRATISTA c ON c.id = s.id_dealer',
        and,
        params,
      }
    case 'billing':
      return {
        join: ' JOIN CONTRATISTA c ON c.id = b.id_dealer',
        and,
        params,
      }
    case 'dailyReport':
      return {
        join: ' JOIN CONTRATISTA c ON c.id = ldr.id_dealer',
        and,
        params,
      }
  }
}

/** WO date column: Done (legacy chk_date_type=1) vs created (fecha_alta). */
export function woPeriodColumn(filterDateDone: boolean, alias = 'i'): string {
  return filterDateDone
    ? `DATE(${alias}.date_last_chg_workflow)`
    : `DATE(${alias}.fecha_alta)`
}

/** Monday of the calendar week for a SQL date expression (MySQL WEEKDAY: Mon=0). */
export function mysqlWeekStartExpr(dateExpr: string): string {
  return `DATE(DATE_SUB(${dateExpr}, INTERVAL WEEKDAY(${dateExpr}) DAY))`
}

/**
 * Week bucket for KPI charts: ISO Monday, but never before filter fechaDesde
 * (avoids "Apr 27" label when the range starts May 1).
 * Bind `?` = fechaDesde.
 */
export function mysqlWeekBucketStartExpr(dateExpr: string): string {
  return `GREATEST(${mysqlWeekStartExpr(dateExpr)}, ?)`
}

/** Period filter for completed-WO metrics (legacy: date_last_chg_workflow when Filter Date DONE). */
export function woCompletedPeriodColumn(filterDateDone: boolean): string {
  return woPeriodColumn(filterDateDone)
}

/** When Filter Date DONE: only WOs in Done workflow; otherwise any active workflow. */
export function woStatusFilterSql(
  filterDateDone: boolean,
  doneWorkflowId: number,
  alias = 'i',
): string {
  return filterDateDone ? ` AND ${alias}.id_workflow = ${doneWorkflowId}` : ''
}

/**
 * Latest Done transition per WO, scoped to the provider + period so the log subquery
 * does not aggregate the full LOG_WO_WORKFLOW_CHANGE table (see KPI-QUERIES.md §1.2).
 * Bind params before the outer invoice filters: idDealerProvider, fechaDesde, fechaHasta.
 */
export function woDoneAtJoinScoped(doneWorkflowId: number, filterDateDone: boolean): string {
  const periodCol = filterDateDone ? 'DATE(i2.date_last_chg_workflow)' : 'DATE(i2.fecha_alta)'
  return `
    LEFT JOIN (
      SELECT lw.id_work_order, MAX(lw.fecha) AS done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw
      INNER JOIN INVOICE i2
        ON i2.id = lw.id_work_order
       AND i2.estado = 1
       AND i2.id_workflow = ${doneWorkflowId}
       AND i2.id_dealer_provider = ?
       AND ${periodCol} BETWEEN ? AND ?
      WHERE lw.id_workflow = ${doneWorkflowId}
      GROUP BY lw.id_work_order
    ) done ON done.id_work_order = i.id`
}

/** Latest Done transition per WO — unscoped; avoid on large KPI aggregates. */
export function woDoneAtJoin(doneWorkflowId: number): string {
  return `
    LEFT JOIN (
      SELECT lw.id_work_order, MAX(lw.fecha) AS done_at
      FROM LOG_WO_WORKFLOW_CHANGE lw
      WHERE lw.id_workflow = ${doneWorkflowId}
      GROUP BY lw.id_work_order
    ) done ON done.id_work_order = i.id`
}

export function parseDealerIds(raw?: string): number[] {
  if (!raw?.trim()) return []
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export function parseFilterDateDone(raw?: string | boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return false
  if (typeof raw === 'boolean') return raw
  return raw === '1' || raw.toLowerCase() === 'true'
}

/** Default false — legacy excludes zero-value WO/invoice rows unless explicitly included. */
export function parseIncludeZero(raw?: string | boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return false
  if (typeof raw === 'boolean') return raw
  return raw === '1' || raw.toLowerCase() === 'true'
}
