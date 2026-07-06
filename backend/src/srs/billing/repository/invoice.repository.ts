import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'
import { statementTypesSqlIn } from '../entity/invoice-statement.srsentity'
import {
  InvoiceListFilter,
  InvoiceRowDto,
  InvoiceSummaryDto,
} from '../dto/invoice-list.dto'
import {
  InvoiceDetailGenericRowDto,
  InvoiceDetailWoRowDto,
} from '../dto/invoice-detail.dto'

/**
 * Listado de la solapa Invoice (INVOICE_STATEMENT) — read-only.
 * Espeja InvoiceStatementDao::load() / loadStatementRel() / loadStatementRelGenerics()
 * del legacy, con paginación server-side y totales sobre todo el filtro.
 */
@Injectable()
export class InvoiceRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  /**
   * WHERE + params compartidos por lista y summary, así ambos bindean idéntico.
   * NO agrega joins de billing → una fila por statement (paginación correcta).
   * El detalle de pago se resuelve con un LEFT JOIN a la última billing activa.
   */
  private buildWhere(f: InvoiceListFilter): { join: string; where: string; params: any[] } {
    const stmt = buildDealerFilterSql('statement', f.idUsuario, f.dealerIds, f.skipDealerRestriction)
    let where = ` WHERE s.estado = 1 AND s.id_dealer_provider = ?${stmt.and}`
    // Solapamiento del período del statement con el rango del header.
    where += ' AND s.fecha_desde <= ? AND s.fecha_hasta >= ?'
    const params: any[] = [f.idDealerProvider, ...stmt.params, f.fechaHasta, f.fechaDesde]

    if (f.statementTypes.length) {
      // Valores de enum whitelisteados → inline seguro (mismo patrón que billing-kpi).
      where += ` AND s.statement_type IN (${statementTypesSqlIn(f.statementTypes)})`
    }
    if (f.search) {
      where += ` AND s.full_nro LIKE CONCAT('%', ?, '%')`
      params.push(f.search)
    }
    if (f.sended === '0' || f.sended === '1') {
      where += ' AND s.sended = ?'
      params.push(Number(f.sended))
    }
    if (f.payed === '0') where += ' AND IS_STATEMENT_BILLED(s.id) = 0'
    else if (f.payed === '1') where += ' AND IS_STATEMENT_BILLED(s.id) = 1'

    return { join: stmt.join, where, params }
  }

  /** Página de statements (una fila por statement). */
  async listPage(f: InvoiceListFilter): Promise<InvoiceRowDto[]> {
    const { join, where, params } = this.buildWhere(f)
    const limitClause =
      f.pageSize === -1
        ? ''
        : ` LIMIT ${Math.trunc(f.pageSize)} OFFSET ${Math.trunc((f.page - 1) * f.pageSize)}`

    const rows = await this.srs.query(
      `SELECT s.id, s.full_nro, s.statement_type, s.estado, s.sended,
              s.fecha_create, s.fecha_desde, s.fecha_hasta,
              s.po, s.ro, s.discount, s.discount_type, ROUND(s.tax, 2) AS tax,
              s.invoice_service_sel_rel, s.invoice_note,
              d.nombre        AS department,
              inv_serv.nombre AS invoice_service,
              u.nombre        AS author,
              c.razon_social  AS dealer,
              GET_NRO_WO_FROM_INVOICE(s.id)                                         AS wo,
              GET_SUBTOTAL_BY_STATEMENT(s.id, NULL)                                 AS sub_total,
              GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL) AS total,
              IS_STATEMENT_BILLED(s.id)                                             AS is_billed,
              IS_STATEMENT_PARTIAL_OR_FULL_BILLED(s.id)                             AS is_partial_billed,
              lb.id_billing                                                         AS id_billing,
              b.fecha                                                               AS fecha_pago,
              b.check_number                                                        AS check_number,
              b.amount                                                              AS amount
       FROM INVOICE_STATEMENT s
       ${join}
       LEFT JOIN DEPARTMENT d           ON d.id = s.id_department
       LEFT JOIN INVOICE_SERVICE inv_serv ON inv_serv.id = s.id_invoice_service
       LEFT JOIN usuarios u             ON u.id_usuario = s.id_author
       LEFT JOIN (
         SELECT bwr.id_statement, MAX(bwr.id_billing) AS id_billing
         FROM BILLING_WO_REL bwr
         WHERE IS_BILLING_ACTIVE(bwr.id_billing) = 1
         GROUP BY bwr.id_statement
       ) lb ON lb.id_statement = s.id
       LEFT JOIN BILLING b ON b.id = lb.id_billing
       ${where}
       ORDER BY s.fecha_desde DESC, s.fecha_create${limitClause}`,
      params,
    )

    return rows.map((r: any) => ({
      id: Number(r.id),
      fullNro: r.full_nro,
      statementType: Number(r.statement_type),
      estado: Number(r.estado ?? 1),
      wo: r.wo ?? undefined,
      department: r.department ?? undefined,
      invoiceService: r.invoice_service ?? undefined,
      invoiceServiceSelRel: r.invoice_service_sel_rel ?? undefined,
      invoiceNote: r.invoice_note ?? undefined,
      author: r.author ?? undefined,
      dealer: r.dealer ?? undefined,
      fechaCreate: r.fecha_create,
      fechaDesde: r.fecha_desde ?? undefined,
      fechaHasta: r.fecha_hasta ?? undefined,
      subtotal: Number(r.sub_total ?? 0),
      discount: r.discount == null ? undefined : Number(r.discount),
      discountType: r.discount_type == null ? undefined : Number(r.discount_type),
      total: Number(r.total ?? 0),
      tax: Number(r.tax ?? 0),
      po: r.po ?? undefined,
      ro: r.ro ?? undefined,
      sended: Number(r.sended ?? 0),
      isBilled: Number(r.is_billed ?? 0),
      isPartialBilled: Number(r.is_partial_billed ?? 0),
      idBilling: r.id_billing ? Number(r.id_billing) : undefined,
      fechaPago: r.fecha_pago ?? undefined,
      checkNumber: r.check_number ?? undefined,
      amount: r.amount == null ? undefined : Number(r.amount),
    }))
  }

  /** Count + totales (subtotal/discount/total) sobre TODO el filtro, en una sola pasada. */
  async summary(f: InvoiceListFilter): Promise<{ total: number; summary: InvoiceSummaryDto }> {
    const { join, where, params } = this.buildWhere(f)
    const [row] = await this.srs.query(
      `SELECT COUNT(*) AS cnt,
              ROUND(IFNULL(SUM(GET_SUBTOTAL_BY_STATEMENT(s.id, NULL)), 0), 2) AS subtotal,
              ROUND(IFNULL(SUM(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0), 2) AS total,
              ROUND(IFNULL(SUM(
                GET_SUBTOTAL_BY_STATEMENT(s.id, NULL)
                - GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)
              ), 0), 2) AS discount
       FROM INVOICE_STATEMENT s
       ${join}
       ${where}`,
      params,
    )
    const count = Number(row?.cnt ?? 0)
    return {
      total: count,
      summary: {
        count,
        subtotal: Number(row?.subtotal ?? 0),
        discount: Number(row?.discount ?? 0),
        total: Number(row?.total ?? 0),
      },
    }
  }

  /**
   * Autorización de :id — el statement debe pertenecer al provider del usuario
   * (+ RESTRICTION_DEALER_V2 salvo admin). Evita fugas de otro tenant.
   */
  async isStatementInScope(f: {
    idStatement: number
    idDealerProvider: number
    idUsuario: number
    skipDealerRestriction: boolean
  }): Promise<{ inScope: boolean; statementType: number }> {
    const restrict = f.skipDealerRestriction ? '' : ' AND RESTRICTION_DEALER_V2(?, c.id) = 1'
    const params = f.skipDealerRestriction
      ? [f.idStatement, f.idDealerProvider]
      : [f.idStatement, f.idDealerProvider, f.idUsuario]
    const rows = await this.srs.query(
      `SELECT s.statement_type AS statementType
       FROM INVOICE_STATEMENT s
       JOIN CONTRATISTA c ON c.id = s.id_dealer
       WHERE s.id = ? AND s.id_dealer_provider = ?${restrict}
       LIMIT 1`,
      params,
    )
    if (rows.length === 0) return { inScope: false, statementType: 0 }
    return { inScope: true, statementType: Number(rows[0].statementType ?? 0) }
  }

  /** Detalle WO/servicio de un statement (statement_type 1-4). */
  async detailWoRows(
    idStatement: number,
    idDealerProvider: number,
  ): Promise<InvoiceDetailWoRowDto[]> {
    const rows = await this.srs.query(
      `SELECT isir.id, isir.id_statement,
              isr.price, isr.qty, isr.comentario,
              _is.nombre AS servicio,
              i.full_nro, i.ro, i.po, i.stock_number, i.fecha_alta, i.observation,
              c.vin,
              dpto.nombre AS department,
              IS_STATEMENT_BILLED(isir.id_statement) AS is_statement_full_billed,
              CASE WHEN b.fecha IS NULL THEN b2.fecha ELSE b.fecha END AS fecha_pago,
              CASE WHEN b.check_number IS NULL THEN b2.check_number ELSE b.check_number END AS check_number,
              CASE WHEN b.amount IS NULL THEN b2.amount ELSE b.amount END AS amount
       FROM INVOICE_STATEMENT_INV_REL isir
       INNER JOIN INVOICE_STATEMENT istat ON istat.id = isir.id_statement
       INNER JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = isir.id_invoice
                                         AND isr.id_service_invoice = isir.id_invoice_service
       INNER JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
       INNER JOIN DEPARTMENT dpto ON dpto.id = _is.id_department
       INNER JOIN INVOICE i ON i.id = isir.id_invoice
       INNER JOIN CAR c ON c.id = i.id_car
       LEFT JOIN BILLING_WO_REL bwr ON bwr.id_statement_inv_rel = isir.id AND IS_BILLING_ACTIVE(bwr.id_billing) = 1
       LEFT JOIN BILLING b ON b.id = bwr.id_billing AND IS_BILLING_ACTIVE(bwr.id_billing) = 1
       LEFT JOIN BILLING_WO_REL bwr_inv ON bwr_inv.id_statement = isir.id_statement AND IS_BILLING_ACTIVE(bwr_inv.id_billing) = 1
       LEFT JOIN BILLING b2 ON b2.id = bwr_inv.id_billing AND IS_BILLING_ACTIVE(bwr_inv.id_billing) = 1
       WHERE i.estado = 1 AND isir.id_statement = ? AND istat.id_dealer_provider = ?
       ORDER BY isir.id`,
      [idStatement, idDealerProvider],
    )
    return rows.map((r: any) => ({
      id: Number(r.id),
      idStatement: Number(r.id_statement),
      woNro: r.full_nro ?? undefined,
      fechaAlta: r.fecha_alta ?? undefined,
      vin: r.vin ?? undefined,
      stockNumber: r.stock_number ?? undefined,
      ro: r.ro ?? undefined,
      po: r.po ?? undefined,
      department: r.department ?? undefined,
      service: r.servicio ?? undefined,
      observation: r.comentario ?? r.observation ?? undefined,
      qty: r.qty == null ? undefined : Number(r.qty),
      price: r.price == null ? undefined : Number(r.price),
      isStatementFullBilled: Number(r.is_statement_full_billed ?? 0),
      checkNumber: r.check_number ?? undefined,
      amount: r.amount == null ? undefined : Number(r.amount),
      fechaPago: r.fecha_pago ?? undefined,
    }))
  }

  /** Detalle de statement TTK (5) o Generic (6): UNION de líneas generic + rollup TTK por autor. */
  async detailGenericRows(
    idStatement: number,
    idDealerProvider: number,
  ): Promise<InvoiceDetailGenericRowDto[]> {
    const rows = await this.srs.query(
      `SELECT * FROM (
        (
          SELECT isir.id,
                 isir.id_statement,
                 isir.description,
                 ROUND(isir.generic_qty, 2) AS generic_qty,
                 isir.amount AS service_price,
                 IS_STATEMENT_BILLED(isir.id_statement) AS is_statement_full_billed,
                 CASE WHEN b.check_number IS NULL THEN b2.check_number ELSE b.check_number END AS check_number,
                 CASE WHEN b.amount IS NULL THEN b2.amount ELSE b.amount END AS amount,
                 CASE WHEN b.fecha IS NULL THEN b2.fecha ELSE b.fecha END AS fecha_pago,
                 NULL AS id_author_ttk, NULL AS rol_name, NULL AS dpto_name,
                 IFNULL(isir.only_timecard, 0) AS only_timecard
          FROM INVOICE_STATEMENT_INV_REL isir
          INNER JOIN INVOICE_STATEMENT istat ON istat.id = isir.id_statement
          LEFT JOIN BILLING_WO_REL bwr ON bwr.id_statement_inv_rel = isir.id AND IS_BILLING_ACTIVE(bwr.id_billing) = 1
          LEFT JOIN BILLING b ON b.id = bwr.id_billing AND IS_BILLING_ACTIVE(bwr.id_billing) = 1
          LEFT JOIN BILLING_WO_REL bwr_inv ON bwr_inv.id_statement = isir.id_statement AND IS_BILLING_ACTIVE(bwr_inv.id_billing) = 1
          LEFT JOIN BILLING b2 ON b2.id = bwr_inv.id_billing AND IS_BILLING_ACTIVE(bwr_inv.id_billing) = 1
          WHERE isir.id_employee_work IS NULL AND isir.id_statement = ? AND istat.id_dealer_provider = ?
        )
        UNION
        (
          SELECT NULL AS id,
                 t.id_statement,
                 t.nombre AS description,
                 t.hours_decimal AS generic_qty,
                 t.amount_dealer AS service_price,
                 IS_STATEMENT_BILLED(t.id_statement) AS is_statement_full_billed,
                 b.check_number AS check_number,
                 b.amount AS amount,
                 b.fecha AS fecha_pago,
                 t.id_author AS id_author_ttk,
                 t.rol_name,
                 t.dpto_name,
                 t.only_timecard AS only_timecard
          FROM (
            SELECT MAX(tew.id_statement) AS id_statement,
                   MAX(tew.id_statement_inv_rel) AS id_statement_inv_rel,
                   u.nombre AS nombre,
                   tew.id_author,
                   (SUM(TTK_CALCULATE_TIME_DAY(1, punch_out, punch_in, break_end, break_start, 1)) * 3600) / 3600 AS hours_decimal,
                   tew.amount_dealer AS amount_dealer,
                   (SELECT MAX(r.nombre) FROM USUARIO_ROL_REL urr
                     INNER JOIN ROL r ON r.id_rol = urr.id_rol
                     WHERE urr.id_dealer_asigned = tew.id_dealer AND urr.id_usuario = u.id_usuario) AS rol_name,
                   (SELECT MAX(dp.nombre) FROM USUARIO_ROL_REL urr
                     INNER JOIN ROL r ON r.id_rol = urr.id_rol
                     INNER JOIN DEPARTMENT dp ON dp.id = r.id_department
                     WHERE urr.id_dealer_asigned = tew.id_dealer AND urr.id_usuario = u.id_usuario) AS dpto_name,
                   MAX(tew.only_timecard) AS only_timecard
            FROM (
              SELECT tew.id, tew.id_author, tew.id_dealer, tew.punch_in, tew.punch_out,
                     tew.break_start, tew.break_end,
                     (isir.amount / TTK_CALCULATE_TIME_DAY(1, punch_out, punch_in, break_end, break_start, 1)) AS amount_dealer,
                     isir.id AS id_statement_inv_rel,
                     _is.id AS id_statement,
                     isir.only_timecard AS only_timecard
              FROM TTK_EMPLOYEE_WORK tew
              INNER JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_employee_work = tew.id AND isir.id_statement = ?
              INNER JOIN INVOICE_STATEMENT _is ON _is.id = isir.id_statement AND _is.estado = 1
              WHERE tew.estado = 1 AND _is.id = ? AND _is.id_dealer_provider = ?
            ) tew
            INNER JOIN usuarios u ON u.id_usuario = tew.id_author
            GROUP BY tew.id_author
          ) t
          LEFT JOIN BILLING_WO_REL bwr ON bwr.id_statement_inv_rel = t.id_statement_inv_rel
          LEFT JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1
        )
      ) u
      ORDER BY u.id`,
      [idStatement, idDealerProvider, idStatement, idStatement, idDealerProvider],
    )
    return rows.map((r: any) => ({
      id: r.id == null ? undefined : Number(r.id),
      idStatement: Number(r.id_statement),
      description: r.description ?? undefined,
      genericQty: r.generic_qty == null ? undefined : Number(r.generic_qty),
      price: r.service_price == null ? undefined : Number(r.service_price),
      isStatementFullBilled: Number(r.is_statement_full_billed ?? 0),
      checkNumber: r.check_number ?? undefined,
      amount: r.amount == null ? undefined : Number(r.amount),
      fechaPago: r.fecha_pago ?? undefined,
      idAuthorTtk: r.id_author_ttk == null ? undefined : Number(r.id_author_ttk),
      rolName: r.rol_name ?? undefined,
      departmentName: r.dpto_name ?? undefined,
      onlyTimecard: Number(r.only_timecard ?? 0),
    }))
  }
}
