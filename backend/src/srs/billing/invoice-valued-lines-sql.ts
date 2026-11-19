/**
 * The valued-lines engine of the invoice list, in one place (T1 of plans/plan-reporte-javier/PLAN.md).
 *
 * It is the literal copy of legacy InvoiceStatementLineDao::buildSql that lived inside
 * InvoiceRepository.exportWoValuedLines (plans/plan-export-invoices-nest §8.6): the CTEs
 * `pl, ps, fac, lin, raw, filas, inv, objetivo, lineas`, with the cumulative rounding inside each row
 * of the list (`neto_linea`, same as migration 006). Two callers, both on a list of invoice ids:
 * - the «Invoice with Wo Details» Excel (exportWoValuedLines);
 * - Reports › Open Invoices (open-invoices.repository.ts), on its candidates.
 *
 * `lin` also exposes `puesto` (TRIM of the punch's role, frozen by TRG_TTK_EMPLOYEE_WORK when the
 * employee punched): Open Invoices splits Timesheets by it (§3.4). No CTE below uses it to calculate,
 * so the money is the same with or without it.
 *
 * Named param `:prov` = the session provider; bind it with bindSqlParams.
 */

/** The invoices the engine values. */
export type ValuedLinesScope = { statementIds: number[] }

/** Extra column of `lin` added for Open Invoices (T1, v6). Kept apart so a spec can check it is the only change. */
export const VALUED_LINES_PUESTO_COLUMN = ' , TRIM(tew.role) AS puesto '

function scopeIn(scope: ValuedLinesScope): string {
  return scope.statementIds.map((id) => Math.trunc(Number(id))).join(',')
}

/**
 * The CTE list, without the leading `WITH` (the caller adds it). `linWhere` is appended to the WHERE
 * of `lin` as is: the id list and any screen filter.
 */
export function valuedLinesCtesSql(scope: ValuedLinesScope, linWhere: string): string {
  const ids = scopeIn(scope)
  const pl =
    ' SELECT DISTINCT bw.id_statement_inv_rel AS rel, bw.id_billing, bw.nro_billed ' +
    ' FROM BILLING_WO_REL bw ' +
    ' JOIN BILLING b ON b.id = bw.id_billing AND b.estado = 1 AND b.id_dealer_provider = :prov ' +
    ` JOIN INVOICE_STATEMENT_INV_REL lr ON lr.id = bw.id_statement_inv_rel AND lr.id_statement IN (${ids}) ` +
    ' WHERE bw.id_statement_inv_rel IS NOT NULL '
  const ps =
    ' SELECT DISTINCT bw.id_statement AS sid, bw.id_billing ' +
    ' FROM BILLING_WO_REL bw ' +
    ' JOIN BILLING b ON b.id = bw.id_billing AND b.estado = 1 AND b.id_dealer_provider = :prov ' +
    ' WHERE bw.id_statement IS NOT NULL ' +
    ` AND bw.id_statement IN (${ids}) `
  const fac =
    ' SELECT s.id AS sid, ' +
    '   CASE WHEN s.discount_type = 2 THEN IFNULL(1 - s.discount / NULLIF(GET_SUBTOTAL_BY_STATEMENT(s.id, NULL), 0), 1) ' +
    '        ELSE 1 - 0.01 * s.discount END AS factor ' +
    ' FROM INVOICE_STATEMENT s ' +
    ' WHERE s.id_dealer_provider = :prov AND s.estado = 1 AND IFNULL(s.discount, 0) <> 0 ' +
    ` AND s.id IN (${ids}) ` +
    ' GROUP BY s.id '
  const lin =
    ' SELECT s.id AS sid, s.full_nro, s.statement_type, s.id_dealer, s.id_dealer_provider ' +
    ' , s.fecha_create AS statement_fecha_create, s.fecha_desde, s.fecha_hasta, s.id_department AS statement_id_department ' +
    ' , s.discount, s.discount_type, s.discount_detail, s.tax, s.invoice_service_sel_rel, s.id_author AS statement_id_author ' +
    ' , r.id AS rel_id, r.fecha_create AS rel_fecha_create, r.description, r.generic_qty, r.amount, r.id_employee_work ' +
    ' , i.id AS id_invoice, i.full_nro AS wo_full_nro, i.wo_nro, i.fecha_alta, i.ro, i.po, i.stock_number, i.tag ' +
    ' , sv.id AS id_service, sv.nombre AS service_name, sv.id_department AS service_id_department ' +
    ' , isr.price, isr.qty, isr.piecework, isr.comentario ' +
    ' , tew.id_author AS ttk_author, ua.nombre AS ttk_author_name ' +
    ' , NULL AS ttk_hours ' +
    ' , c.vin, c.color, c.year, make.nombre AS make_nombre, model.nombre AS model_nombre ' +
    ' , approver.nombre AS approver_name, sd.nombre AS service_department_name ' +
    " , CASE WHEN s.statement_type IN (1,2,3,4) THEN 'wo' WHEN r.id_employee_work IS NOT NULL THEN 'ttk' ELSE 'generic' END AS line_type " +
    ' , (CASE WHEN s.statement_type IN (1,2,3,4) THEN isr.price * IFNULL(isr.qty, 1) ' +
    '         WHEN r.id_employee_work IS NOT NULL THEN IFNULL(r.amount, 0) ' +
    '         ELSE IFNULL(r.generic_qty, 1) * IFNULL(r.amount, 0) END) AS lista ' +
    ' , (CASE WHEN s.statement_type = 6 THEN 1 + IFNULL(s.tax, 0) / 100 ELSE 1 END) AS tax_factor ' +
    ' , IFNULL(fac.factor, 1) AS factor ' +
    ' , COALESCE(sv.id_department, s.id_department, 0) AS dept ' +
    ' , CASE WHEN pl.id_billing IS NOT NULL THEN 3 WHEN ps.id_billing IS NOT NULL THEN 2 ELSE 1 END AS row_kind ' +
    ' , COALESCE(pl.id_billing, ps.id_billing) AS id_billing ' +
    ' , CASE WHEN pl.id_billing IS NOT NULL THEN pl.nro_billed WHEN ps.id_billing IS NOT NULL THEN 1 END AS nro_billed ' +
    VALUED_LINES_PUESTO_COLUMN +
    ' FROM INVOICE_STATEMENT s ' +
    ' JOIN INVOICE_STATEMENT_INV_REL r ON r.id_statement = s.id AND IFNULL(r.only_timecard, 0) = 0 ' +
    ' LEFT JOIN INVOICE i ON i.id = r.id_invoice AND i.estado = 1 AND i.id_dealer_provider = :prov ' +
    ' LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id AND isr.id_service_invoice = r.id_invoice_service ' +
    ' LEFT JOIN INVOICE_SERVICE sv ON sv.id = r.id_invoice_service ' +
    ' LEFT JOIN TTK_EMPLOYEE_WORK tew ON tew.id = r.id_employee_work AND tew.estado = 1 AND tew.id_dealer_provider = :prov ' +
    ' LEFT JOIN usuarios ua ON ua.id_usuario = tew.id_author ' +
    ' LEFT JOIN CAR c ON c.id = i.id_car ' +
    ' LEFT JOIN datos_parametricos make ON make.id_dato_parametrico = c.id_make ' +
    ' LEFT JOIN datos_parametricos model ON model.id_dato_parametrico = c.id_model ' +
    ' LEFT JOIN usuarios approver ON approver.id_usuario = i.id_approver ' +
    ' LEFT JOIN DEPARTMENT sd ON sd.id = sv.id_department ' +
    ' LEFT JOIN fac ON fac.sid = s.id ' +
    ' LEFT JOIN pl ON pl.rel = r.id ' +
    ' LEFT JOIN ps ON ps.sid = s.id ' +
    ' WHERE s.id_dealer_provider = :prov AND s.estado = 1 ' +
    ' AND ((s.statement_type IN (1,2,3,4) AND isr.id IS NOT NULL) ' +
    '   OR (s.statement_type = 5 AND tew.id IS NOT NULL) ' +
    '   OR (s.statement_type = 6 AND (r.id_employee_work IS NULL OR tew.id IS NOT NULL))) ' +
    ' AND (s.statement_type NOT IN (1,2,3,4) OR NOT EXISTS ( ' +
    '     SELECT 1 FROM INVOICE_STATEMENT_INV_REL e ' +
    '     JOIN INVOICE_STATEMENT es ON es.id = e.id_statement AND es.estado = 1 AND es.id_dealer_provider = :prov ' +
    '     WHERE e.id_invoice = r.id_invoice AND e.id_invoice_service = r.id_invoice_service ' +
    '       AND e.id_statement < r.id_statement AND IFNULL(e.only_timecard, 0) = 0)) ' +
    linWhere
  return (
    ` pl AS (${pl}), ` +
    ` ps AS (${ps}), ` +
    ` fac AS (${fac}), ` +
    ` lin AS (${lin}), ` +
    ' raw AS ( ' +
    '   SELECT l.*, l.lista * l.tax_factor AS precio_tax, l.lista * l.tax_factor * l.factor AS neto_raw ' +
    '   , SUM(l.lista * l.tax_factor * l.factor) OVER (PARTITION BY l.sid, l.row_kind, l.id_billing, l.nro_billed ' +
    '       ORDER BY l.wo_nro, l.rel_id ROWS UNBOUNDED PRECEDING) AS acum ' +
    '   , SUM(l.lista * l.tax_factor * l.factor) OVER (PARTITION BY l.sid, l.row_kind, l.id_billing, l.nro_billed) AS fila_raw ' +
    '   , ROW_NUMBER() OVER (PARTITION BY l.sid, l.row_kind, l.id_billing, l.nro_billed ORDER BY l.wo_nro DESC, l.rel_id DESC) AS desde_el_final ' +
    '   FROM lin l ), ' +
    ' filas AS ( SELECT sid, row_kind, id_billing, nro_billed, SUM(neto_raw) AS fila_raw, ROUND(SUM(neto_raw), 2) AS fila_red ' +
    '   FROM raw GROUP BY sid, row_kind, id_billing, nro_billed ), ' +
    ' inv AS ( SELECT sid, ROUND(SUM(fila_raw), 2) AS inv_total, SUM(CASE WHEN row_kind <> 1 THEN fila_red ELSE 0 END) AS cobrado ' +
    '   FROM filas GROUP BY sid ), ' +
    ' objetivo AS ( SELECT f.sid, f.row_kind, f.id_billing, f.nro_billed ' +
    '   , CASE WHEN f.row_kind = 1 THEN inv.inv_total - inv.cobrado ELSE f.fila_red END AS listado ' +
    '   FROM filas f JOIN inv ON inv.sid = f.sid ), ' +
    ' lineas AS ( SELECT r.*, o.listado AS fila_listado ' +
    '   , ROUND(r.acum, 2) - ROUND(r.acum - r.neto_raw, 2) ' +
    '     + CASE WHEN r.desde_el_final = 1 THEN o.listado - ROUND(r.fila_raw, 2) ELSE 0 END AS neto_linea ' +
    '   FROM raw r JOIN objetivo o ON o.sid = r.sid AND o.row_kind = r.row_kind ' +
    '     AND o.id_billing <=> r.id_billing AND o.nro_billed <=> r.nro_billed ) '
  )
}

/**
 * Binds a SQL with positional `?` and the named `:prov` (the legacy SQL repeats it) into one
 * positional list, in the order they appear: each `?` takes the next of `positional`, each `:prov`
 * the provider. Throws if the counts do not match, so a missing param never shifts the others.
 */
export function bindSqlParams(
  sql: string,
  idDealerProvider: number,
  positional: readonly unknown[] = [],
): { sql: string; params: unknown[] } {
  const params: unknown[] = []
  let next = 0
  const out = sql.replace(/\?|:prov\b/g, (token) => {
    if (token === '?') {
      if (next >= positional.length) throw new Error('bindSqlParams: fewer params than placeholders')
      params.push(positional[next++])
    } else {
      params.push(idDealerProvider)
    }
    return '?'
  })
  if (next !== positional.length) throw new Error('bindSqlParams: more params than placeholders')
  return { sql: out, params }
}
