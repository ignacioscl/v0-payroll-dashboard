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

/** Legacy usuarios.id_rol — Admin General / Admin Company skip RESTRICTION_DEALER_V2 (PHP reports). */
export const SRS_ROL_ADMIN_GENERAL = 1
export const SRS_ROL_ADMIN_COMPANY = 2

export function skipDealerRestrictionForRol(idRol: number): boolean {
  return idRol === SRS_ROL_ADMIN_GENERAL || idRol === SRS_ROL_ADMIN_COMPANY
}

/** WHERE fragment for dealer scope (header combo + optional RESTRICTION_DEALER_V2). */
export function buildDealerRestrictionClause(
  idUsuario: number,
  dealerIds: number[],
  skipDealerRestriction = false,
): Pick<SrsKpiDealerFilterSql, 'and' | 'params'> {
  if (dealerIds.length === 0) {
    throw new Error('At least one dealer id is required')
  }
  const placeholders = dealerIds.map(() => '?').join(',')
  if (skipDealerRestriction) {
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
): SrsKpiDealerFilterSql {
  const { and, params } = buildDealerRestrictionClause(idUsuario, dealerIds, skipDealerRestriction)

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
export function woPeriodColumn(filterDateDone: boolean): string {
  return filterDateDone ? 'DATE(i.date_last_chg_workflow)' : 'DATE(i.fecha_alta)'
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
export function woStatusFilterSql(filterDateDone: boolean, doneWorkflowId: number): string {
  return filterDateDone ? ` AND i.id_workflow = ${doneWorkflowId}` : ''
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
  if (raw === undefined || raw === null || raw === '') return true
  if (typeof raw === 'boolean') return raw
  return raw === '1' || raw.toLowerCase() === 'true'
}
