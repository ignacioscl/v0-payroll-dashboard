import { sqlMarks } from '../shared/mysql-result'
import {
  INVOICE_TYPE_BY_SERVICES,
  INVOICE_TYPE_SELECTED_SERVICES,
  WORKFLOW_COMPLETED,
  WoInvoiceType,
} from './dto/wo-to-be-billed.dto'

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T4 y D3): **una sola función arma el filtro** para la lista, el
 * total, la cuenta previa y la generación, así «N work orders» coincide con lo facturado (§3, pregunta 1).
 *
 * Copia literal de las ramas de legacy (`InvoiceDao::getWhere`, `public/php/dao/InvoiceDao.php:19-229`, con lo que
 * arma la solapa en `public/modulos/billing/api/api.datatable.php:54-89`), con todo valor por parámetro: no hay
 * `dynamicWhere` ni texto del navegador en el SQL.
 */

/** El filtro ya validado (DTO + service): el dealer en alcance y departments / services del dealer y de la empresa. */
export type WoToBeBilledFilter = {
  idDealerProvider: number
  idDealer: number
  dateFrom: string
  dateTo: string
  status: number[]
  departments: number[]
  services: number[]
  invoiceType: WoInvoiceType | null
  includeZero: boolean
  approved: '' | '0' | '1'
  wo: string | null
  stock: string | null
  price: number | null
  ro: string | null
  po: string | null
  /** Solo al generar y en la cuenta previa: se suman al filtro, no lo reemplazan (`InvoiceDao.php:24-26`). */
  woIds: number[]
}

export type SqlPart = { sql: string; params: unknown[] }

/** Con «Selected Services» sin servicios la lista es vacía sin consultar (legacy manda ids centinela). */
export function isEmptyByDefinition(f: WoToBeBilledFilter): boolean {
  return f.invoiceType === INVOICE_TYPE_SELECTED_SERVICES && f.services.length === 0
}

/** La regla de Completed (D8): solo cuando Completed es el **único** Status elegido. */
export function isCompletedOnly(f: WoToBeBilledFilter): boolean {
  return f.status.length === 1 && f.status[0] === WORKFLOW_COMPLETED
}

/**
 * `<total>` de legacy (`InvoiceDao::select`, `:382-400`): sin servicios, `GET_TOTAL_BY_INVOICE(i.id, 0)`; con servicios,
 * `GET_TOTAL_BY_INVOICE_IN(i.id, csv)`. Es la columna Price, el total del contador y el corte de «Include Zero Value».
 */
export function totalExpr(f: WoToBeBilledFilter): SqlPart {
  if (!f.services.length) return { sql: 'GET_TOTAL_BY_INVOICE(i.id, 0)', params: [] }
  return { sql: 'GET_TOTAL_BY_INVOICE_IN(i.id, ?)', params: [f.services.join(',')] }
}

/**
 * `<L>`, la «línea facturable» (D17): el mismo fragmento para el `EXISTS` de la lista y para `pendingLines`. Usa los
 * alias `i` (INVOICE), `isr` (INVOICE_SERVICE_REL) y `_is` (INVOICE_SERVICE).
 */
export function billableLineSql(f: WoToBeBilledFilter): SqlPart {
  let sql = ''
  const params: unknown[] = []
  if (f.services.length) {
    sql += ` AND isr.id_service_invoice IN (${sqlMarks(f.services)})`
    params.push(...f.services)
  }
  if (!f.includeZero) {
    sql += ' AND isr.price > 0'
  }
  if (f.invoiceType === INVOICE_TYPE_BY_SERVICES && !f.services.length) {
    sql += " AND i.id_department = _is.id_department AND _is.nombre <> ''"
  }
  return { sql, params }
}

/** Lo que va después de `WHERE 1`, con el `EXISTS` de línea facturable. Exige los alias del FROM de la lista. */
export function buildWoToBeBilledWhere(f: WoToBeBilledFilter): SqlPart {
  const parts: SqlPart[] = []
  const add = (sql: string, ...params: unknown[]) => parts.push({ sql, params })

  if (f.woIds.length) add(` AND i.id IN (${sqlMarks(f.woIds)})`, ...f.woIds)
  if (f.wo) add(' AND i.full_nro LIKE ?', `%${f.wo}%`)
  if (f.stock) add(' AND c.stock_number = ?', f.stock)

  if (f.services.length) {
    const marks = sqlMarks(f.services)
    add(
      ` AND EXISTS (SELECT isr.id FROM INVOICE_SERVICE_REL isr` +
        ` WHERE isr.id_service_invoice IN (${marks}) AND isr.id_invoice=i.id` +
        ` AND IS_WO_SERVICE_INVOICED(isr.id_service_invoice,i.id)=0)`,
      ...f.services,
    )
    add(
      ` AND EXISTS (SELECT isr.id FROM INVOICE_SERVICE_REL isr` +
        ` WHERE isr.id_service_invoice IN (${marks}) AND isr.id_invoice=i.id)`,
      ...f.services,
    )
  }
  if (f.departments.length) add(` AND i.id_department IN (${sqlMarks(f.departments)})`, ...f.departments)

  if (isCompletedOnly(f)) {
    add(' AND i.id_workflow = ?', WORKFLOW_COMPLETED)
    add(' AND i.date_last_chg_workflow BETWEEN ? AND ?', f.dateFrom, f.dateTo)
  } else {
    if (f.status.length) add(` AND i.id_workflow IN (${sqlMarks(f.status)})`, ...f.status)
    add(' AND i.fecha_alta >= ?', f.dateFrom)
    // `fecha_alta` es DATETIME: intervalo semiabierto (regla mysql-date-ranges). Legacy usa `<=` y se lleva una WO de
    // las 00:00 del día siguiente (R1 de CODE-review.md); acá no.
    add(' AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)', f.dateTo)
  }

  if (f.includeZero) {
    add(' AND WO_IS_FULL_INVOICED(i.id) = 0')
  } else {
    add(' AND WO_IS_FULL_INVOICED_NO_CEROS(i.id) = 0')
  }
  add(' AND i.wo_imported = 0')
  if (!f.includeZero) {
    const total = totalExpr(f)
    add(` AND ${total.sql} > 0`, ...total.params)
  }
  add(' AND i.estado = 1')
  add(' AND i.id_dealer_provider = ?', f.idDealerProvider)
  add(' AND dpto.id_dealer = ?', f.idDealer)
  if (f.approved === '0' || f.approved === '1') add(' AND i.approved = ?', Number(f.approved))
  if (f.price != null) add(' AND EQUAL_INVOICE_PRICE(i.id, ?)', f.price)
  if (f.ro) add(' AND i.ro = ?', f.ro)
  if (f.po) add(' AND i.po = ?', f.po)

  const line = billableLineSql(f)
  add(
    ` AND EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL isr` +
      ` INNER JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice` +
      ` LEFT JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_invoice = isr.id_invoice` +
      ` AND isir.id_invoice_service = isr.id_service_invoice AND IS_INVOICE_ACTIVE(isir.id_statement) = 1` +
      ` WHERE isr.id_invoice = i.id AND isir.id IS NULL${line.sql})`,
    ...line.params,
  )

  return {
    sql: parts.map((p) => p.sql).join(''),
    params: parts.flatMap((p) => p.params),
  }
}

/** FROM y JOIN literales de la lista de legacy (`InvoiceDao.php:448-512`), sin los LEFT JOIN de columnas que no se piden. */
export const WO_TO_BE_BILLED_FROM = `
  FROM INVOICE i
 INNER JOIN CONTRATISTA dealer_prov ON dealer_prov.id = i.id_dealer_provider
 INNER JOIN CONTRATISTA comp_prov   ON comp_prov.id = dealer_prov.id_empresa
 INNER JOIN usuarios u              ON u.id_usuario = i.id_author
 INNER JOIN DEPARTMENT dpto         ON dpto.id = i.id_department
 INNER JOIN CONTRATISTA dealer      ON dealer.id = dpto.id_dealer
 INNER JOIN WORKFLOW w              ON w.id = i.id_workflow
 INNER JOIN CAR c                   ON c.id = i.id_car
 INNER JOIN datos_parametricos make  ON make.id_dato_parametrico = c.id_make
 INNER JOIN datos_parametricos model ON model.id_dato_parametrico = c.id_model
  LEFT JOIN usuarios approvers      ON approvers.id_usuario = i.id_approver
  LEFT JOIN usuarios inspect        ON inspect.id_usuario = i.id_inspected
  LEFT JOIN INVOICE_AUX ia          ON ia.ID = i.id
  LEFT JOIN usuarios intinspect     ON intinspect.id_usuario = ia.id_int_inspected_author`

/** Orden de la lista de legacy, con `i.id DESC` como último desempate para paginar sin repetir ni saltear. */
export const WO_TO_BE_BILLED_ORDER = 'ORDER BY i.fecha_alta DESC, i.wo_nro DESC, i.id DESC'
