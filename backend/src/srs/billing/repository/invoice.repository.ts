import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { buildDealerFilterSql, buildDealerRestrictionClause } from '../../shared/kpi/srs-kpi-dealer-filter'
import {
  applyZeroFilter,
  statementHasPositiveTotalSql,
} from '../../shared/kpi/srs-kpi-zero-filter'
import { StatementType, statementTypesSqlIn } from '../entity/invoice-statement.srsentity'
import {
  InvoiceListFilter,
  InvoiceRowDto,
  InvoiceSummaryDto,
} from '../dto/invoice-list.dto'
import { sqlInInts } from '../dto/invoice-filter-parsers'
import {
  InvoiceLookupOptionDto,
} from '../dto/invoice-lookup.dto'
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
    const estado = f.showDeleted ? 0 : 1
    let where = ` WHERE s.estado = ${estado} AND s.id_dealer_provider = ?${stmt.and}`
    // Legacy billing list: statement period fully inside [fechaDesde, fechaHasta].
    where += ' AND s.fecha_desde >= ? AND s.fecha_hasta <= ?'
    const params: any[] = [f.idDealerProvider, ...stmt.params, f.fechaDesde, f.fechaHasta]

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

    if (f.idAuthor) {
      where += ' AND s.id_author = ?'
      params.push(f.idAuthor)
    }

    if (f.departmentIds.length) {
      const ids = sqlInInts(f.departmentIds)
      where += ` AND (EXISTS (
        SELECT issr.id FROM INVOICE_STATEMENT_SEL_SER_REL issr
        INNER JOIN INVOICE_SERVICE _lis ON _lis.id = issr.id_inv_service
        WHERE issr.id_statement = s.id AND _lis.id_department IN (${ids})
      ) OR s.id_department IN (${ids}))`
    }

    if (f.invoiceServiceIds.length) {
      const ids = sqlInInts(f.invoiceServiceIds)
      const serviceMatch = `(s.id_invoice_service IN (${ids}) OR EXISTS (
          SELECT isir.id FROM INVOICE_STATEMENT_INV_REL isir
          INNER JOIN INVOICE i ON i.id = isir.id_invoice AND i.estado = 1
          WHERE isir.id_statement = s.id AND isir.id_invoice_service IN (${ids})
        ) OR EXISTS (
          SELECT issr.id FROM INVOICE_STATEMENT_SEL_SER_REL issr
          WHERE issr.id_statement = s.id AND issr.id_inv_service IN (${ids})
        ))`
      // Legacy: OR statement_type only for TTK/Generic toggles — never WO types (1–4),
      // or the service filter is bypassed when all type pills are active.
      const ttkGenericTypes = f.statementTypes.filter(
        (t) => t === StatementType.TTK || t === StatementType.GENERIC,
      )
      if (ttkGenericTypes.length) {
        where += ` AND (${serviceMatch} OR s.statement_type IN (${statementTypesSqlIn(ttkGenericTypes)}))`
      } else {
        where += ` AND ${serviceMatch}`
      }
    }

    if (f.dueOn) {
      where += ` AND IS_STATEMENT_BILLED(s.id) = 0
        AND EXISTS (
          SELECT dr.id FROM DEALER_REL dr
          WHERE dr.id_dealer_customer = s.id_dealer
            AND dr.id_dealer_provider = s.id_dealer_provider
            AND dr.fecha_end IS NULL
            AND dr.due_on IS NOT NULL
            AND dr.due_on > 0
            AND DATEDIFF(CURDATE(), s.fecha_hasta) > dr.due_on
        )`
    }

    if (f.checkDate || f.checkNumber) {
      const billingParts: string[] = []
      if (f.checkDate) {
        billingParts.push('b.fecha = ?')
        params.push(f.checkDate)
      }
      if (f.checkNumber) {
        billingParts.push('b.check_number LIKE ?')
        params.push(`%${f.checkNumber}%`)
      }
      where += ` AND EXISTS (
        SELECT 1 FROM BILLING_WO_REL bwr
        INNER JOIN BILLING b ON b.id = bwr.id_billing AND IS_BILLING_ACTIVE(bwr.id_billing) = 1
        WHERE (bwr.id_statement = s.id
          OR bwr.id_statement_inv_rel IN (
            SELECT isir.id FROM INVOICE_STATEMENT_INV_REL isir WHERE isir.id_statement = s.id
          ))
        AND ${billingParts.join(' AND ')}
      )`
    }

    const lineSubParts: string[] = []
    const lineParams: any[] = []
    if (f.woNumbers.length) {
      const woOr = f.woNumbers.map(() => 'i.wo_nro = ?').join(' OR ')
      lineSubParts.push(`(${woOr})`)
      lineParams.push(...f.woNumbers)
    }
    if (f.roPo) {
      lineSubParts.push('(i.ro = ? OR i.po = ?)')
      lineParams.push(f.roPo, f.roPo)
    }
    if (f.stock) {
      lineSubParts.push('(i.stock_number LIKE ? OR c.vin = ? OR c.vin LIKE ?)')
      const like = `%${f.stock}%`
      lineParams.push(like, f.stock, like)
    }
    if (lineSubParts.length) {
      where += ` AND EXISTS (
        SELECT isir.id
        FROM INVOICE_STATEMENT_INV_REL isir
        INNER JOIN INVOICE_SERVICE_REL isr
          ON isr.id_invoice = isir.id_invoice AND isr.id_service_invoice = isir.id_invoice_service
        INNER JOIN INVOICE i ON i.id = isir.id_invoice AND i.estado = 1
        INNER JOIN CAR c ON c.id = i.id_car
        WHERE isir.id_statement = s.id AND ${lineSubParts.join(' AND ')}
      )`
      params.push(...lineParams)
    }

    where += applyZeroFilter(f.includeZero, statementHasPositiveTotalSql('s'))

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
              s.id_invoice_statement_schedule,
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
      createdBySchedule: Number(r.id_invoice_statement_schedule ?? 0) > 0,
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

  async lookupDepartments(f: {
    idDealerProvider: number
    idUsuario: number
    dealerIds: number[]
    skipDealerRestriction: boolean
    search?: string
    limit: number
  }): Promise<InvoiceLookupOptionDto[]> {
    if (f.dealerIds.length === 0) return []
    const restrict = buildDealerRestrictionClause(
      f.idUsuario,
      f.dealerIds,
      f.skipDealerRestriction,
    )
    const params: any[] = [f.idDealerProvider, ...restrict.params]
    let searchSql = ''
    if (f.search) {
      searchSql = ' AND d.nombre LIKE CONCAT(\'%\', ?, \'%\')'
      params.push(f.search)
    }
    const rows = await this.srs.query(
      `SELECT d.id, d.nombre AS label, c.razon_social AS sublabel
       FROM DEPARTMENT d
       INNER JOIN CONTRATISTA c ON c.id = d.id_dealer
       WHERE d.estado = 1
         AND d.id_dealer_provider = ?
         ${restrict.and}
         ${searchSql}
       ORDER BY c.razon_social, d.nombre
       LIMIT ${Math.trunc(f.limit)}`,
      params,
    )
    return rows.map((r: any) => ({
      id: Number(r.id),
      label: String(r.label ?? ''),
      sublabel: r.sublabel ? String(r.sublabel) : undefined,
    }))
  }

  async lookupServices(f: {
    idDealerProvider: number
    idUsuario: number
    dealerIds: number[]
    departmentIds: number[]
    skipDealerRestriction: boolean
    search?: string
    limit: number
  }): Promise<InvoiceLookupOptionDto[]> {
    if (f.dealerIds.length === 0) return []
    const restrict = buildDealerRestrictionClause(
      f.idUsuario,
      f.dealerIds,
      f.skipDealerRestriction,
    )
    const params: any[] = [f.idDealerProvider, ...restrict.params]
    let extra = ''
    if (f.departmentIds.length) {
      extra += ` AND d.id IN (${sqlInInts(f.departmentIds)})`
    }
    if (f.search) {
      extra += ' AND ins.nombre LIKE CONCAT(\'%\', ?, \'%\')'
      params.push(f.search)
    }
    const rows = await this.srs.query(
      `SELECT ins.id, ins.nombre AS label,
              CONCAT(c.razon_social, ' · ', d.nombre) AS sublabel
       FROM INVOICE_SERVICE ins
       INNER JOIN DEPARTMENT d ON d.id = ins.id_department
       INNER JOIN CONTRATISTA c ON c.id = d.id_dealer
       WHERE ins.estado = 1
         AND d.id_dealer_provider = ?
         ${restrict.and}
         ${extra}
       ORDER BY c.razon_social, d.nombre, ins.nombre
       LIMIT ${Math.trunc(f.limit)}`,
      params,
    )
    return rows.map((r: any) => ({
      id: Number(r.id),
      label: String(r.label ?? ''),
      sublabel: r.sublabel ? String(r.sublabel) : undefined,
    }))
  }
}
