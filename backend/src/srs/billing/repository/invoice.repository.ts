import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { buildDealerRestrictionClause } from '../../shared/kpi/srs-kpi-dealer-filter'
import { StatementType } from '../entity/invoice-statement.srsentity'
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
  InvoiceDetailSlice,
  InvoiceDetailWoRowDto,
} from '../dto/invoice-detail.dto'
import {
  buildUnionBranches,
  concatBranches,
  identityTupleSql,
  mapIdentityRow,
  mapInvoiceListRow,
  orderBySql,
  summarySelectSql,
  type InvoiceRowIdentity,
} from '../invoice-list-sql'

function effectiveDetailPayed(slice: InvoiceDetailSlice): '0' | '1' | undefined {
  if (slice.payed === '0' || slice.payed === '1') return slice.payed
  if (slice.idBilling <= 0) return '0'
  return undefined
}

function detailMembershipSql(): string {
  return ` AND ( EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                 WHERE bx.id_statement_inv_rel = isir.id AND bx.id_billing = ?)
        OR EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                   INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                    WHERE bx.id_statement = isir.id_statement AND bx.id_billing = ?) )`
}

function detailPayedWoSql(payed: '0' | '1'): string {
  if (payed === '0') {
    return ` AND IS_SERVICE_FROM_STATEMENT_BILLED(isir.id_statement, i.id, _is.id) = 0`
  }
  return ` AND ( EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                 WHERE bx.id_statement_inv_rel = isir.id)
        OR EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                   INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                    WHERE bx.id_statement = isir.id_statement) )`
}

function detailPayedGenericSql(payed: '0' | '1'): string {
  if (payed === '0') {
    return ` AND NOT EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                  INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                   WHERE bx.id_statement_inv_rel = isir.id)
  AND NOT EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                  INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                   WHERE bx.id_statement = isir.id_statement)`
  }
  return ` AND ( EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                 WHERE bx.id_statement_inv_rel = isir.id)
        OR EXISTS (SELECT 1 FROM BILLING_WO_REL bx
                   INNER JOIN BILLING bb ON bb.id = bx.id_billing AND bb.estado = 1
                    WHERE bx.id_statement = isir.id_statement) )`
}

function detailScreenFiltersSql(slice: InvoiceDetailSlice, opts: { wo: boolean }): string {
  let sql = ''
  if (opts.wo && slice.invoiceServiceIds.length) {
    sql += ` AND isr.id_service_invoice IN (${sqlInInts(slice.invoiceServiceIds)})`
  }
  if (opts.wo && slice.departmentIds.length) {
    sql += ` AND dpto.id IN (${sqlInInts(slice.departmentIds)})`
  }
  if (opts.wo && slice.stock) {
    sql += ' AND (i.stock_number LIKE ? OR c.vin = ? OR c.vin LIKE ?)'
  }
  return sql
}

/**
 * Listado de la solapa Invoice (INVOICE_STATEMENT) — read-only.
 * UNION de clones por lote (HelperDao) con paginación en dos fases (T.10.2.bis).
 */
@Injectable()
export class InvoiceRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async listPage(
    f: InvoiceListFilter,
  ): Promise<{ results: InvoiceRowDto[]; hasMore: boolean }> {
    const identityBranches = concatBranches(buildUnionBranches(f, 'identity'))
    const pageSize = f.pageSize
    const unlimited = pageSize === -1
    const fetchSize = unlimited ? 0 : Math.trunc(pageSize) + 1
    const offset = unlimited ? 0 : Math.trunc((f.page - 1) * pageSize)
    const limitClause = unlimited ? '' : ' LIMIT ? OFFSET ?'
    const identityParams = unlimited
      ? identityBranches.params
      : [...identityBranches.params, fetchSize, offset]

    const identityRows = await this.srs.query(
      `SELECT t.id, t.id_billing, t.nro_billed, t.id_billing_wo_rel
       FROM (
         ${identityBranches.sql}
       ) t
       ${orderBySql(f)}${limitClause}`,
      identityParams,
    )

    const mappedIdentities: InvoiceRowIdentity[] = identityRows.map(mapIdentityRow)
    const hasMore = unlimited ? false : mappedIdentities.length > pageSize
    const pageIdentities = hasMore ? mappedIdentities.slice(0, pageSize) : mappedIdentities
    if (pageIdentities.length === 0) {
      return { results: [], hasMore: false }
    }

    const statementIds = [...new Set(pageIdentities.map((r) => r.id))]
    const fullBranches = concatBranches(buildUnionBranches(f, 'full', statementIds))
    const tuples = identityTupleSql(pageIdentities)
    const rows = await this.srs.query(
      `SELECT t.*
       FROM (
         ${fullBranches.sql}
       ) t
       INNER JOIN (
         ${tuples}
       ) a
          ON t.id <=> a.id
         AND t.id_billing <=> a.id_billing
         AND t.nro_billed <=> a.nro_billed
         AND t.id_billing_wo_rel <=> a.id_billing_wo_rel
       ${orderBySql(f)}`,
      fullBranches.params,
    )
    return { results: rows.map(mapInvoiceListRow), hasMore }
  }

  async summary(f: InvoiceListFilter): Promise<{ total: number; summary: InvoiceSummaryDto }> {
    const branches = concatBranches(buildUnionBranches(f, 'full'))
    const [row] = await this.srs.query(
      `${summarySelectSql(f.deleted)}
       FROM (
         ${branches.sql}
       ) t`,
      branches.params,
    )
    const count = Number(row?.cnt ?? 0)
    return {
      total: count,
      summary: {
        count,
        subtotal: Number(row?.subtotal ?? 0),
        discount: Number(row?.discount ?? 0),
        total: Number(row?.total ?? 0),
        deletedInList: Number(row?.deleted_in_list ?? 0),
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
    slice: InvoiceDetailSlice,
  ): Promise<InvoiceDetailWoRowDto[]> {
    const payed = effectiveDetailPayed(slice)
    const params: any[] = [slice.idBilling, idDealerProvider, idStatement, idDealerProvider]
    let extra = ''
    if (slice.idBilling > 0) {
      extra += detailMembershipSql()
      params.push(slice.idBilling, slice.idBilling)
    }
    if (payed === '0' || payed === '1') extra += detailPayedWoSql(payed)
    extra += detailScreenFiltersSql(slice, { wo: true })
    if (slice.stock) {
      const like = `%${slice.stock}%`
      params.push(like, slice.stock, like)
    }
    const rows = await this.srs.query(
      `SELECT isir.id, isir.id_statement,
              IF(isr.qty > 0, isr.qty * isr.price, isr.price) AS price,
              isr.qty, isr.comentario,
              _is.nombre AS servicio,
              i.full_nro, i.ro, i.po, i.stock_number, i.fecha_alta, i.observation,
              c.vin,
              dpto.nombre AS department,
              IS_STATEMENT_BILLED(isir.id_statement) AS is_statement_full_billed,
              b.fecha AS fecha_pago,
              b.check_number AS check_number,
              b.amount AS amount
       FROM INVOICE_STATEMENT_INV_REL isir
       INNER JOIN INVOICE_STATEMENT istat ON istat.id = isir.id_statement
       INNER JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = isir.id_invoice
                                         AND isr.id_service_invoice = isir.id_invoice_service
       INNER JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
       INNER JOIN DEPARTMENT dpto ON dpto.id = _is.id_department
       INNER JOIN INVOICE i ON i.id = isir.id_invoice
       INNER JOIN CAR c ON c.id = i.id_car
       LEFT JOIN BILLING b ON b.id = ? AND b.id_dealer_provider = ?
       WHERE i.estado = 1 AND isir.id_statement = ? AND istat.id_dealer_provider = ?
       ${extra}
       ORDER BY i.wo_nro`,
      params,
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
    slice: InvoiceDetailSlice,
  ): Promise<InvoiceDetailGenericRowDto[]> {
    const payed = effectiveDetailPayed(slice)
    const genericParams: any[] = [slice.idBilling, idDealerProvider, idStatement, idDealerProvider]
    let genericExtra = ''
    if (slice.idBilling > 0) {
      genericExtra += detailMembershipSql()
      genericParams.push(slice.idBilling, slice.idBilling)
    }
    if (payed === '0' || payed === '1') genericExtra += detailPayedGenericSql(payed)

    const ttkInnerParams: any[] = [idStatement, idStatement, idDealerProvider]
    let ttkInnerExtra = ''
    if (slice.idBilling > 0) {
      ttkInnerExtra += detailMembershipSql()
      ttkInnerParams.push(slice.idBilling, slice.idBilling)
    }
    if (payed === '0' || payed === '1') ttkInnerExtra += detailPayedGenericSql(payed)
    const ttkOuterParams = [slice.idBilling, idDealerProvider]

    const rows = await this.srs.query(
      `SELECT * FROM (
        (
          SELECT isir.id,
                 isir.id_statement,
                 isir.description,
                 ROUND(isir.generic_qty, 2) AS generic_qty,
                 isir.amount AS service_price,
                 IS_STATEMENT_BILLED(isir.id_statement) AS is_statement_full_billed,
                 b.check_number AS check_number,
                 b.amount AS amount,
                 b.fecha AS fecha_pago,
                 NULL AS id_author_ttk, NULL AS rol_name, NULL AS dpto_name,
                 IFNULL(isir.only_timecard, 0) AS only_timecard
          FROM INVOICE_STATEMENT_INV_REL isir
          INNER JOIN INVOICE_STATEMENT istat ON istat.id = isir.id_statement
          LEFT JOIN BILLING b ON b.id = ? AND b.id_dealer_provider = ?
          WHERE isir.id_employee_work IS NULL AND isir.id_statement = ? AND istat.id_dealer_provider = ?
          ${genericExtra}
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
                   SUM(tew.amount_line) AS amount_dealer,
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
                     isir.amount AS amount_line,
                     isir.id AS id_statement_inv_rel,
                     _is.id AS id_statement,
                     isir.only_timecard AS only_timecard
              FROM TTK_EMPLOYEE_WORK tew
              INNER JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_employee_work = tew.id AND isir.id_statement = ?
              INNER JOIN INVOICE_STATEMENT _is ON _is.id = isir.id_statement
              WHERE tew.estado = 1 AND _is.id = ? AND _is.id_dealer_provider = ?
              ${ttkInnerExtra}
            ) tew
            INNER JOIN usuarios u ON u.id_usuario = tew.id_author
            GROUP BY tew.id_author
          ) t
          LEFT JOIN BILLING b ON b.id = ? AND b.id_dealer_provider = ?
        )
      ) u
      ORDER BY u.id`,
      [...genericParams, ...ttkInnerParams, ...ttkOuterParams],
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

  /**
   * Authors who have created invoices in the dealer scope (legacy haveInvoice filter).
   * Source: distinct INVOICE_STATEMENT.id_author for the provider + dealers.
   */
  async lookupAuthors(f: {
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
    // Legacy fills this combo through /ajax/json.usuarios.php with isEmployee=1 and
    // haveInvoice (json.usuarios.php:69-78, UsuarioDao:136), which restricts users to:
    // employees only, active only, and belonging to the caller's company. Administrator
    // (id 1) is excluded by the last one — id_contratista_owner NULL, yet it authors
    // thousands of statements from batch runs.
    // NOTE: keep these notes out of the SQL string — a `?` inside a SQL comment is still
    // counted as a positional placeholder by the driver and breaks the query.
    //
    // Param order: statement provider, author's own company, then dealer restriction.
    const params: any[] = [f.idDealerProvider, f.idDealerProvider, ...restrict.params]
    let extra = ''
    if (f.search) {
      extra += ' AND u.nombre LIKE CONCAT(\'%\', ?, \'%\')'
      params.push(f.search)
    }
    const rows = await this.srs.query(
      `SELECT DISTINCT u.id_usuario AS id, u.nombre AS label
       FROM INVOICE_STATEMENT s
       INNER JOIN CONTRATISTA c ON c.id = s.id_dealer
       INNER JOIN usuarios u ON u.id_usuario = s.id_author
       WHERE s.estado = 1
         AND s.id_dealer_provider = ?
         AND s.id_author IS NOT NULL
         AND s.id_author > 0
         AND u.is_empleado = 1
         AND u.estado = 1
         AND u.id_contratista_owner = ?
         ${restrict.and}
         ${extra}
       ORDER BY u.nombre
       LIMIT ${Math.trunc(f.limit)}`,
      params,
    )
    return rows.map((r: any) => ({
      id: Number(r.id),
      label: String(r.label ?? ''),
    }))
  }

  /**
   * Employees who appear on TTK/Generic invoice lines (id_employee_work → punch author).
   * Copied from lookupAuthors: same dealer restriction, provider, is_empleado, LIMIT, LIKE.
   */
  async lookupWorkers(f: {
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
    const params: any[] = [
      f.idDealerProvider,
      f.idDealerProvider,
      f.idDealerProvider,
      ...restrict.params,
    ]
    let extra = ''
    if (f.search) {
      extra += ' AND u.nombre LIKE CONCAT(\'%\', ?, \'%\')'
      params.push(f.search)
    }
    const rows = await this.srs.query(
      `SELECT DISTINCT u.id_usuario AS id, u.nombre AS label,
              u.thumbnail_uuid AS thumbnail_uuid, u.logo_img AS logo_img
       FROM INVOICE_STATEMENT s
       INNER JOIN CONTRATISTA c ON c.id = s.id_dealer
       INNER JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
       INNER JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work
       INNER JOIN usuarios u ON u.id_usuario = tew.id_author
       WHERE s.estado = 1
         AND s.statement_type IN (${StatementType.TTK}, ${StatementType.GENERIC})
         AND s.id_dealer_provider = ?
         AND tew.id_dealer_provider = ?
         AND u.is_empleado = 1
         AND u.estado = 1
         AND u.id_contratista_owner = ?
         ${restrict.and}
         ${extra}
       ORDER BY u.nombre
       LIMIT ${Math.trunc(f.limit)}`,
      params,
    )
    return rows.map((r: any) => ({
      id: Number(r.id),
      label: String(r.label ?? ''),
      thumbnailUuid: r.thumbnail_uuid ? String(r.thumbnail_uuid) : null,
      logoImg: r.logo_img ? String(r.logo_img) : null,
    }))
  }

  /**
   * Districts (datos_parametricos, CategoriaParametrica::$ID_DISTRICTS = 23) for the
   * provider, with linked dealer customer ids.
   * Client filters the dealer multiselect by these ids (legacy districtManager parity).
   */
  async lookupDistricts(f: {
    idDealerProvider: number
    search?: string
    limit: number
  }): Promise<Array<InvoiceLookupOptionDto & { dealerIds: number[] }>> {
    // Order matters: join provider, category, then the owner filter (legacy
    // `addingIdDealer`: global districts plus the caller company's own).
    const params: any[] = [f.idDealerProvider, 23, f.idDealerProvider]
    let extra = ''
    if (f.search) {
      extra += ' AND dp.nombre LIKE CONCAT(\'%\', ?, \'%\')'
      params.push(f.search)
    }
    // Table/column names mirror DatosParametricosDao (legacy): `datos_parametricos`
    // keyed by `id_dato_parametrico`, categories joined through `categorias_parametricas`.
    const rows = await this.srs.query(
      `SELECT dp.id_dato_parametrico AS id, dp.nombre AS label,
              GROUP_CONCAT(DISTINCT dr.id_dealer_customer) AS dealer_ids
       FROM datos_parametricos dp
       INNER JOIN categorias_parametricas cp
         ON cp.id_categoria_parametrica = dp.id_categoria_parametrica
        AND cp.estado = 1
       LEFT JOIN DEALER_DISTRICT_REL ddr ON ddr.id_district = dp.id_dato_parametrico
       LEFT JOIN DEALER_REL dr ON dr.id = ddr.id_dealer_rel
         AND dr.id_dealer_provider = ?
         AND dr.fecha_end IS NULL
       WHERE dp.id_categoria_parametrica = ?
         AND dp.estado = 1
         AND (dp.id_dealer IS NULL OR dp.id_dealer = ?)
         ${extra}
       GROUP BY dp.id_dato_parametrico, dp.nombre
       ORDER BY dp.nombre
       LIMIT ${Math.trunc(f.limit)}`,
      params,
    )
    return rows.map((r: any) => ({
      id: Number(r.id),
      label: String(r.label ?? ''),
      dealerIds: String(r.dealer_ids ?? '')
        .split(',')
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0),
    }))
  }
}
