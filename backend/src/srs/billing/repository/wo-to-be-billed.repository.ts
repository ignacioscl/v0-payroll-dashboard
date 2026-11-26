import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { sqlMarks } from '../../shared/mysql-result'
import { WoToBeBilledRowDto } from '../dto/wo-to-be-billed.dto'
import {
  billableLineSql,
  buildWoToBeBilledWhere,
  isEmptyByDefinition,
  totalExpr,
  WO_TO_BE_BILLED_FROM,
  WO_TO_BE_BILLED_ORDER,
  WoToBeBilledFilter,
} from '../wo-to-be-billed-sql'

/** Una línea que se va a facturar: un servicio de una WO del filtro sin invoice activa (T4, `pendingLines`). */
export type PendingLine = {
  idInvoice: number
  idServiceInvoice: number
  price: number
  serviceDepartment: number
  serviceName: string
  useQty: number
}

function str(value: unknown): string | null {
  return value == null ? null : String(value)
}

function numOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseServicesJson(raw: unknown): Array<Record<string, unknown>> {
  if (raw == null || raw === '') return []
  try {
    const parsed = JSON.parse(String(raw))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T4): la lista, el total y las líneas pendientes. SQL crudo (listado
 * con funciones de la base: la excepción de `typeorm-crud-no-raw-sql.mdc`) sobre la **conexión principal**, así
 * `pendingLines` corre dentro de la transacción del orquestador, después del candado (D2; molde:
 * `ExpenseReportRepository`). Toda consulta va acotada a la empresa (`i.id_dealer_provider`) y al dealer.
 */
@Injectable()
export class WoToBeBilledRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async list(f: WoToBeBilledFilter, page: number, pageSize: number): Promise<{ rows: WoToBeBilledRowDto[]; hasMore: boolean }> {
    if (isEmptyByDefinition(f)) return { rows: [], hasMore: false }
    const where = buildWoToBeBilledWhere(f)
    const total = totalExpr(f)
    const offset = (page - 1) * pageSize
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT i.id, i.full_nro, i.fecha_alta, i.stock_number, i.ro, i.po, i.observation, i.estado,
              i.id_department, dpto.nombre AS department_name, i.id_workflow, w.descripcion AS workflow_name,
              w.icon AS workflow_icon, w.color AS workflow_color, c.vin, c.year, c.color AS car_color,
              make.nombre AS make_name, model.nombre AS model_name, ${total.sql} AS total,
              i.approved, i.approved_date, approvers.nombre AS approver_name, ia.UN_APPROVE_NOTE AS unapprove_note,
              i.inspected, i.inspected_date, inspect.nombre AS inspector_name, i.internal_inspected,
              ia.internal_inspected_date, intinspect.nombre AS internal_inspector_name,
              WO_HAVE_INVOICE(i.id) AS wo_have_invoice, IS_WO_BILLED(i.id) AS is_billed,
              GET_NRO_INVOICE_FROM_WO(i.id) AS invoice_numbers,
              GET_SELECT_SERVICES_FROM_WO_DETAILED(i.id) AS services_json,
              time_format(CARFLOW_GET_WORKED_TIME_BY_WO(i.id), '%H:%i') AS time_worked,
              dealer_prov.has_final_inspect, dealer_prov.has_internal_inspect
       ${WO_TO_BE_BILLED_FROM}
       WHERE 1 ${where.sql}
       ${WO_TO_BE_BILLED_ORDER}
       LIMIT ?, ?`,
      [...total.params, ...where.params, offset, pageSize + 1],
    )
    const hasMore = rows.length > pageSize
    return { rows: rows.slice(0, pageSize).map(toRow), hasMore }
  }

  async summary(f: WoToBeBilledFilter): Promise<{ count: number; total: number }> {
    if (isEmptyByDefinition(f)) return { count: 0, total: 0 }
    const where = buildWoToBeBilledWhere(f)
    const total = totalExpr(f)
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(${total.sql}), 0) AS total
       ${WO_TO_BE_BILLED_FROM}
       WHERE 1 ${where.sql}`,
      [...total.params, ...where.params],
    )
    return { count: Number(rows[0]?.count ?? 0), total: Number(rows[0]?.total ?? 0) }
  }

  /**
   * Las líneas que se van a facturar (`loadServices` de legacy reducido a lo que `invoiceFromType` mira,
   * `InvoiceStatementService.php:274-290`). Orden: el del catálogo de legacy (`use_qty DESC, nombre`,
   * `InvoiceServiceFilter.php:85-91`), que define qué número recibe cada invoice de «by Services» sin servicio.
   */
  async pendingLines(f: WoToBeBilledFilter): Promise<PendingLine[]> {
    if (isEmptyByDefinition(f)) return []
    const where = buildWoToBeBilledWhere(f)
    const line = billableLineSql(f)
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT i.id AS id_invoice, isr.id_service_invoice, isr.price, _is.id_department AS service_department,
              _is.nombre AS service_name, _is.use_qty
       ${WO_TO_BE_BILLED_FROM}
       INNER JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       INNER JOIN INVOICE_SERVICE _is     ON _is.id = isr.id_service_invoice
       INNER JOIN DEPARTMENT d            ON d.id = _is.id_department
        LEFT JOIN INVOICE_STATEMENT_INV_REL isir
               ON isir.id_invoice = isr.id_invoice
              AND isir.id_invoice_service = isr.id_service_invoice
              AND IS_INVOICE_ACTIVE(isir.id_statement) = 1
       WHERE 1 ${where.sql}
         AND isir.id IS NULL
         ${line.sql}
       ORDER BY _is.use_qty DESC, _is.nombre, _is.id, i.fecha_alta DESC, i.wo_nro DESC, i.id DESC`,
      [...where.params, ...line.params],
    )
    return rows.map((r) => ({
      idInvoice: Number(r.id_invoice),
      idServiceInvoice: Number(r.id_service_invoice),
      price: Number(r.price),
      serviceDepartment: Number(r.service_department),
      serviceName: String(r.service_name ?? ''),
      useQty: Number(r.use_qty ?? 0),
    }))
  }

  /** Cuántos de los departments son del dealer y de la empresa (`DEPARTMENT.id_dealer` / `id_dealer_provider`). */
  async countDepartmentsOfDealer(ids: number[], idDealer: number, idDealerProvider: number): Promise<number> {
    if (!ids.length) return 0
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT COUNT(*) AS n
         FROM DEPARTMENT d
        WHERE d.id IN (${sqlMarks(ids)})
          AND d.id_dealer = ?
          AND d.id_dealer_provider = ?`,
      [...ids, idDealer, idDealerProvider],
    )
    return Number(rows[0]?.n ?? 0)
  }

  /**
   * Los services pedidos que son de la empresa y de un department del dealer, con su department y su nombre, en el
   * orden en que llegaron. Los que no lo son no vuelven.
   */
  async servicesOfDealer(
    ids: number[],
    idDealer: number,
    idDealerProvider: number,
  ): Promise<Array<{ id: number; idDepartment: number; nombre: string }>> {
    if (!ids.length) return []
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT s.id, s.id_department, s.nombre
         FROM INVOICE_SERVICE s
         INNER JOIN DEPARTMENT d ON d.id = s.id_department
        WHERE s.id IN (${sqlMarks(ids)})
          AND s.id_dealer_provider = ?
          AND d.id_dealer = ?
          AND d.id_dealer_provider = ?`,
      [...ids, idDealerProvider, idDealer, idDealerProvider],
    )
    const byId = new Map(
      rows.map((r) => [Number(r.id), { id: Number(r.id), idDepartment: Number(r.id_department), nombre: String(r.nombre ?? '') }]),
    )
    return ids.filter((id) => byId.has(id)).map((id) => byId.get(id)!)
  }

  /**
   * `has_trash_icon` del rol con el que entró el usuario (`USUARIO_ROL_REL` de `idUsuarioRolrel`, `DUMP:3894`).
   * Sin fila de rol = sí, como `P/js/app.intway-permissions.js:270-275`.
   */
  async hasTrashIcon(idUsuario: number, idUsuarioRolrel: number | null): Promise<boolean> {
    if (idUsuarioRolrel == null || idUsuarioRolrel <= 0) return true
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT rr.has_trash_icon FROM USUARIO_ROL_REL rr WHERE rr.id = ? AND rr.id_usuario = ? LIMIT 1`,
      [idUsuarioRolrel, idUsuario],
    )
    if (!rows.length) return true
    return Number(rows[0].has_trash_icon) === 1
  }
}

function toRow(r: Record<string, unknown>): WoToBeBilledRowDto {
  return {
    id: Number(r.id),
    fullNro: String(r.full_nro ?? ''),
    fechaAlta: String(r.fecha_alta ?? ''),
    stockNumber: str(r.stock_number),
    ro: str(r.ro),
    po: str(r.po),
    observation: str(r.observation),
    idDepartment: Number(r.id_department),
    department: String(r.department_name ?? ''),
    idWorkflow: Number(r.id_workflow),
    workflow: String(r.workflow_name ?? ''),
    workflowIcon: str(r.workflow_icon),
    workflowColor: str(r.workflow_color),
    vin: String(r.vin ?? ''),
    year: str(r.year),
    make: str(r.make_name),
    model: str(r.model_name),
    color: str(r.car_color),
    total: Number(r.total ?? 0),
    approved: numOrNull(r.approved),
    approvedDate: str(r.approved_date),
    approverName: str(r.approver_name),
    unapproveNote: str(r.unapprove_note),
    inspected: numOrNull(r.inspected),
    inspectedDate: str(r.inspected_date),
    inspectorName: str(r.inspector_name),
    internalInspected: numOrNull(r.internal_inspected),
    internalInspectedDate: str(r.internal_inspected_date),
    internalInspectorName: str(r.internal_inspector_name),
    woHaveInvoice: Number(r.wo_have_invoice) === 1,
    isBilled: Number(r.is_billed) === 1,
    invoiceNumbers: String(r.invoice_numbers ?? ''),
    services: parseServicesJson(r.services_json),
    timeWorked: str(r.time_worked),
    hasFinalInspect: Number(r.has_final_inspect) === 1,
    hasInternalInspect: Number(r.has_internal_inspect) === 1,
  }
}
