import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

/** Una WO leída **con su alcance**: si no es de la empresa, no hay fila (nunca se lee una WO ajena para un dato). */
export type ScopedWorkOrder = {
  id: number
  idDealer: number
  idDepartment: number
  idWorkflow: number
  idAuthor: number
  fullNro: string
  /** `YYYY-MM-DD` (`DATE(fecha_alta)`). */
  fechaAltaDate: string
  estado: number
  ro: string | null
  po: string | null
  stockNumber: string | null
}

export type RoPoRules = {
  roRequired: boolean
  poRequired: boolean
  roSemi: boolean
  poSemi: boolean
  stockSemi: boolean
}

function bool(value: unknown): boolean {
  return Number(value) === 1
}

/**
 * Las lecturas de la WO que cruzan otras tablas (`DEPARTMENT`, `DEALER_REL`, `INVOICE_SERVICE`, `USUARIO_SERVICE_REL`,
 * `USUARIO_ROL_REL`, `ROL_SERVICE_FIELD_REL`) y las funciones de la base de legacy (plans/plan-wo-to-be-billed-v0, T3,
 * T5 y T6). SQL crudo de lectura sobre la **conexión principal**: dentro de una transacción `@Transactional()` lee por
 * la misma conexión, después del candado.
 */
@Injectable()
export class WorkOrderRulesRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Candado de la fila de la WO (solo `INVOICE`, sin el join): serializa dos ediciones de RO# / PO# de la misma WO y
   * hace que lo que se lee después sea lo último confirmado (R15 de CODE-review.md). Primera sentencia de la transacción.
   */
  async lockWorkOrder(idInvoice: number, idDealerProvider: number): Promise<boolean> {
    const rows = await this.db.query(`SELECT id FROM INVOICE WHERE id = ? AND id_dealer_provider = ? FOR UPDATE`, [
      idInvoice,
      idDealerProvider,
    ])
    return rows.length > 0
  }

  /** La WO con su dealer, acotada a la empresa en la misma lectura (T5, paso 1). */
  async loadScoped(idInvoice: number, idDealerProvider: number): Promise<ScopedWorkOrder | null> {
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT i.id, d.id_dealer, i.id_department, i.id_workflow, i.id_author, i.full_nro,
              DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS fecha_alta_date, i.estado, i.ro, i.po, i.stock_number
         FROM INVOICE i
         JOIN DEPARTMENT d ON d.id = i.id_department
        WHERE i.id = ? AND i.id_dealer_provider = ?`,
      [idInvoice, idDealerProvider],
    )
    const r = rows[0]
    if (!r) return null
    return {
      id: Number(r.id),
      idDealer: Number(r.id_dealer),
      idDepartment: Number(r.id_department),
      idWorkflow: Number(r.id_workflow),
      idAuthor: Number(r.id_author),
      fullNro: String(r.full_nro ?? ''),
      fechaAltaDate: String(r.fecha_alta_date ?? ''),
      estado: Number(r.estado),
      ro: r.ro == null ? null : String(r.ro),
      po: r.po == null ? null : String(r.po),
      stockNumber: r.stock_number == null ? null : String(r.stock_number),
    }
  }

  /** `CHECK_USER_PERMISSION(usuario, dealer, acción)` (`DUMP:4831`), como `UsuarioService::userHavePermission`. */
  async checkUserPermission(idUsuario: number, idDealer: number, idRolAccion: number): Promise<number> {
    const rows = await this.db.query(`SELECT CHECK_USER_PERMISSION(?, ?, ?) AS res`, [idUsuario, idDealer, idRolAccion])
    return Number(rows[0]?.res)
  }

  /** `IS_WO_BILLED` (`DUMP:8458`): la WO tiene algún cobro. */
  async isWoBilled(idInvoice: number): Promise<boolean> {
    const rows = await this.db.query(`SELECT IS_WO_BILLED(?) AS res`, [idInvoice])
    return Number(rows[0]?.res) === 1
  }

  /** `WO_HAVE_INVOICE` (`DUMP:9752`): la WO tiene algo facturado (la condición de `invoice_pdf.php:46-48`). */
  async woHaveInvoice(idInvoice: number): Promise<boolean> {
    const rows = await this.db.query(`SELECT WO_HAVE_INVOICE(?) AS res`, [idInvoice])
    return Number(rows[0]?.res) === 1
  }

  /** Todos los servicios de la WO con su precio (`INVOICE_SERVICE_REL`), para la invoice individual. */
  async servicesOfWorkOrder(idInvoice: number): Promise<Array<{ idServiceInvoice: number; price: number }>> {
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT isr.id_service_invoice, isr.price
         FROM INVOICE_SERVICE_REL isr
        WHERE isr.id_invoice = ?
        ORDER BY isr.id`,
      [idInvoice],
    )
    return rows.map((r) => ({ idServiceInvoice: Number(r.id_service_invoice), price: Number(r.price) }))
  }

  /**
   * Las reglas de RO# / PO# de la edición en la celda de legacy (`api.datatable.edit.php:55-125`).
   *
   * Obligatorio (RO; PO igual con `has_po_required`) si alguna:
   * - el dealer lo exige: `DEALER_REL.has_ro_required` en la primera fila del par con `estado = 1` y `fecha_end IS
   *   NULL`, por `fecha_ini` (`DealerRelDao.php:19-89`);
   * - algún servicio de la WO lo exige (`INVOICE_SERVICE.has_ro_required = 1`);
   * - algún servicio activo y con nombre del department de la WO (department activo) que el usuario tiene asignado
   *   (`USUARIO_SERVICE_REL`) lo exige por rol: exactamente una fila de `ROL_SERVICE_FIELD_REL` de ese servicio con un
   *   rol del usuario y `has_ro_required = 1` (`InvoiceServiceDao::loadServiceByUserAndDpto`, `:438-566`).
   *
   * Semi-obligatorio (las marcas): algún servicio de la WO con `has_ro_semi_required = 1`, o con exactamente una fila de
   * `ROL_SERVICE_FIELD_REL` (ese servicio, un rol del usuario) con `has_ro_semi_required = 1` (`InvoiceServiceDao.php:292-324`,
   * `:363-365`). Igual PO y Stock.
   */
  async roPoRules(
    idInvoice: number,
    idUsuario: number,
    idDealer: number,
    idDealerProvider: number,
    idDepartment: number,
  ): Promise<RoPoRules> {
    const rolesOfUser = `SELECT urr.id_rol FROM USUARIO_ROL_REL urr WHERE urr.id_usuario = ?`
    const byRol = (col: string, svc: string) =>
      `(SELECT COUNT(rsfr.id) FROM ROL_SERVICE_FIELD_REL rsfr
         WHERE rsfr.id_service = ${svc} AND rsfr.id_rol IN (${rolesOfUser}) AND rsfr.${col} = 1)`
    const rows: Array<Record<string, unknown>> = await this.db.query(
      `SELECT
         (SELECT dr.has_ro_required FROM DEALER_REL dr
           WHERE dr.id_dealer_customer = ? AND dr.id_dealer_provider = ? AND dr.estado = 1 AND dr.fecha_end IS NULL
           ORDER BY dr.fecha_ini ASC, dr.id ASC LIMIT 1) AS dealer_ro,
         (SELECT dr.has_po_required FROM DEALER_REL dr
           WHERE dr.id_dealer_customer = ? AND dr.id_dealer_provider = ? AND dr.estado = 1 AND dr.fecha_end IS NULL
           ORDER BY dr.fecha_ini ASC, dr.id ASC LIMIT 1) AS dealer_po,
         EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL isr JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
                  WHERE isr.id_invoice = ? AND s.has_ro_required = 1) AS wo_ro,
         EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL isr JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
                  WHERE isr.id_invoice = ? AND s.has_po_required = 1) AS wo_po,
         EXISTS (SELECT 1 FROM INVOICE_SERVICE iss
                   JOIN DEPARTMENT d ON d.id = iss.id_department
                   JOIN USUARIO_SERVICE_REL usr ON usr.id_service = iss.id AND usr.id_usuario = ?
                  WHERE iss.id_department = ? AND iss.nombre <> '' AND iss.estado = 1 AND d.estado = 1
                    AND ${byRol('has_ro_required', 'iss.id')} = 1) AS usr_ro,
         EXISTS (SELECT 1 FROM INVOICE_SERVICE iss
                   JOIN DEPARTMENT d ON d.id = iss.id_department
                   JOIN USUARIO_SERVICE_REL usr ON usr.id_service = iss.id AND usr.id_usuario = ?
                  WHERE iss.id_department = ? AND iss.nombre <> '' AND iss.estado = 1 AND d.estado = 1
                    AND ${byRol('has_po_required', 'iss.id')} = 1) AS usr_po,
         EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL isr JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
                  WHERE isr.id_invoice = ?
                    AND (s.has_ro_semi_required = 1 OR ${byRol('has_ro_semi_required', 's.id')} = 1)) AS ro_semi,
         EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL isr JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
                  WHERE isr.id_invoice = ?
                    AND (s.has_po_semi_required = 1 OR ${byRol('has_po_semi_required', 's.id')} = 1)) AS po_semi,
         EXISTS (SELECT 1 FROM INVOICE_SERVICE_REL isr JOIN INVOICE_SERVICE s ON s.id = isr.id_service_invoice
                  WHERE isr.id_invoice = ?
                    AND (s.has_stock_semi_required = 1 OR ${byRol('has_stock_semi_required', 's.id')} = 1)) AS stock_semi`,
      [
        idDealer,
        idDealerProvider,
        idDealer,
        idDealerProvider,
        idInvoice,
        idInvoice,
        idUsuario,
        idDepartment,
        idUsuario,
        idUsuario,
        idDepartment,
        idUsuario,
        idInvoice,
        idUsuario,
        idInvoice,
        idUsuario,
        idInvoice,
        idUsuario,
      ],
    )
    const r = rows[0] ?? {}
    return {
      roRequired: bool(r.dealer_ro) || bool(r.wo_ro) || bool(r.usr_ro),
      poRequired: bool(r.dealer_po) || bool(r.wo_po) || bool(r.usr_po),
      roSemi: bool(r.ro_semi),
      poSemi: bool(r.po_semi),
      stockSemi: bool(r.stock_semi),
    }
  }
}
