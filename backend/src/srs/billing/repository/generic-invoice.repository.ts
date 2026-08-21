import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import {
  GenericCatalogItemDto,
  GenericInvoiceDetailDto,
  GenericTtkEmployeeRowDto,
  GenericTtkEmployeesResponseDto,
} from '../dto/generic-invoice.dto'
import { GenericInvoiceConflictError } from '../generic-invoice-conflict.error'
import {
  aCentavos,
  centsToPesos,
  dividirYRedondear,
  valorLinea,
  valorLineaTtk,
} from '../generic-invoice-money'
import { assertRelWriteAffected } from '../generic-invoice-write-errors'

const CAT_GENERIC_ITEM = 36
const CAT_HEADER_NOTE = 44
const STATEMENT_TYPE_GENERIC = 6
const GENERIC_NAME_MAX = 128
const PAY_SALARY = 3
const PAY_COMMISSION = 15003
const HOURS_SQL =
  'TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1)'

export type CompanyGatesRow = {
  hasGenericInvoice: boolean
  typeEfectivo: number | null
}

export type CreatedStatement = {
  id: number
  invoiceNro: number
  fullNro: string
}

export type CatalogPriceChange = {
  name: string
  idDealer: number
  priceOld: number | null
  priceNew: number
}

export type PersistLine =
  | { kind: 'free'; description: string; qty: number | null; unitAmount: number }
  | { kind: 'ttk'; idEmployeeWork: number; amount: number | null; onlyTimecard: boolean }

export type TtkPunchRow = {
  idEmployee: number
  idEmployeeWork: number
  hours: number
  amount: number | null
  onThisInvoice: boolean
}

export type GenericStatementHeader = {
  id: number
  fullNro: string
  idDealer: number
  dealerName: string
  dateFrom: string
  dateTo: string
  invoiceNote: string | null
  headerNote: string | null
  tax: number | null
  discount: number | null
  discountType: number | null
  discountDetail: string | null
  statementPaid: boolean
  estado: number
  statementType: number
  idDealerProvider: number
}

export type CatalogUpsert = { name: string; price: number }

export type UpdateGenericParams = {
  idStatement: number
  idDealerProvider: number
  idAuthor: number
  dateFrom: string
  dateTo: string
  invoiceNote: string | null
  headerNote: string | null
  tax: number | null
  freeItems: Array<{
    idRel?: number
    description: string
    qty: number | null
    unitAmount: number
  }>
  ttkItems: Array<{ idEmployee: number; onlyTimecard: boolean }>
  punchesByEmployee: Map<number, TtkPunchRow[]>
}

function mysqlInsertId(result: unknown): number {
  if (result && typeof result === 'object' && 'insertId' in result) {
    const id = Number((result as { insertId: number }).insertId)
    if (Number.isFinite(id) && id > 0) return id
  }
  throw new Error('INSERT did not return insertId')
}

function mysqlAffectedRows(result: unknown): number {
  if (result && typeof result === 'object' && 'affectedRows' in result) {
    return Number((result as { affectedRows: number }).affectedRows) || 0
  }
  return 0
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function ymd(value: unknown): string {
  return String(value ?? '').slice(0, 10)
}

function sameNum(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return aCentavos(a) === aCentavos(b)
}

@Injectable()
export class GenericInvoiceRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async loadCompanyGates(idDealerProvider: number): Promise<CompanyGatesRow | null> {
    const rows = await this.srs.query(
      `SELECT c.has_generic_invoice AS hasGenericInvoice,
              COALESCE(p.type, c.type) AS typeEfectivo
       FROM CONTRATISTA c
       LEFT JOIN CONTRATISTA p ON p.id = c.id_empresa
       WHERE c.id = ?
       LIMIT 1`,
      [idDealerProvider],
    )
    if (!rows.length) return null
    const row = rows[0]
    return {
      hasGenericInvoice: Number(row.hasGenericInvoice) === 1,
      typeEfectivo: row.typeEfectivo == null ? null : Number(row.typeEfectivo),
    }
  }

  async dealerRelExists(idDealer: number, idDealerProvider: number): Promise<boolean> {
    const rows = await this.srs.query(
      `SELECT 1 AS ok
       FROM DEALER_REL
       WHERE id_dealer_customer = ?
         AND id_dealer_provider = ?
         AND estado = 1
       LIMIT 1`,
      [idDealer, idDealerProvider],
    )
    return rows.length > 0
  }

  async restrictionDealerAllows(idUsuario: number, idDealer: number): Promise<boolean> {
    const rows = await this.srs.query(
      `SELECT RESTRICTION_DEALER_V2(?, ?) AS ok`,
      [idUsuario, idDealer],
    )
    return Number(rows[0]?.ok) === 1
  }

  async checkDateFreeze(
    idUsuario: number,
    idDealer: number,
    idDealerProvider: number,
    dateFrom: string,
  ): Promise<number> {
    const rows = await this.srs.query(
      `SELECT CHECK_DATE_FREEZE(?, ?, ?, ?) AS res`,
      [idUsuario, idDealer, idDealerProvider, dateFrom],
    )
    return Number(rows[0]?.res)
  }

  async upsertCatalogItem(
    idDealerProvider: number,
    idDealer: number,
    idUsuario: number,
    name: string,
    price: number,
  ): Promise<CatalogPriceChange | null> {
    const rows = await this.srs.query(
      `SELECT id, price
       FROM GENERIC_DATA
       WHERE estado = 1
         AND id_categoria = ?
         AND id_dealer_provider = ?
         AND id_dealer = ?
         AND name = ?`,
      [CAT_GENERIC_ITEM, idDealerProvider, idDealer, name],
    )
    if (!rows.length) {
      await this.srs.query(
        `INSERT INTO GENERIC_DATA
           (id_categoria, id_dealer_provider, id_dealer, id_usuario, name, type, price)
         SELECT ?, ?, ?, ?, ?, 1, ?
         FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM GENERIC_DATA
           WHERE estado = 1
             AND id_categoria = ?
             AND id_dealer_provider = ?
             AND id_dealer = ?
             AND name = ?
         )`,
        [
          CAT_GENERIC_ITEM,
          idDealerProvider,
          idDealer,
          idUsuario,
          name,
          price,
          CAT_GENERIC_ITEM,
          idDealerProvider,
          idDealer,
          name,
        ],
      )
      return null
    }
    const current = rows[0].price == null ? null : Number(rows[0].price)
    if (current === price) return null
    await this.srs.query(
      `UPDATE GENERIC_DATA
       SET price = ?
       WHERE estado = 1
         AND id_categoria = ?
         AND id_dealer_provider = ?
         AND id_dealer = ?
         AND name = ?`,
      [price, CAT_GENERIC_ITEM, idDealerProvider, idDealer, name],
    )
    return { name, idDealer, priceOld: current, priceNew: price }
  }

  async logCatalogPriceChanges(
    idStatement: number,
    idAutor: number,
    cambios: CatalogPriceChange[],
  ): Promise<void> {
    for (const cambio of cambios) {
      await this.srs.query(
        `INSERT INTO LOG_CHANGE (
           id_invoice_service, id_invoice, id_invoice_statement, id_billing, id_dealer_rel,
           id_autor, desc_cambio, desc_json, origen
         ) VALUES (NULL, NULL, ?, NULL, NULL, ?, 'Generic catalog price change', ?, NULL)`,
        [idStatement, idAutor, JSON.stringify(cambio)],
      )
    }
  }

  async upsertCatalogHeaderNote(
    idDealerProvider: number,
    idDealer: number,
    idUsuario: number,
    name: string,
  ): Promise<void> {
    if (name.length > GENERIC_NAME_MAX) return
    await this.srs.query(
      `INSERT INTO GENERIC_DATA
         (id_categoria, id_dealer_provider, id_dealer, id_usuario, name, type)
       SELECT ?, ?, ?, ?, ?, 1
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM GENERIC_DATA
         WHERE estado = 1
           AND id_categoria = ?
           AND id_dealer_provider = ?
           AND id_dealer = ?
           AND name = ?
       )`,
      [
        CAT_HEADER_NOTE,
        idDealerProvider,
        idDealer,
        idUsuario,
        name,
        CAT_HEADER_NOTE,
        idDealerProvider,
        idDealer,
        name,
      ],
    )
  }

  async listCatalog(
    cat: 36 | 44,
    idDealer: number,
    idDealerProvider: number,
    q: string | undefined,
  ): Promise<GenericCatalogItemDto[]> {
    const like = `%${q ?? ''}%`
    const rows = await this.srs.query(
      `SELECT g.id, g.name, g.price, g.id_dealer_provider
       FROM GENERIC_DATA g
       WHERE g.estado = 1
         AND g.id_categoria = ?
         AND g.id_dealer = ?
         AND (g.id_dealer_provider = ? OR g.id_dealer_provider IS NULL)
         AND g.name LIKE ?
       ORDER BY g.name
       LIMIT 200`,
      [cat, idDealer, idDealerProvider, like],
    )
    return rows.map((row: any) => ({
      id: Number(row.id),
      name: String(row.name ?? ''),
      price: row.price == null || row.price === '' ? null : Number(row.price),
      canDelete:
        cat === CAT_GENERIC_ITEM &&
        row.id_dealer_provider != null &&
        Number(row.id_dealer_provider) === idDealerProvider,
    }))
  }

  async softDeleteCatalogItem(id: number, idDealerProvider: number): Promise<number> {
    const result = await this.srs.query(
      `UPDATE GENERIC_DATA
       SET estado = 0
       WHERE id = ?
         AND id_dealer_provider = ?
         AND id_categoria = ?
         AND estado = 1`,
      [id, idDealerProvider, CAT_GENERIC_ITEM],
    )
    return mysqlAffectedRows(result)
  }

  async createStatement(params: {
    idDealer: number
    idDealerProvider: number
    idAuthor: number
    dateFrom: string
    dateTo: string
    invoiceNote: string | null
    headerNote: string | null
    tax: number | null
    selRel: string
    items: PersistLine[]
  }): Promise<CreatedStatement> {
    return this.srs.transaction(async (mgr) => this.insertStatementTx(mgr, params))
  }

  private async insertStatementTx(
    mgr: EntityManager,
    params: {
      idDealer: number
      idDealerProvider: number
      idAuthor: number
      dateFrom: string
      dateTo: string
      invoiceNote: string | null
      headerNote: string | null
      tax: number | null
      selRel: string
      items: PersistLine[]
    },
  ): Promise<CreatedStatement> {
    const maxRows = await mgr.query(
      `SELECT COALESCE(MAX(invoice_nro), 0) AS nro
       FROM INVOICE_STATEMENT
       WHERE id_dealer = ?
         AND id_dealer_provider = ?
       FOR UPDATE`,
      [params.idDealer, params.idDealerProvider],
    )
    const maxNro = Number(maxRows[0]?.nro ?? 0)

    const relRows = await mgr.query(
      `SELECT ini_nro_inv, prefix_invoice
       FROM DEALER_REL
       WHERE id_dealer_customer = ?
         AND id_dealer_provider = ?
         AND estado = 1
       ORDER BY fecha_ini ASC, id ASC
       LIMIT 1`,
      [params.idDealer, params.idDealerProvider],
    )
    const prefixRaw = relRows[0]?.prefix_invoice
    const prefix = String(prefixRaw ?? '').toUpperCase()
    const iniNro = relRows[0]?.ini_nro_inv
    const invoiceNro =
      maxNro > 0 ? maxNro + 1 : iniNro == null || iniNro === '' ? 1 : Number(iniNro) || 1
    const fullNro = `${prefix}${invoiceNro}`

    const headerResult = await mgr.query(
      `INSERT INTO INVOICE_STATEMENT (
         id_dealer, id_dealer_provider, id_department, id_invoice_service, id_author,
         invoice_prefix, invoice_nro, statement_type, fecha_desde, fecha_hasta, full_nro,
         invoice_service_sel_rel, discount, discount_detail, id_invoice_statement_schedule,
         po, invoice_note, header_note, tax
       ) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
      [
        params.idDealer,
        params.idDealerProvider,
        params.idAuthor,
        prefix,
        invoiceNro,
        STATEMENT_TYPE_GENERIC,
        params.dateFrom,
        params.dateTo,
        fullNro,
        params.selRel,
        params.invoiceNote,
        params.headerNote,
        params.tax,
      ],
    )
    const idStatement = mysqlInsertId(headerResult)

    for (const item of params.items) {
      if (item.kind === 'ttk') {
        const only = item.onlyTimecard ? 1 : 0
        await mgr.query(
          `INSERT INTO INVOICE_STATEMENT_INV_REL (
             id_statement, id_invoice, id_invoice_service, id_employee_work,
             amount, description, generic_qty, only_timecard
           ) VALUES (?, NULL, NULL, ?, ?, NULL, ?, ?)`,
          [
            idStatement,
            item.idEmployeeWork,
            only ? 0 : item.amount,
            only ? 0 : null,
            only,
          ],
        )
        continue
      }
      await mgr.query(
        `INSERT INTO INVOICE_STATEMENT_INV_REL (
           id_statement, id_invoice, id_invoice_service, id_employee_work,
           amount, description, generic_qty, only_timecard
         ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, 0)`,
        [idStatement, item.unitAmount, item.description, item.qty],
      )
    }

    const snap = await this.buildLogSnapshot(mgr, {
      idStatement,
      idDealer: params.idDealer,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      invoiceNote: params.invoiceNote,
      headerNote: params.headerNote,
      tax: params.tax,
      fullNro,
    })

    await mgr.query(
      `INSERT INTO LOG_CHANGE (
         id_invoice_service, id_invoice, id_invoice_statement, id_billing, id_dealer_rel,
         id_autor, desc_cambio, desc_json, origen
       ) VALUES (NULL, NULL, ?, NULL, NULL, ?, ?, ?, NULL)`,
      [idStatement, params.idAuthor, 'Generic invoice creation', JSON.stringify(snap)],
    )

    return { id: idStatement, invoiceNro, fullNro }
  }

  async loadGenericHeader(
    id: number,
    idDealerProvider: number,
  ): Promise<GenericStatementHeader | null> {
    const rows = await this.srs.query(
      `SELECT s.id, s.full_nro, s.id_dealer, c.razon_social AS dealer_name,
              s.fecha_desde, s.fecha_hasta, s.invoice_note, s.header_note, s.tax,
              s.discount, s.discount_type, s.discount_detail,
              s.estado, s.statement_type, s.id_dealer_provider,
              IS_STATEMENT_BILLED(s.id) AS statement_paid
       FROM INVOICE_STATEMENT s
       INNER JOIN CONTRATISTA c ON c.id = s.id_dealer
       WHERE s.id = ?
         AND s.id_dealer_provider = ?
         AND s.statement_type = ?
         AND s.estado = 1
       LIMIT 1`,
      [id, idDealerProvider, STATEMENT_TYPE_GENERIC],
    )
    if (!rows.length) return null
    return this.mapHeader(rows[0])
  }

  async loadGenericDetail(
    id: number,
    idDealerProvider: number,
  ): Promise<GenericInvoiceDetailDto | null> {
    const header = await this.loadGenericHeader(id, idDealerProvider)
    if (!header) return null

    const freeRows = await this.srs.query(
      `SELECT isir.id, isir.description, isir.generic_qty, isir.amount,
              IS_INVOICE_TTK_GENERIC_BILLED(isir.id_statement, isir.id) AS is_paid
       FROM INVOICE_STATEMENT_INV_REL isir
       WHERE isir.id_statement = ?
         AND isir.id_employee_work IS NULL
       ORDER BY isir.id`,
      [id],
    )
    const ttkRows = await this.srs.query(
      `SELECT isir.id, isir.amount, isir.only_timecard,
              IS_INVOICE_TTK_GENERIC_BILLED(isir.id_statement, isir.id) AS is_paid,
              tew.id_author, tew.id_dealer,
              ${HOURS_SQL} AS hours,
              u.nombre AS employee_name,
              (SELECT MAX(r.nombre) FROM USUARIO_ROL_REL urr
                INNER JOIN ROL r ON r.id_rol = urr.id_rol
                WHERE urr.id_dealer_asigned = tew.id_dealer AND urr.id_usuario = tew.id_author) AS rol_name,
              (SELECT MAX(dp.nombre) FROM USUARIO_ROL_REL urr
                INNER JOIN ROL r ON r.id_rol = urr.id_rol
                INNER JOIN DEPARTMENT dp ON dp.id = r.id_department
                WHERE urr.id_dealer_asigned = tew.id_dealer AND urr.id_usuario = tew.id_author) AS dpto_name
       FROM INVOICE_STATEMENT_INV_REL isir
       INNER JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work AND tew.estado = 1
       INNER JOIN usuarios u ON u.id_usuario = tew.id_author
       WHERE isir.id_statement = ?
       ORDER BY isir.id`,
      [id],
    )

    const items: GenericInvoiceDetailDto['items'] = []
    for (const row of freeRows) {
      items.push({
        kind: 'free',
        idRel: Number(row.id),
        description: String(row.description ?? ''),
        qty: num(row.generic_qty),
        unitAmount: Number(row.amount ?? 0),
        isPaid: Number(row.is_paid) === 1 || header.statementPaid,
      })
    }

    const byEmployee = new Map<
      number,
      {
        idRels: number[]
        nombreEmployee: string
        rolName: string | null
        dptoName: string | null
        hoursReg: number
        amountDealer: number
        onlyTimecard: number
        linePaid: boolean
      }
    >()
    for (const row of ttkRows) {
      const idEmployee = Number(row.id_author)
      let group = byEmployee.get(idEmployee)
      if (!group) {
        group = {
          idRels: [],
          nombreEmployee: String(row.employee_name ?? ''),
          rolName: row.rol_name == null ? null : String(row.rol_name),
          dptoName: row.dpto_name == null ? null : String(row.dpto_name),
          hoursReg: 0,
          amountDealer: 0,
          onlyTimecard: 0,
          linePaid: false,
        }
        byEmployee.set(idEmployee, group)
      }
      group.idRels.push(Number(row.id))
      group.hoursReg += Number(row.hours ?? 0)
      group.amountDealer += Number(row.amount ?? 0)
      group.onlyTimecard = Math.max(group.onlyTimecard, Number(row.only_timecard ?? 0))
      if (Number(row.is_paid) === 1) group.linePaid = true
    }
    for (const [idEmployee, group] of byEmployee) {
      items.push({
        kind: 'ttk',
        idRels: group.idRels,
        idEmployee,
        nombreEmployee: group.nombreEmployee,
        rolName: group.rolName,
        dptoName: group.dptoName,
        hoursReg: group.hoursReg,
        amountDealer: group.amountDealer,
        onlyTimecard: group.onlyTimecard === 1,
        isPaid: header.statementPaid || group.linePaid,
      })
    }

    return {
      id: header.id,
      fullNro: header.fullNro,
      idDealer: header.idDealer,
      dealerName: header.dealerName,
      dateFrom: header.dateFrom,
      dateTo: header.dateTo,
      invoiceNote: header.invoiceNote,
      headerNote: header.headerNote,
      tax: header.tax,
      discount: header.discount,
      discountType: header.discountType,
      discountDetail: header.discountDetail,
      statementPaid: header.statementPaid,
      items,
    }
  }

  async listTtkEmployees(args: {
    idDealer: number
    idDealerProvider: number
    dateFrom: string
    dateTo: string
    includeStatementId?: number
  }): Promise<GenericTtkEmployeesResponseDto> {
    const punches = await this.listTtkPunches(args)
    const names = await this.loadEmployeeNames(
      args.idDealer,
      [...new Set(punches.map((p) => p.idEmployee))],
    )
    const grouped = new Map<
      number,
      { hoursOn: number; hoursUnbilled: number; amountOn: number; amountUnbilled: number }
    >()
    for (const punch of punches) {
      let g = grouped.get(punch.idEmployee)
      if (!g) {
        g = { hoursOn: 0, hoursUnbilled: 0, amountOn: 0, amountUnbilled: 0 }
        grouped.set(punch.idEmployee, g)
      }
      const hours = punch.hours
      const amount = punch.amount ?? 0
      if (punch.onThisInvoice) {
        g.hoursOn += hours
        g.amountOn += amount
      } else {
        g.hoursUnbilled += hours
        g.amountUnbilled += amount
      }
    }
    const rows: GenericTtkEmployeeRowDto[] = []
    for (const [idEmployee, g] of grouped) {
      const already = g.hoursOn > 0 || punches.some((p) => p.idEmployee === idEmployee && p.onThisInvoice)
      const info = names.get(idEmployee)
      rows.push({
        idEmployee,
        nombreEmployee: info?.nombre ?? '',
        rolName: info?.rolName ?? null,
        dptoName: info?.dptoName ?? null,
        hoursReg: already ? g.hoursOn : g.hoursUnbilled,
        amountDealer: already ? g.amountOn : g.amountUnbilled,
        alreadyOnInvoice: already,
        hoursUnbilledInRange: already ? g.hoursUnbilled : 0,
      })
    }
    rows.sort((a, b) => a.nombreEmployee.localeCompare(b.nombreEmployee))
    const totals = {
      employees: rows.length,
      hours: rows.reduce((s, r) => s + r.hoursReg, 0),
      amountDealer: rows.reduce((s, r) => s + r.amountDealer, 0),
    }
    return { rows, totals }
  }

  async listTtkPunches(args: {
    idDealer: number
    idDealerProvider: number
    dateFrom: string
    dateTo: string
    includeStatementId?: number
    idEmployees?: number[]
  }): Promise<TtkPunchRow[]> {
    const amountSql = `ROUND(${HOURS_SQL} * TTK_GET_DEALER_PAYROLL(tew.id_author, tew.id_dealer), 2)`
    const notInvoicedAnywhere = `NOT EXISTS (
      SELECT lisir.id FROM INVOICE_STATEMENT_INV_REL lisir
      INNER JOIN INVOICE_STATEMENT _is ON _is.id = lisir.id_statement AND _is.estado = 1
      WHERE lisir.id_employee_work = tew.id
    )`
    const params: unknown[] = []
    let onThisSql = '0'
    let eligibility: string
    if (args.includeStatementId == null) {
      eligibility = `tew.punch_in BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) AND ${notInvoicedAnywhere}`
    } else {
      onThisSql = `CASE WHEN EXISTS (
        SELECT 1 FROM INVOICE_STATEMENT_INV_REL lisir
        WHERE lisir.id_employee_work = tew.id AND lisir.id_statement = ?
      ) THEN 1 ELSE 0 END`
      eligibility = `(
        (tew.punch_in BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY) AND ${notInvoicedAnywhere})
        OR EXISTS (
          SELECT 1 FROM INVOICE_STATEMENT_INV_REL lisir
          WHERE lisir.id_employee_work = tew.id AND lisir.id_statement = ?
        )
      )`
      params.push(args.includeStatementId)
    }
    params.push(args.idDealer, args.idDealerProvider)
    if (args.includeStatementId == null) {
      params.push(args.dateFrom, args.dateTo)
    } else {
      params.push(args.dateFrom, args.dateTo, args.includeStatementId)
    }
    let employeeSql = ''
    if (args.idEmployees && args.idEmployees.length > 0) {
      employeeSql = ` AND tew.id_author IN (${args.idEmployees.map(() => '?').join(',')})`
      params.push(...args.idEmployees)
    }
    const rows = await this.srs.query(
      `SELECT tew.id AS id_employee_work,
              tew.id_author AS id_employee,
              ${HOURS_SQL} AS hours,
              ${amountSql} AS amount,
              ${onThisSql} AS on_this
       FROM TTK_EMPLOYEE_WORK tew
       WHERE tew.estado = 1
         AND tew.id_dealer = ?
         AND tew.id_dealer_provider = ?
         AND (tew.id_payment_type <> ${PAY_SALARY} AND tew.id_payment_type <> ${PAY_COMMISSION})
         AND ${eligibility}
         ${employeeSql}`,
      params,
    )
    return rows.map((row: any) => ({
      idEmployee: Number(row.id_employee),
      idEmployeeWork: Number(row.id_employee_work),
      hours: Number(row.hours ?? 0),
      amount: num(row.amount),
      onThisInvoice: Number(row.on_this) === 1,
    }))
  }

  async loadEmployeeNames(
    idDealer: number,
    idEmployees: number[],
  ): Promise<Map<number, { nombre: string; rolName: string | null; dptoName: string | null }>> {
    const map = new Map<number, { nombre: string; rolName: string | null; dptoName: string | null }>()
    if (idEmployees.length === 0) return map
    const rows = await this.srs.query(
      `SELECT u.id_usuario,
              u.nombre,
              (SELECT MAX(r.nombre) FROM USUARIO_ROL_REL urr
                INNER JOIN ROL r ON r.id_rol = urr.id_rol
                WHERE urr.id_dealer_asigned = ? AND urr.id_usuario = u.id_usuario) AS rol_name,
              (SELECT MAX(dp.nombre) FROM USUARIO_ROL_REL urr
                INNER JOIN ROL r ON r.id_rol = urr.id_rol
                INNER JOIN DEPARTMENT dp ON dp.id = r.id_department
                WHERE urr.id_dealer_asigned = ? AND urr.id_usuario = u.id_usuario) AS dpto_name
       FROM usuarios u
       WHERE u.id_usuario IN (${idEmployees.map(() => '?').join(',')})`,
      [idDealer, idDealer, ...idEmployees],
    )
    for (const row of rows) {
      map.set(Number(row.id_usuario), {
        nombre: String(row.nombre ?? ''),
        rolName: row.rol_name == null ? null : String(row.rol_name),
        dptoName: row.dpto_name == null ? null : String(row.dpto_name),
      })
    }
    return map
  }

  async updateGenericInvoice(
    params: UpdateGenericParams,
  ): Promise<{ id: number; fullNro: string; catalogUpserts: CatalogUpsert[] }> {
    return this.srs.transaction(async (mgr) => this.updateGenericInvoiceTx(mgr, params))
  }

  private async updateGenericInvoiceTx(
    mgr: EntityManager,
    params: UpdateGenericParams,
  ): Promise<{ id: number; fullNro: string; catalogUpserts: CatalogUpsert[] }> {
    const headerRows = await mgr.query(
      `SELECT id, full_nro, id_dealer, id_dealer_provider, statement_type, estado,
              fecha_desde, fecha_hasta, invoice_note, header_note, tax
       FROM INVOICE_STATEMENT
       WHERE id = ?
         AND id_dealer_provider = ?
       FOR UPDATE`,
      [params.idStatement, params.idDealerProvider],
    )
    if (!headerRows.length) {
      throw new NotFoundException('Invoice not found')
    }
    const header = headerRows[0]
    if (
      Number(header.statement_type) !== STATEMENT_TYPE_GENERIC ||
      Number(header.estado) !== 1
    ) {
      throw new NotFoundException('Invoice not found')
    }
    const billedRows = await mgr.query(
      `SELECT IS_STATEMENT_BILLED(?) AS statement_paid`,
      [params.idStatement],
    )
    if (Number(billedRows[0]?.statement_paid) === 1) {
      throw new GenericInvoiceConflictError(
        'STATEMENT_PAID',
        'This invoice has been paid and cannot be edited.',
      )
    }

    const storedDateFrom = ymd(header.fecha_desde)
    const idDealer = Number(header.id_dealer)
    const fullNro = String(header.full_nro ?? '')

    const relRows = await mgr.query(
      `SELECT isir.id, isir.id_employee_work, isir.description, isir.amount, isir.generic_qty,
              isir.only_timecard, tew.id_author, tew.estado AS tew_estado
       FROM INVOICE_STATEMENT_INV_REL isir
       LEFT JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work
       WHERE isir.id_statement = ?
         AND (isir.id_employee_work IS NULL OR tew.estado = 1)
       FOR UPDATE`,
      [params.idStatement],
    )
    const paidRows = await mgr.query(
      `SELECT isir.id, IS_INVOICE_TTK_GENERIC_BILLED(isir.id_statement, isir.id) AS is_paid
       FROM INVOICE_STATEMENT_INV_REL isir
       WHERE isir.id_statement = ?`,
      [params.idStatement],
    )
    const paidById = new Map<number, boolean>()
    for (const row of paidRows) {
      paidById.set(Number(row.id), Number(row.is_paid) === 1)
    }

    type Rel = {
      id: number
      idEmployeeWork: number | null
      idAuthor: number | null
      description: string
      amount: number | null
      genericQty: number | null
      onlyTimecard: number
      isPaid: boolean
    }
    const rels: Rel[] = relRows.map((row: any) => ({
      id: Number(row.id),
      idEmployeeWork: row.id_employee_work == null ? null : Number(row.id_employee_work),
      idAuthor: row.id_author == null ? null : Number(row.id_author),
      description: String(row.description ?? ''),
      amount: num(row.amount),
      genericQty: num(row.generic_qty),
      onlyTimecard: Number(row.only_timecard ?? 0),
      isPaid: paidById.get(Number(row.id)) === true,
    }))

    const freeInDb = rels.filter((r) => r.idEmployeeWork == null)
    const ttkInDb = rels.filter((r) => r.idEmployeeWork != null)
    const ttkByEmployee = new Map<number, Rel[]>()
    for (const rel of ttkInDb) {
      const idEmp = rel.idAuthor ?? 0
      const list = ttkByEmployee.get(idEmp) ?? []
      list.push(rel)
      ttkByEmployee.set(idEmp, list)
    }

    if (ttkInDb.length > 0 && (params.dateFrom !== storedDateFrom || params.dateTo !== ymd(header.fecha_hasta))) {
      throw new BadRequestException('Dates cannot be changed while this invoice has TTK lines.')
    }

    const freeById = new Map(freeInDb.map((r) => [r.id, r]))
    const bodyFreeIds = new Set<number>()
    for (const item of params.freeItems) {
      if (item.idRel == null) continue
      if (bodyFreeIds.has(item.idRel)) {
        throw new BadRequestException('Duplicate line id.')
      }
      bodyFreeIds.add(item.idRel)
      const stored = freeById.get(item.idRel)
      if (!stored) {
        throw new BadRequestException('Invalid line id.')
      }
    }

    for (const [idEmployee, group] of ttkByEmployee) {
      const body = params.ttkItems.find((t) => t.idEmployee === idEmployee)
      if (!body) continue
      const storedFlag = Math.max(...group.map((r) => r.onlyTimecard)) === 1
      if (Boolean(body.onlyTimecard) !== storedFlag) {
        throw new BadRequestException('Only for Timecard cannot be changed on an existing TTK line.')
      }
    }

    const survivingPaidDescriptions = freeInDb
      .filter((r) => r.isPaid && !bodyFreeIds.has(r.id))
      .map((r) => r.description.toLowerCase())
    const bodyDescriptions = params.freeItems.map((i) => i.description.toLowerCase())
    const descSeen = new Set<string>(survivingPaidDescriptions)
    for (const d of bodyDescriptions) {
      if (descSeen.has(d)) {
        throw new BadRequestException('Item already exists')
      }
      descSeen.add(d)
    }

    const catalogUpserts: CatalogUpsert[] = []

    for (const item of params.freeItems) {
      if (item.idRel == null) {
        await mgr.query(
          `INSERT INTO INVOICE_STATEMENT_INV_REL (
             id_statement, id_invoice, id_invoice_service, id_employee_work,
             amount, description, generic_qty, only_timecard
           ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, 0)`,
          [params.idStatement, item.unitAmount, item.description, item.qty],
        )
        catalogUpserts.push({ name: item.description, price: item.unitAmount })
        continue
      }
      const stored = freeById.get(item.idRel)!
      if (stored.isPaid) {
        throw new GenericInvoiceConflictError(
          'LINE_PAID',
          'A billed line cannot be changed.',
        )
      }
      const changed =
        !sameNum(stored.amount, item.unitAmount) ||
        stored.description !== item.description ||
        !sameNum(stored.genericQty, item.qty)
      if (!changed) continue
      const result = await mgr.query(
        `UPDATE INVOICE_STATEMENT_INV_REL
         SET amount = ?, description = ?, generic_qty = ?
         WHERE id = ?
           AND id_statement = ?
           AND id_employee_work IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM BILLING_WO_REL b
             JOIN BILLING bi ON bi.id = b.id_billing AND bi.estado = 1
             WHERE b.id_statement_inv_rel = ?
           )`,
        [
          item.unitAmount,
          item.description,
          item.qty,
          item.idRel,
          params.idStatement,
          item.idRel,
        ],
      )
      assertRelWriteAffected(mysqlAffectedRows(result))
      catalogUpserts.push({ name: item.description, price: item.unitAmount })
    }

    for (const stored of freeInDb) {
      if (bodyFreeIds.has(stored.id) || stored.isPaid) continue
      await this.deleteRelGuarded(mgr, stored.id, params.idStatement)
    }

    const bodyEmployees = new Set(params.ttkItems.map((t) => t.idEmployee))
    for (const [idEmployee, group] of ttkByEmployee) {
      if (bodyEmployees.has(idEmployee)) continue
      if (group.some((r) => r.isPaid)) continue
      for (const rel of group) {
        await this.deleteRelGuarded(mgr, rel.id, params.idStatement)
      }
    }

    for (const item of params.ttkItems) {
      if (ttkByEmployee.has(item.idEmployee)) continue
      const punches = params.punchesByEmployee.get(item.idEmployee) ?? []
      if (punches.length === 0) {
        throw new GenericInvoiceConflictError(
          'EMPLOYEE_NO_ROWS',
          'Selected employee has no billable time in this period.',
          { idEmployee: item.idEmployee },
        )
      }
      for (const punch of punches) {
        const only = item.onlyTimecard ? 1 : 0
        await mgr.query(
          `INSERT INTO INVOICE_STATEMENT_INV_REL (
             id_statement, id_invoice, id_invoice_service, id_employee_work,
             amount, description, generic_qty, only_timecard
           ) VALUES (?, NULL, NULL, ?, ?, NULL, ?, ?)`,
          [
            params.idStatement,
            punch.idEmployeeWork,
            only ? 0 : punch.amount,
            only ? 0 : null,
            only,
          ],
        )
      }
    }

    const remaining = await mgr.query(
      `SELECT COUNT(*) AS n FROM INVOICE_STATEMENT_INV_REL WHERE id_statement = ?`,
      [params.idStatement],
    )
    if (Number(remaining[0]?.n ?? 0) < 1) {
      throw new BadRequestException('The invoice must have at least one item.')
    }

    const selRel = await this.buildSelRel(mgr, params.idStatement)
    if (selRel.length > 9000) {
      throw new BadRequestException('The concatenated item descriptions exceed 9000 characters.')
    }

    await mgr.query(
      `UPDATE INVOICE_STATEMENT
       SET fecha_desde = ?, fecha_hasta = ?, invoice_note = ?, header_note = ?, tax = ?,
           invoice_service_sel_rel = ?
       WHERE id = ?`,
      [
        params.dateFrom,
        params.dateTo,
        params.invoiceNote,
        params.headerNote,
        params.tax,
        selRel,
        params.idStatement,
      ],
    )

    const billingLock = await mgr.query(
      `SELECT b.id FROM BILLING_WO_REL b
       JOIN BILLING bi ON bi.id = b.id_billing AND bi.estado = 1
       WHERE b.id_statement = ?
       FOR UPDATE`,
      [params.idStatement],
    )
    if (billingLock.length > 0) {
      throw new GenericInvoiceConflictError(
        'STATEMENT_PAID',
        'This invoice has been paid and cannot be edited.',
      )
    }

    const snap = await this.buildLogSnapshot(mgr, {
      idStatement: params.idStatement,
      idDealer,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      invoiceNote: params.invoiceNote,
      headerNote: params.headerNote,
      tax: params.tax,
      fullNro,
    })
    await mgr.query(
      `INSERT INTO LOG_CHANGE (
         id_invoice_service, id_invoice, id_invoice_statement, id_billing, id_dealer_rel,
         id_autor, desc_cambio, desc_json, origen
       ) VALUES (NULL, NULL, ?, NULL, NULL, ?, ?, ?, NULL)`,
      [params.idStatement, params.idAuthor, 'Generic invoice update', JSON.stringify(snap)],
    )

    return { id: params.idStatement, fullNro, catalogUpserts }
  }

  private async deleteRelGuarded(
    mgr: EntityManager,
    idRel: number,
    idStatement: number,
  ): Promise<void> {
    await mgr.query(
      `DELETE b FROM BILLING_WO_REL b
       JOIN BILLING bi ON bi.id = b.id_billing AND bi.estado = 0
       WHERE b.id_statement_inv_rel = ?`,
      [idRel],
    )
    const result = await mgr.query(
      `DELETE FROM INVOICE_STATEMENT_INV_REL
       WHERE id = ?
         AND id_statement = ?
         AND NOT EXISTS (
           SELECT 1 FROM BILLING_WO_REL b
           JOIN BILLING bi ON bi.id = b.id_billing AND bi.estado = 1
           WHERE b.id_statement_inv_rel = ?
         )`,
      [idRel, idStatement, idRel],
    )
    assertRelWriteAffected(mysqlAffectedRows(result))
  }

  private async buildSelRel(mgr: EntityManager, idStatement: number): Promise<string> {
    const rows = await mgr.query(
      `SELECT isir.id, isir.description, isir.id_employee_work, tew.id_author, u.nombre
       FROM INVOICE_STATEMENT_INV_REL isir
       LEFT JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work
       LEFT JOIN usuarios u ON u.id_usuario = tew.id_author
       WHERE isir.id_statement = ?
         AND (isir.id_employee_work IS NULL OR tew.estado = 1)
       ORDER BY isir.id`,
      [idStatement],
    )
    const parts: string[] = []
    const seenEmp = new Set<number>()
    for (const row of rows) {
      if (row.id_employee_work == null) {
        parts.push(String(row.description ?? ''))
        continue
      }
      const idAuthor = Number(row.id_author)
      if (seenEmp.has(idAuthor)) continue
      seenEmp.add(idAuthor)
      parts.push(String(row.nombre ?? ''))
    }
    return parts.join(', ')
  }

  private mapHeader(row: any): GenericStatementHeader {
    return {
      id: Number(row.id),
      fullNro: String(row.full_nro ?? ''),
      idDealer: Number(row.id_dealer),
      dealerName: String(row.dealer_name ?? ''),
      dateFrom: ymd(row.fecha_desde),
      dateTo: ymd(row.fecha_hasta),
      invoiceNote: row.invoice_note == null || row.invoice_note === '' ? null : String(row.invoice_note),
      headerNote: row.header_note == null || row.header_note === '' ? null : String(row.header_note),
      tax: num(row.tax),
      discount: num(row.discount),
      discountType: num(row.discount_type),
      discountDetail:
        row.discount_detail == null || row.discount_detail === ''
          ? null
          : String(row.discount_detail),
      statementPaid: Number(row.statement_paid) === 1,
      estado: Number(row.estado),
      statementType: Number(row.statement_type),
      idDealerProvider: Number(row.id_dealer_provider),
    }
  }

  private async buildLogSnapshot(
    mgr: EntityManager,
    args: {
      idStatement: number
      idDealer: number
      dateFrom: string
      dateTo: string
      invoiceNote: string | null
      headerNote: string | null
      tax: number | null
      fullNro: string
    },
  ): Promise<Record<string, unknown>> {
    const dealerRows = await mgr.query(
      `SELECT razon_social FROM CONTRATISTA WHERE id = ? LIMIT 1`,
      [args.idDealer],
    )
    const dealerName = String(dealerRows[0]?.razon_social ?? '')

    const stRows = await mgr.query(
      `SELECT discount,
              discount_type,
              discount_detail,
              GET_SUBTOTAL_BY_STATEMENT(id, NULL) AS base,
              GET_TOTAL_BY_STATEMENT(id, discount, 0, discount_type, NULL) AS total
       FROM INVOICE_STATEMENT WHERE id = ? LIMIT 1`,
      [args.idStatement],
    )
    const discountType = num(stRows[0]?.discount_type)
    const discountDetail = stRows[0]?.discount_detail ?? null
    const base = Number(stRows[0]?.base ?? 0)
    const grandTotal = Number(stRows[0]?.total ?? 0)
    const descuentoEnPesos = centsToPesos(aCentavos(base) - aCentavos(grandTotal))

    const rels = await mgr.query(
      `SELECT isir.amount, isir.description, isir.generic_qty, isir.only_timecard,
              isir.id_employee_work, tew.estado AS tew_estado, tew.id_author, tew.id_dealer,
              u.nombre AS employee_name,
              ${HOURS_SQL} AS hours_i,
              (SELECT MAX(r.nombre) FROM USUARIO_ROL_REL urr
                INNER JOIN ROL r ON r.id_rol = urr.id_rol
                WHERE urr.id_dealer_asigned = tew.id_dealer AND urr.id_usuario = tew.id_author) AS rol_name,
              (SELECT MAX(dp.nombre) FROM USUARIO_ROL_REL urr
                INNER JOIN ROL r ON r.id_rol = urr.id_rol
                INNER JOIN DEPARTMENT dp ON dp.id = r.id_department
                WHERE urr.id_dealer_asigned = tew.id_dealer AND urr.id_usuario = tew.id_author) AS dpto_name
       FROM INVOICE_STATEMENT_INV_REL isir
       LEFT JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir.id_employee_work
       LEFT JOIN usuarios u ON u.id_usuario = tew.id_author
       WHERE isir.id_statement = ?
       ORDER BY isir.id`,
      [args.idStatement],
    )

    type TtkAcc = {
      employeeName: string
      department: string | null
      role: string | null
      hours: number
      amount: number
      onlyTimecard: boolean
    }
    const ttkGroups = new Map<number, TtkAcc>()
    const items: Record<string, unknown>[] = []
    let rawCents = 0

    for (const rel of rels) {
      if (rel.id_employee_work != null && Number(rel.tew_estado) !== 1) continue
      const rate = num(rel.amount) ?? 0
      const qty = num(rel.generic_qty)
      if (rel.id_employee_work == null) {
        rawCents += valorLinea(rate, qty)
        items.push({
          type: 'line',
          description: rel.description,
          unitAmount: rate,
          qty: qty ?? 0,
          lineTotal: centsToPesos(dividirYRedondear(valorLinea(rate, qty), 100)),
        })
        continue
      }
      const idAuthor = Number(rel.id_author)
      let g = ttkGroups.get(idAuthor)
      if (!g) {
        g = {
          employeeName: String(rel.employee_name ?? ''),
          department: rel.dpto_name == null ? null : String(rel.dpto_name),
          role: rel.rol_name == null ? null : String(rel.rol_name),
          hours: 0,
          amount: 0,
          onlyTimecard: false,
        }
        ttkGroups.set(idAuthor, g)
      }
      g.hours += Number(rel.hours_i ?? 0)
      g.amount += rate
      g.onlyTimecard = g.onlyTimecard || Number(rel.only_timecard) === 1
      rawCents += valorLineaTtk(rate)
    }

    for (const g of ttkGroups.values()) {
      const hoursCents = aCentavos(g.hours)
      const unitRate =
        hoursCents === 0 ? 0 : centsToPesos(dividirYRedondear(aCentavos(g.amount) * 100, hoursCents))
      items.push({
        type: 'ttk',
        employeeName: g.employeeName,
        department: g.department,
        role: g.role,
        unitRate,
        hours: g.hours,
        lineTotal: g.amount,
        onlyTimecard: g.onlyTimecard,
      })
    }

    const subtotalCents = dividirYRedondear(rawCents, 100)
    const taxPct = args.tax == null ? 0 : Number(args.tax)
    const taxCents =
      taxPct > 0 ? dividirYRedondear(subtotalCents * Math.round(taxPct * 1000), 100000) : 0
    const subtotal = centsToPesos(subtotalCents)
    const taxAmount = centsToPesos(taxCents)

    return {
      fullNro: args.fullNro,
      dealerName,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      invoiceNote: args.invoiceNote,
      headerNote: args.headerNote,
      tax: args.tax == null ? null : Number(args.tax).toFixed(3),
      subtotal,
      discountAmount: descuentoEnPesos === 0 ? null : descuentoEnPesos,
      discountType,
      discountDetail,
      taxPercent: taxPct > 0 ? taxPct : null,
      taxAmount: taxAmount > 0 ? taxAmount : null,
      total: grandTotal,
      items,
    }
  }
}
