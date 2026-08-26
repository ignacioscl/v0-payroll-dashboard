import { buildDealerFilterSql } from '../shared/kpi/srs-kpi-dealer-filter'
import { applyZeroFilter } from '../shared/kpi/srs-kpi-zero-filter'
import { StatementType, statementTypesSqlIn } from './entity/invoice-statement.srsentity'
import { sqlInInts } from './dto/invoice-filter-parsers'
import { InvoiceDeletedMode, InvoiceListFilter, InvoiceRowDto } from './dto/invoice-list.dto'
import { formatFullNroWithNroBilled } from './invoice-nro-billed'

export type UnionKind = 1 | 2 | 3

export type InvoiceRowIdentity = {
  id: number
  idBilling: number | null
  nroBilled: number | null
  idBillingWoRel: number | null
}

type SqlChunk = { sql: string; params: any[] }

function deletedEstadoSql(mode: InvoiceDeletedMode): string {
  if (mode === 'only') return ' AND s.estado = 0'
  if (mode === 'all') return ' AND s.estado IN (0, 1)'
  return ' AND s.estado = 1'
}

function poSql(kind: UnionKind): string {
  if (kind === 1) {
    return `CASE WHEN (s.statement_type=1 AND s.po IS NULL OR s.po='') THEN (
      SELECT li.po FROM INVOICE li
      INNER JOIN INVOICE_STATEMENT_INV_REL lisir ON lisir.id_invoice=li.id
        AND li.estado=1 AND lisir.id_statement=s.id LIMIT 0,1
    ) ELSE s.po END AS po`
  }
  return `CASE WHEN (s.statement_type=1 AND (s.po IS NULL OR s.po='')) THEN (
    SELECT li.po FROM INVOICE li
    INNER JOIN INVOICE_STATEMENT_INV_REL lisir ON lisir.id_invoice=li.id
      AND li.estado=1 AND lisir.id_statement=s.id LIMIT 0,1
  ) ELSE s.po END AS po`
}

function roSql(kind: UnionKind): string {
  if (kind === 1) {
    return `CASE WHEN (s.ro IS NULL OR s.ro='') THEN get_invoice_ro(s.id,'{"get":"ro"}') ELSE s.ro END AS ro`
  }
  return 's.ro AS ro'
}

function billingJoinSql(kind: UnionKind): string {
  if (kind === 1) {
    return `
      LEFT JOIN BILLING_WO_REL bwr ON bwr.id_statement = s.id
      LEFT JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1`
  }
  // El tenant es el PROVIDER, no el dealer. Un cheque puede estar emitido a nombre de otro
  // dealer del mismo provider (NPP20110 / billing 17305): legacy lo muestra igual porque sólo
  // pide `b.id = bwr.id_billing AND b.estado = 1` (InvoiceStatementHelperDao.php:715 y :791).
  // Con `b.id_dealer = s.id_dealer` esa invoice se caía de las tres ramas y desaparecía de v0.
  if (kind === 2) {
    return `
      INNER JOIN BILLING_WO_REL bwr ON bwr.id_statement = s.id
      INNER JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1
        AND b.id_dealer_provider = s.id_dealer_provider`
  }
  return `
      INNER JOIN INVOICE_STATEMENT_INV_REL isir ON isir.id_statement = s.id
      INNER JOIN BILLING_WO_REL bwr ON bwr.id_statement_inv_rel = isir.id
      INNER JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1
        AND b.id_dealer_provider = s.id_dealer_provider`
}

function moneySelectSql(kind: UnionKind): string {
  if (kind === 1) {
    return `
      GET_SUBTOTAL_BY_STATEMENT_NOT_BILLED(s.id, s.statement_type, NULL) AS sub_total,
      GET_TOTAL_BY_STATEMENT_NOT_BILLED(s.id, s.discount, NULL, s.discount_type, s.statement_type, NULL) AS total,
      0 AS is_billed,
      IS_STATEMENT_PARTIAL_OR_FULL_BILLED(s.id) AS is_partial_billed,
      (SELECT COUNT(*) FROM INVOICE_STATEMENT_NOTE isn WHERE isn.id_statement = s.id AND isn.estado = 1) AS notes_count,
      (SELECT COUNT(*) FROM LOG_CHANGE lc WHERE lc.id_invoice_statement = s.id) AS log_count,
      b.id AS id_billing,
      b.fecha AS fecha_pago,
      NULL AS check_number,
      NULL AS amount,
      NULL AS nro_billed,
      NULL AS id_billing_wo_rel`
  }
  if (kind === 2) {
    return `
      GET_SUBTOTAL_BY_STATEMENT(s.id, NULL) AS sub_total,
      GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL) AS total,
      1 AS is_billed,
      IS_STATEMENT_PARTIAL_OR_FULL_BILLED(s.id) AS is_partial_billed,
      (SELECT COUNT(*) FROM INVOICE_STATEMENT_NOTE isn WHERE isn.id_statement = s.id AND isn.estado = 1) AS notes_count,
      (SELECT COUNT(*) FROM LOG_CHANGE lc WHERE lc.id_invoice_statement = s.id) AS log_count,
      b.id AS id_billing,
      b.fecha AS fecha_pago,
      b.check_number AS check_number,
      b.amount AS amount,
      1 AS nro_billed,
      bwr.id AS id_billing_wo_rel`
  }
  return `
      GET_TOTAL_BY_STATEMENT_PARCIAL_BILLED(s.id, b.id, NULL) AS sub_total,
      NULL AS total,
      1 AS is_billed,
      IS_STATEMENT_PARTIAL_OR_FULL_BILLED(s.id) AS is_partial_billed,
      (SELECT COUNT(*) FROM INVOICE_STATEMENT_NOTE isn WHERE isn.id_statement = s.id AND isn.estado = 1) AS notes_count,
      (SELECT COUNT(*) FROM LOG_CHANGE lc WHERE lc.id_invoice_statement = s.id) AS log_count,
      b.id AS id_billing,
      b.fecha AS fecha_pago,
      b.check_number AS check_number,
      b.amount AS amount,
      bwr.nro_billed AS nro_billed,
      -1 AS id_billing_wo_rel`
}

function identitySelectSql(kind: UnionKind): string {
  if (kind === 1) {
    return `s.id, b.id AS id_billing, NULL AS nro_billed, NULL AS id_billing_wo_rel,
            s.fecha_desde, s.fecha_create, s.full_nro`
  }
  if (kind === 2) {
    return `s.id, b.id AS id_billing, 1 AS nro_billed, bwr.id AS id_billing_wo_rel,
            s.fecha_desde, s.fecha_create, s.full_nro`
  }
  return `s.id, b.id AS id_billing, bwr.nro_billed AS nro_billed, -1 AS id_billing_wo_rel,
          s.fecha_desde, s.fecha_create, s.full_nro`
}

function sharedSelectSql(kind: UnionKind): string {
  return `
      s.id, s.full_nro, s.statement_type, s.estado, s.sended,
      s.emails_sended, s.last_sended,
      s.fecha_create, s.fecha_desde, s.fecha_hasta,
      ${poSql(kind)},
      ${roSql(kind)},
      s.discount, s.discount_type, s.discount_detail, ROUND(s.tax, 2) AS tax,
      s.invoice_service_sel_rel, s.invoice_note, s.id_invoice_statement_schedule,
      d.nombre        AS department,
      inv_serv.nombre AS invoice_service,
      u.nombre        AS author,
      GET_DEALER_NAME_BY_PROVIDER(s.id_dealer_provider, s.id_dealer) AS dealer,
      s.id_dealer,
      GET_NRO_WO_FROM_INVOICE(s.id) AS wo,
      CASE WHEN s.statement_type = 1
           THEN GET_SERVICES_NAMES_BY_WO(GET_ID_WO_FROM_INVOICE(s.id)) ELSE NULL END AS services_by_wo`
}

// Igual que legacy (InvoiceStatementHelperDao.php:796-802): Unpaid = saldo, Paid = los dos
// cobros, All = las tres. La rama 1 NO va en Paid: proyecta check_number NULL e is_billed 0,
// así que colaba filas de saldo en la pestaña de cobradas (33 de 70 en el filtro medido).
function kindsForPayed(payed?: '0' | '1'): UnionKind[] {
  if (payed === '0') return [1]
  if (payed === '1') return [2, 3]
  return [1, 2, 3]
}

function buildBranchWhere(
  kind: UnionKind,
  f: InvoiceListFilter,
  idIn: number[] | undefined,
): SqlChunk {
  const stmt = buildDealerFilterSql('statement', f.idUsuario, f.dealerIds, f.skipDealerRestriction)
  const parts: string[] = [`s.id_dealer_provider = ?${stmt.and}`]
  const params: any[] = [f.idDealerProvider, ...stmt.params]

  parts.push(deletedEstadoSql(f.deleted).replace(/^\s+AND /, ''))

  if (idIn && idIn.length) {
    parts.push(`s.id IN (${sqlInInts(idIn)})`)
  }

  if (kind === 1 && f.payed !== '0') {
    parts.push('IS_STATEMENT_FULL_BILLED(s.id) = 0')
  }

  // Buscar por número manda sobre el período: el que escribe un número no sabe de qué mes es
  // la invoice. El front ya fuerza `ignorePeriod`, pero la regla vive acá para que también
  // valga si el pedido entra por la API sin ese flag.
  if (!f.ignorePeriod && !f.search) {
    parts.push('s.fecha_desde >= ? AND s.fecha_hasta <= ?')
    params.push(f.fechaDesde, f.fechaHasta)
  }

  if (f.statementTypes.length) {
    parts.push(`s.statement_type IN (${statementTypesSqlIn(f.statementTypes)})`)
  }

  if (f.search) {
    if (f.exactMatch) {
      parts.push('s.full_nro = ?')
      params.push(f.search)
    } else {
      parts.push(`s.full_nro LIKE CONCAT('%', ?, '%')`)
      params.push(f.search)
    }
  }

  if (f.sended === '0' || f.sended === '1') {
    parts.push('s.sended = ?')
    params.push(Number(f.sended))
  }

  // Fragmento 8 del WHERE compartido. En Paid no hace falta nada: las ramas 2 y 3 ya llevan
  // INNER JOIN a BILLING, que es la definición de "cobrada".
  if (f.payed === '0') {
    parts.push('IS_STATEMENT_BILLED(s.id) = 0')
  }

  const systemAuthored = `(s.id_invoice_statement_schedule > 0 OR EXISTS (
      SELECT 1 FROM usuarios ua WHERE ua.id_usuario = s.id_author AND ua.is_empleado <> 1
    ))`

  if (f.authorIds.length) {
    const ids = sqlInInts(f.authorIds)
    const byAuthor = f.authorsExclude
      ? `s.id_author NOT IN (${ids})`
      : `s.id_author IN (${ids})`
    parts.push(f.createdBySystem ? `(${byAuthor} OR ${systemAuthored})` : byAuthor)
  } else if (f.createdBySystem) {
    parts.push(systemAuthored)
  } else if (f.idAuthor) {
    parts.push('s.id_author = ?')
    params.push(f.idAuthor)
  }

  if (f.employeeWorkedIds.length) {
    const ids = sqlInInts(f.employeeWorkedIds)
    parts.push(`s.statement_type IN (${StatementType.TTK}, ${StatementType.GENERIC})
        AND EXISTS (
          SELECT 1 FROM INVOICE_STATEMENT_INV_REL isir_ew
          INNER JOIN TTK_EMPLOYEE_WORK tew ON tew.id = isir_ew.id_employee_work
          WHERE isir_ew.id_statement = s.id
            AND tew.id_author IN (${ids})
            AND tew.id_dealer_provider = ?
        )`)
    params.push(f.idDealerProvider)
  }

  if (f.departmentIds.length) {
    const ids = sqlInInts(f.departmentIds)
    parts.push(`(EXISTS (
        SELECT issr.id FROM INVOICE_STATEMENT_SEL_SER_REL issr
        INNER JOIN INVOICE_SERVICE _lis ON _lis.id = issr.id_inv_service
        WHERE issr.id_statement = s.id AND _lis.id_department IN (${ids})
      ) OR s.id_department IN (${ids}))`)
  }

  if (f.invoiceServiceIds.length) {
    const ids = sqlInInts(f.invoiceServiceIds)
    const serviceMatch = `(s.id_invoice_service IN (${ids}) OR EXISTS (
          SELECT isir_svc.id FROM INVOICE_STATEMENT_INV_REL isir_svc
          INNER JOIN INVOICE i_svc ON i_svc.id = isir_svc.id_invoice AND i_svc.estado = 1
          WHERE isir_svc.id_statement = s.id AND isir_svc.id_invoice_service IN (${ids})
        ) OR EXISTS (
          SELECT issr.id FROM INVOICE_STATEMENT_SEL_SER_REL issr
          WHERE issr.id_statement = s.id AND issr.id_inv_service IN (${ids})
        ))`
    const ttkGenericTypes = f.statementTypes.filter(
      (t) => t === StatementType.TTK || t === StatementType.GENERIC,
    )
    if (ttkGenericTypes.length) {
      parts.push(
        `(${serviceMatch} OR s.statement_type IN (${statementTypesSqlIn(ttkGenericTypes)}))`,
      )
    } else {
      parts.push(serviceMatch)
    }
  }

  if (f.dueOn) {
    parts.push(`IS_STATEMENT_BILLED(s.id) = 0
        AND EXISTS (
          SELECT dr.id FROM DEALER_REL dr
          WHERE dr.id_dealer_customer = s.id_dealer
            AND dr.id_dealer_provider = s.id_dealer_provider
            AND dr.fecha_end IS NULL
            AND dr.due_on IS NOT NULL
            AND dr.due_on > 0
            AND DATEDIFF(CURDATE(), s.fecha_hasta) > dr.due_on
        )`)
  }

  if (f.checkDate || f.checkNumber) {
    if (kind === 1) {
      const billingParts: string[] = []
      if (f.checkDate) {
        billingParts.push('b_chk.fecha = ?')
        params.push(f.checkDate)
      }
      if (f.checkNumber) {
        billingParts.push('b_chk.check_number LIKE ?')
        params.push(`%${f.checkNumber}%`)
      }
      parts.push(`EXISTS (
        SELECT 1 FROM BILLING_WO_REL bwr_chk
        INNER JOIN BILLING b_chk ON b_chk.id = bwr_chk.id_billing AND IS_BILLING_ACTIVE(bwr_chk.id_billing) = 1
        WHERE (bwr_chk.id_statement = s.id
          OR bwr_chk.id_statement_inv_rel IN (
            SELECT isir_chk.id FROM INVOICE_STATEMENT_INV_REL isir_chk WHERE isir_chk.id_statement = s.id
          ))
        AND ${billingParts.join(' AND ')}
      )`)
    } else {
      if (f.checkDate) {
        parts.push('b.fecha = ?')
        params.push(f.checkDate)
      }
      if (f.checkNumber) {
        parts.push('b.check_number LIKE ?')
        params.push(`%${f.checkNumber}%`)
      }
    }
  }

  const lineSubParts: string[] = []
  const lineParams: any[] = []
  if (f.woNumbers.length) {
    const woOr = f.woNumbers.map(() => '(i.full_nro = ? OR i.wo_nro = ?)').join(' OR ')
    lineSubParts.push(`(${woOr})`)
    for (const wo of f.woNumbers) {
      lineParams.push(wo, wo)
    }
  }
  if (f.roPo) {
    lineSubParts.push('(i.ro = ? OR i.po = ?)')
    lineParams.push(f.roPo, f.roPo)
  }
  if (f.stock) {
    lineSubParts.push('(i.stock_number LIKE ? OR c_line.vin = ? OR c_line.vin LIKE ?)')
    const like = `%${f.stock}%`
    lineParams.push(like, f.stock, like)
  }
  if (lineSubParts.length) {
    const union3Line =
      kind === 3 ? ' AND isir_line.id = bwr.id_statement_inv_rel' : ''
    parts.push(`EXISTS (
        SELECT isir_line.id
        FROM INVOICE_STATEMENT_INV_REL isir_line
        INNER JOIN INVOICE_SERVICE_REL isr_line
          ON isr_line.id_invoice = isir_line.id_invoice
         AND isr_line.id_service_invoice = isir_line.id_invoice_service
        INNER JOIN INVOICE i ON i.id = isir_line.id_invoice AND i.estado = 1
        INNER JOIN CAR c_line ON c_line.id = i.id_car
        WHERE isir_line.id_statement = s.id AND ${lineSubParts.join(' AND ')}${union3Line}
      )`)
    params.push(...lineParams)
  }

  // Una invoice que se quedó sin líneas devuelve 0 acá y se cae de la rama del saldo; como
  // tampoco está cobrada, ninguna rama la trae y queda inalcanzable desde la pantalla (hay
  // 324 así en la base). Legacy tiene el mismo filtro (HelperDao.php:433 y :643), pero
  // buscar un número concreto y que la grilla diga que no existe es peor que la divergencia:
  // cuando el usuario busca por número, la invoice aparece igual.
  if (kind === 1 && !f.search) {
    parts.push('EXISTS_SERVICES_IN_INV_STATEMENT(s.id, s.statement_type) = 1')
  }

  // Mismo criterio que el período: buscando por número no se esconde nada por valer $0 — y
  // una invoice con descuento mayor al subtotal da negativo, que tampoco pasa el `> 0`.
  parts.push(
    applyZeroFilter(
      f.includeZero || Boolean(f.search),
      'GET_TOTAL_BY_STATEMENT(s.id, 0, 0, s.discount_type, NULL) > 0',
    ).replace(/^\s+AND /, '') || '1=1',
  )

  const whereParts = parts.filter((p) => p && p !== '1=1')
  return { sql: ` WHERE ${whereParts.join('\n        AND ')}`, params }
}

function fromSql(kind: UnionKind, dealerJoin: string): string {
  return `FROM INVOICE_STATEMENT s
      ${dealerJoin}
      LEFT JOIN DEPARTMENT d ON d.id = s.id_department
      LEFT JOIN INVOICE_SERVICE inv_serv ON inv_serv.id = s.id_invoice_service
      LEFT JOIN usuarios u ON u.id_usuario = s.id_author
      ${billingJoinSql(kind)}`
}

function wrapBranch(kind: UnionKind, inner: string): string {
  const distinct = kind === 3 ? 'DISTINCT ' : ''
  return `(SELECT ${distinct}${inner})`
}

export function buildUnionBranches(
  f: InvoiceListFilter,
  mode: 'identity' | 'full',
  idIn?: number[],
): SqlChunk[] {
  const stmt = buildDealerFilterSql('statement', f.idUsuario, f.dealerIds, f.skipDealerRestriction)
  const kinds = kindsForPayed(f.payed)
  return kinds.map((kind) => {
    const where = buildBranchWhere(kind, f, idIn)
    const select = mode === 'identity' ? identitySelectSql(kind) : `${sharedSelectSql(kind)},
      ${moneySelectSql(kind)}`
    const sql = wrapBranch(kind, `${select}
      ${fromSql(kind, stmt.join)}
      ${where.sql}`)
    return { sql, params: where.params }
  })
}

export function concatBranches(branches: SqlChunk[]): SqlChunk {
  return {
    sql: branches.map((b) => b.sql).join('\nUNION\n'),
    params: branches.flatMap((b) => b.params),
  }
}

export function orderBySql(f: InvoiceListFilter, alias = 't'): string {
  const dir = f.orderDir === 'asc' ? 'ASC' : 'DESC'
  const tie = `${alias}.id_billing, ${alias}.nro_billed, ${alias}.id_billing_wo_rel`
  if (f.orderBy === 'invoiceNro') {
    return `ORDER BY ${alias}.full_nro ${dir}, ${alias}.id ${dir}, ${tie}`
  }
  if (f.orderBy === 'dateFrom') {
    return `ORDER BY ${alias}.fecha_desde ${dir}, ${alias}.id ${dir}, ${tie}`
  }
  return `ORDER BY ${alias}.fecha_desde DESC, ${alias}.fecha_create, ${alias}.id DESC, ${tie}`
}

export function sqlLiteralIntOrNull(value: number | null | undefined): string {
  if (value == null) return 'NULL'
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error('Invalid identity integer')
  }
  return String(n)
}

export function identityTupleSql(rows: InvoiceRowIdentity[]): string {
  return rows
    .map(
      (r) =>
        `SELECT ${sqlLiteralIntOrNull(r.id)} AS id, ${sqlLiteralIntOrNull(r.idBilling)} AS id_billing, ${sqlLiteralIntOrNull(r.nroBilled)} AS nro_billed, ${sqlLiteralIntOrNull(r.idBillingWoRel)} AS id_billing_wo_rel`,
    )
    .join('\nUNION ALL\n')
}

export function mapIdentityRow(r: any): InvoiceRowIdentity {
  return {
    id: Number(r.id),
    idBilling: r.id_billing == null ? null : Number(r.id_billing),
    nroBilled: r.nro_billed == null ? null : Number(r.nro_billed),
    idBillingWoRel: r.id_billing_wo_rel == null ? null : Number(r.id_billing_wo_rel),
  }
}

export function mapInvoiceListRow(r: any): InvoiceRowDto {
  const nroBilled = r.nro_billed == null ? null : Number(r.nro_billed)
  const fullNro = String(r.full_nro ?? '')
  return {
    id: Number(r.id),
    fullNro,
    displayFullNro: formatFullNroWithNroBilled(fullNro, nroBilled),
    statementType: Number(r.statement_type),
    estado: Number(r.estado),
    wo: r.wo ?? undefined,
    department: r.department ?? undefined,
    invoiceService: r.invoice_service ?? undefined,
    invoiceServiceSelRel: r.invoice_service_sel_rel ?? undefined,
    invoiceServicesByWo: r.services_by_wo ?? undefined,
    invoiceNote: r.invoice_note ?? undefined,
    author: r.author ?? undefined,
    createdBySchedule: Number(r.id_invoice_statement_schedule ?? 0) > 0,
    dealer: r.dealer ?? undefined,
    idDealer: r.id_dealer == null ? undefined : Number(r.id_dealer),
    fechaCreate: r.fecha_create ?? '',
    fechaDesde: r.fecha_desde ?? undefined,
    fechaHasta: r.fecha_hasta ?? undefined,
    subtotal: Number(r.sub_total ?? 0),
    discount: r.discount == null ? undefined : Number(r.discount),
    discountType: r.discount_type == null ? undefined : Number(r.discount_type),
    discountDetail: r.discount_detail ?? undefined,
    total: Number(r.total ?? r.sub_total ?? 0),
    tax: Number(r.tax ?? 0),
    po: r.po ?? undefined,
    ro: r.ro ?? undefined,
    sended: Number(r.sended ?? 0),
    emailsSended: r.emails_sended ?? undefined,
    lastSended: r.last_sended ?? undefined,
    isBilled: Number(r.is_billed ?? 0),
    isPartialBilled: Number(r.is_partial_billed ?? 0),
    notesCount: Number(r.notes_count ?? 0),
    logCount: Number(r.log_count ?? 0),
    idBilling: r.id_billing == null ? undefined : Number(r.id_billing),
    idBillingWoRel: r.id_billing_wo_rel == null ? undefined : Number(r.id_billing_wo_rel),
    nroBilled,
    fechaPago: r.fecha_pago ?? undefined,
    checkNumber: r.check_number ?? undefined,
    amount: r.amount == null ? undefined : Number(r.amount),
  }
}

/** InvoiceStatement::getDiscountAmount() transcribed for summary. */
export const DISCOUNT_AMOUNT_SQL = `(CASE WHEN t.discount IS NULL OR t.discount = 0 THEN 0
      WHEN t.discount_type = 2 THEN t.discount
      ELSE t.discount * 0.01 * t.sub_total END)`

export function summarySelectSql(deleted: InvoiceDeletedMode): string {
  const moneyPred = deleted === 'all' ? 't.estado = 1' : '1=1'
  return `SELECT
    COUNT(*) AS cnt,
    SUM(CASE WHEN t.estado = 0 THEN 1 ELSE 0 END) AS deleted_in_list,
    ROUND(IFNULL(SUM(CASE WHEN ${moneyPred} AND t.sub_total > 0 THEN t.sub_total ELSE 0 END), 0), 2) AS subtotal,
    ROUND(IFNULL(SUM(CASE WHEN ${moneyPred}
                         AND t.nro_billed IS NULL
                         AND ${DISCOUNT_AMOUNT_SQL} > 0
                        THEN ${DISCOUNT_AMOUNT_SQL}
                        ELSE 0 END), 0), 2) AS discount,
    ROUND(IFNULL(SUM(CASE WHEN ${moneyPred} AND COALESCE(t.total, t.sub_total) > 0
                        THEN COALESCE(t.total, t.sub_total) ELSE 0 END), 0), 2) AS total`
}
