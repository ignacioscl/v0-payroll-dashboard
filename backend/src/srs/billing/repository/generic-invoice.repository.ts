import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, EntityManager } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { GenericCatalogItemDto, GenericInvoiceItemDto } from '../dto/generic-invoice.dto'

const CAT_GENERIC_ITEM = 36
const CAT_HEADER_NOTE = 44
const STATEMENT_TYPE_GENERIC = 6
const GENERIC_NAME_MAX = 128

export type CompanyGatesRow = {
  hasGenericInvoice: boolean
  typeEfectivo: number | null
}

export type CreatedStatement = {
  id: number
  invoiceNro: number
  fullNro: string
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

function round2(n: number): number {
  return Math.round(n * 100) / 100
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
  ): Promise<void> {
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
      return
    }
    const current = rows[0].price == null ? null : Number(rows[0].price)
    if (current === price) return
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
    items: GenericInvoiceItemDto[]
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
      items: GenericInvoiceItemDto[]
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
      await mgr.query(
        `INSERT INTO INVOICE_STATEMENT_INV_REL (
           id_statement, id_invoice, id_invoice_service, id_employee_work,
           amount, description, generic_qty, only_timecard
         ) VALUES (?, NULL, NULL, NULL, ?, ?, ?, 0)`,
        [
          idStatement,
          item.unitAmount,
          item.description,
          item.qty == null ? null : item.qty,
        ],
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

    const rels = await mgr.query(
      `SELECT amount, description, generic_qty, only_timecard
       FROM INVOICE_STATEMENT_INV_REL
       WHERE id_statement = ?
       ORDER BY id`,
      [args.idStatement],
    )

    let subtotal = 0
    const items: Record<string, unknown>[] = []
    for (const rel of rels) {
      if (Number(rel.only_timecard) === 1) continue
      const rate = rel.amount == null || rel.amount === '' ? 0 : Number(rel.amount)
      const qtyRaw = rel.generic_qty
      if (qtyRaw === '' || qtyRaw == null) {
        subtotal += rate
      } else {
        subtotal += rate * Number(qtyRaw)
      }
    }
    for (const rel of rels) {
      const rate = rel.amount == null || rel.amount === '' ? 0 : Number(rel.amount)
      const qty = rel.generic_qty == null || rel.generic_qty === '' ? 0 : Number(rel.generic_qty)
      const lineTotal = qty > 0 ? round2(qty * rate) : rate
      items.push({
        type: 'line',
        description: rel.description,
        unitAmount: rate,
        qty,
        lineTotal,
      })
    }
    subtotal = round2(subtotal)
    const taxPct = args.tax == null ? 0 : Number(args.tax)
    const taxAmount = taxPct > 0 ? round2(subtotal * (taxPct / 100)) : 0
    const grandTotal = round2(subtotal + taxAmount)

    return {
      fullNro: args.fullNro,
      dealerName,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      invoiceNote: args.invoiceNote,
      headerNote: args.headerNote,
      // PHP re-lee tax de la base y PDO lo emite como string decimal(5,3) ("7.500").
      tax: args.tax == null ? null : Number(args.tax).toFixed(3),
      subtotal,
      discountAmount: null,
      discountDetail: null,
      taxPercent: taxPct > 0 ? taxPct : null,
      taxAmount: taxAmount > 0 ? taxAmount : null,
      total: grandTotal,
      items,
    }
  }
}
