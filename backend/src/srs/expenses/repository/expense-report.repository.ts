import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { EXPENSE_ESTADO_RETIRED, fromCents, toCents } from 'src/features/srs-expense/rules/expense-rules'
import { EXPENSES_CATEGORY_CATEGORY } from 'src/features/srs-generic-data/entity/generic-data.entity'
import {
  buildDealerRestrictionClause,
  removedDealersOfProviderListSql,
  removedDealersProvider,
} from '../../shared/kpi/srs-kpi-dealer-filter'
import type { ExpenseSortKey } from '../dto/expense-list-query.dto'
import type { AnalyticsRow, ExpenseLogEntry, ExpenseRow, ExpenseSummaryResponse, NamedRef } from '../dto/expense-row.dto'
import type { ExpenseListFilter } from '../expense-list-filter'
import { previousPeriod } from '../expense-period'
import {
  GroupAggregate,
  RawExpenseRow,
  SingleWithMeta,
  buildGroupRow,
  money,
  toSingle,
} from '../expense-row-assembler'

/**
 * Conteo de gastos: un gasto repartido (N filas con el mismo `id_exp_group`) cuenta una vez. `EXP_EXPENSE.id` y
 * `EXP_EXPENSE_GROUP.id` son secuencias distintas, por eso el prefijo: un COALESCE pelado mezclaría el gasto 11
 * con el grupo 11. La misma expresión la usa el catálogo (generic-data.repository.ts).
 */
export const EXPENSE_IDENTITY_SQL = "IF(e.id_exp_group IS NULL, CONCAT('e', e.id), CONCAT('g', e.id_exp_group))"

export function expenseIdentity(alias = 'e'): string {
  return EXPENSE_IDENTITY_SQL.replace(/e\./g, `${alias}.`)
}

/** Lo que las consultas necesitan de la sesión (el provider nunca viene del pedido). */
export interface ExpenseScope {
  idDealerProvider: number
  idUsuario: number
  skipDealerRestriction: boolean
}

interface SqlPart {
  sql: string
  params: unknown[]
}

/** Monthly Closing (plans/plan-monthly-closing/PLAN.md T3): lo que su filtro trae. */
export interface ExpenseAmountsByDealerRow {
  dealerId: number
  dealer: string
  total: string
  accidentTotal: string
}

export interface ExpenseLineRow {
  id: number
  ticketDate: string
  dealerId: number
  dealer: string
  vendor: string
  category: string
  amount: string
  notes: string
}

const SORT_AGG: Record<ExpenseSortKey, string> = {
  date: 'MAX(e.ticket_date)',
  amount: 'SUM(e.amount)',
  company: 'MAX(gco.name)',
  category: 'MAX(gca.name)',
  dealer: 'MIN(GET_DEALER_NAME_BY_PROVIDER(?, c.id))',
  author: 'MAX(ua.nombre)',
  createdBy: 'MAX(uc.nombre)',
  status: 'MAX(CASE WHEN e.is_approved IS NULL THEN 0 WHEN e.is_approved = 1 THEN 1 ELSE 2 END)',
  description: 'MAX(e.description)',
  receiptNumber: 'MAX(e.receipt_number)',
  id: 'MAX(e.id)',
}

/**
 * El dueño de lectura de EXP_EXPENSE en Pro: lista, tarjetas, export, Analytics, detalle de un gasto o grupo y lo
 * que el Monthly Closing comparte (amountsByDealer, linesForDealer, linesForRange). SQL crudo (regla
 * typeorm-crud-no-raw-sql: reportes) sobre la conexión default, así corre dentro de la transacción del facade.
 * Toda consulta lleva `e.id_detailer = provider` y, para quien no es Admin, RESTRICTION_DEALER_V2.
 */
@Injectable()
export class ExpenseReportRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * `buildExpenseWhere(filter, ctx)`: una sola función para lista, summary, export, analytics y Monthly Closing.
   * Exige el alias `e` (EXP_EXPENSE) y `c` (CONTRATISTA del dealer) en el FROM. `ticket_date` es DATE:
   * BETWEEN con las puntas incluidas (regla mysql-date-ranges).
   */
  buildExpenseWhere(filter: ExpenseListFilter): SqlPart {
    const params: unknown[] = [filter.idDealerProvider, filter.deleted ? 0 : 1]
    let sql = ' AND e.id_detailer = ? AND e.estado = ?'
    if (filter.from && filter.to) {
      sql += ' AND e.ticket_date BETWEEN ? AND ?'
      params.push(filter.from, filter.to)
    }
    const dealers = buildDealerRestrictionClause(
      filter.idUsuario,
      filter.dealerIds,
      filter.skipDealerRestriction,
      removedDealersProvider(filter),
    )
    sql += dealers.and
    params.push(...dealers.params)
    if (filter.idCompany) {
      sql += ' AND e.id_company = ?'
      params.push(filter.idCompany)
    }
    if (filter.idCategory) {
      sql += ' AND e.id_category = ?'
      params.push(filter.idCategory)
    }
    if (filter.idAuthor) {
      sql += ' AND e.id_author = ?'
      params.push(filter.idAuthor)
    }
    if (filter.idCreatedBy) {
      sql += ' AND e.id_created_by = ?'
      params.push(filter.idCreatedBy)
    }
    if (filter.status === 'pending') sql += ' AND e.is_approved IS NULL'
    else if (filter.status === 'approved') sql += ' AND e.is_approved = 1'
    else if (filter.status === 'rejected') sql += ' AND e.is_approved = 0'
    if (filter.amountMin !== undefined && filter.amountMin !== '') {
      sql += ' AND e.amount >= ?'
      params.push(fromCents(toCents(filter.amountMin)))
    }
    if (filter.amountMax !== undefined && filter.amountMax !== '') {
      sql += ' AND e.amount <= ?'
      params.push(fromCents(toCents(filter.amountMax)))
    }
    return { sql, params }
  }

  /** FROM + joins de nombres. Compañía y categoría con `id_dealer_provider = provider` (scope the returned entity). */
  private fromSql(scope: ExpenseScope): SqlPart {
    return {
      sql: ` FROM EXP_EXPENSE e
        JOIN CONTRATISTA c ON c.id = e.id_dealer
        LEFT JOIN GENERIC_DATA gco ON gco.id = e.id_company AND gco.id_dealer_provider = ?
        LEFT JOIN GENERIC_DATA gca ON gca.id = e.id_category AND gca.id_dealer_provider = ?
        LEFT JOIN usuarios ua ON ua.id_usuario = e.id_author
        LEFT JOIN usuarios uc ON uc.id_usuario = e.id_created_by
        LEFT JOIN usuarios uap ON uap.id_usuario = e.id_author_approved
        LEFT JOIN EXP_EXPENSE_GROUP g ON g.id = e.id_exp_group`,
      params: [scope.idDealerProvider, scope.idDealerProvider],
    }
  }

  private inScopeSql(scope: ExpenseScope): SqlPart {
    return scope.skipDealerRestriction
      ? { sql: '1', params: [] }
      : { sql: 'RESTRICTION_DEALER_V2(?, c.id)', params: [scope.idUsuario] }
  }

  /** SELECT de una fila completa (nombres, status, flags) + `inScope` para armar el grupo (D8). */
  private rowSelect(scope: ExpenseScope): SqlPart {
    const inScope = this.inScopeSql(scope)
    const from = this.fromSql(scope)
    return {
      sql: `SELECT e.id, e.id_exp_group AS idExpGroup, e.ticket_date AS ticketDate,
          e.id_company AS idCompany, gco.name AS companyName,
          e.id_category AS idCategory, gca.name AS categoryName,
          e.id_dealer AS idDealer, GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealerName,
          e.amount, e.id_author AS idAuthor, ua.nombre AS authorName,
          e.id_created_by AS idCreatedBy, uc.nombre AS createdByName,
          e.is_approved AS isApproved, e.id_author_approved AS idAuthorApproved, uap.nombre AS approvedByName,
          e.approved_date AS approvedDate, e.description, e.receipt_number AS receiptNumber, e.notes, e.estado,
          e.id_exp_repetitive AS idExpRepetitive,
          EXISTS (SELECT 1 FROM LOG_GENERIC lg WHERE lg.id_expense = e.id) AS hasLog,
          EXISTS (SELECT 1 FROM LOG_GENERIC lg WHERE lg.id_expense = e.id AND lg.description LIKE 'Attachment %') AS hasAttachment,
          g.split_type AS groupSplitType, g.id_attachment_expense AS groupAttachmentExpense,
          ${inScope.sql} AS inScope` + from.sql,
      params: [scope.idDealerProvider, ...inScope.params, ...from.params],
    }
  }

  private async rawRows(sql: string, params: unknown[]): Promise<SingleWithMeta[]> {
    const rows: RawExpenseRow[] = await this.db.query(sql, params)
    return rows.map(toSingle)
  }

  /** Filas por id de la empresa (activas o borradas, nunca las retiradas de un grupo), con `inScope`. Para el detalle y las escrituras del facade. */
  async rowsByIds(ids: number[], scope: ExpenseScope): Promise<SingleWithMeta[]> {
    if (!ids.length) return []
    const select = this.rowSelect(scope)
    return this.rawRows(
      `${select.sql} WHERE e.id_detailer = ? AND e.estado <> ? AND e.id IN (${ids.map(() => '?').join(',')}) ORDER BY e.id`,
      [...select.params, scope.idDealerProvider, EXPENSE_ESTADO_RETIRED, ...ids],
    )
  }

  /** Las filas de un grupo de la empresa con ese `estado`, con `inScope`. */
  async rowsByGroup(groupId: number, estado: number, scope: ExpenseScope): Promise<SingleWithMeta[]> {
    const select = this.rowSelect(scope)
    return this.rawRows(`${select.sql} WHERE e.id_detailer = ? AND e.id_exp_group = ? AND e.estado = ? ORDER BY e.id`, [
      ...select.params,
      scope.idDealerProvider,
      groupId,
      estado,
    ])
  }

  /**
   * Por grupo: filas totales con ese `estado` (sin la restricción de dealers), cuántas están en el alcance del
   * usuario, aprobadas, rechazadas y si el grupo tiene log propio.
   */
  async groupAggregates(groupIds: number[], estado: number, scope: ExpenseScope): Promise<Map<number, GroupAggregate>> {
    const out = new Map<number, GroupAggregate>()
    if (!groupIds.length) return out
    const inScope = this.inScopeSql(scope)
    const rows: {
      gid: unknown
      total: unknown
      approved: unknown
      rejected: unknown
      inScope: unknown
      hasLog: unknown
      totalAmount: unknown
    }[] = await this.db.query(
        `SELECT e.id_exp_group AS gid, COUNT(*) AS total,
            SUM(e.is_approved = 1) AS approved, SUM(e.is_approved = 0) AS rejected,
            SUM(${inScope.sql} = 1) AS inScope,
            EXISTS (SELECT 1 FROM LOG_GENERIC lg WHERE lg.id_exp_group = e.id_exp_group) AS hasLog,
            SUM(e.amount) AS totalAmount
          FROM EXP_EXPENSE e
          JOIN CONTRATISTA c ON c.id = e.id_dealer
          WHERE e.id_detailer = ? AND e.estado = ? AND e.id_exp_group IN (${groupIds.map(() => '?').join(',')})
          GROUP BY e.id_exp_group`,
        [...inScope.params, scope.idDealerProvider, estado, ...groupIds],
      )
    for (const r of rows) {
      out.set(Number(r.gid), {
        total: Number(r.total ?? 0),
        approved: Number(r.approved ?? 0),
        rejected: Number(r.rejected ?? 0),
        inScope: Number(r.inScope ?? 0),
        hasLog: Number(r.hasLog) === 1,
        totalCents: toCents(r.totalAmount as string),
      })
    }
    return out
  }

  /** Filas sueltas y grupos (con sus filas visibles) a partir de filas crudas, en el orden de `identities`. */
  async assemble(rows: SingleWithMeta[], identities: string[], estado: number, scope: ExpenseScope): Promise<ExpenseRow[]> {
    const byIdentity = new Map<string, SingleWithMeta[]>()
    for (const r of rows) {
      const key = r.row.groupId ? `g${r.row.groupId}` : `e${r.row.id}`
      const list = byIdentity.get(key) ?? []
      list.push(r)
      byIdentity.set(key, list)
    }
    const groupIds = [...byIdentity.keys()].filter((k) => k.startsWith('g')).map((k) => Number(k.slice(1)))
    const aggregates = await this.groupAggregates(groupIds, estado, scope)
    const out: ExpenseRow[] = []
    for (const key of identities) {
      const list = byIdentity.get(key)
      if (!list?.length) continue
      if (key.startsWith('e')) {
        const { groupId: _g, ...single } = list[0].row
        out.push(single)
        continue
      }
      const groupId = Number(key.slice(1))
      const agg = aggregates.get(groupId) ?? {
        total: list.length,
        approved: 0,
        rejected: 0,
        inScope: list.length,
        hasLog: false,
        totalCents: list.reduce((acc, v) => acc + toCents(v.row.amount), 0),
      }
      const group = buildGroupRow(groupId, list, agg)
      group.rows = group.rows.map(({ groupId: _g, ...single }) => single)
      out.push(group)
    }
    return out
  }

  /**
   * Expenses List: pagina por gasto (identidad), no por fila; un grupo es una fila padre con sus filas visibles.
   * `page` base 0.
   */
  async list(
    filter: ExpenseListFilter,
    page: number,
    pageSize: number,
    sort: ExpenseSortKey = 'date',
    dir: 'asc' | 'desc' = 'desc',
  ): Promise<{ rows: ExpenseRow[]; total: number }> {
    const scope = filter
    const from = this.fromSql(scope)
    const where = this.buildExpenseWhere(filter)
    const sortAgg = SORT_AGG[sort] ?? SORT_AGG.date
    const sortParams = sort === 'dealer' ? [filter.idDealerProvider] : []
    const direction = dir === 'asc' ? 'ASC' : 'DESC'

    const countRows: { total: unknown }[] = await this.db.query(
      `SELECT COUNT(DISTINCT ${EXPENSE_IDENTITY_SQL}) AS total ${from.sql} WHERE 1 ${where.sql}`,
      [...from.params, ...where.params],
    )
    const total = Number(countRows[0]?.total ?? 0)
    if (total === 0) return { rows: [], total }

    const identityRows: { ident: unknown }[] = await this.db.query(
      `SELECT ${EXPENSE_IDENTITY_SQL} AS ident, MAX(e.id) AS maxId, ${sortAgg} AS s
         ${from.sql} WHERE 1 ${where.sql}
         GROUP BY ident ORDER BY s ${direction}, maxId DESC LIMIT ?, ?`,
      [...sortParams, ...from.params, ...where.params, page * pageSize, pageSize],
    )
    const identities = identityRows.map((r) => String(r.ident))
    if (!identities.length) return { rows: [], total }

    const select = this.rowSelect(scope)
    const rows = await this.rawRows(
      `${select.sql} WHERE 1 ${where.sql} AND ${EXPENSE_IDENTITY_SQL} IN (${identities.map(() => '?').join(',')})
         ORDER BY e.ticket_date DESC, e.id DESC`,
      [...select.params, ...where.params, ...identities],
    )
    return { rows: await this.assemble(rows, identities, filter.deleted ? 0 : 1, scope), total }
  }

  /** Tarjetas de la lista: mismo WHERE que la grilla; «Expenses» cuenta gastos, no filas. */
  async summary(filter: ExpenseListFilter): Promise<ExpenseSummaryResponse> {
    const from = this.fromSql(filter)
    const where = this.buildExpenseWhere(filter)
    const totals: { total: unknown; count: unknown }[] = await this.db.query(
      `SELECT COALESCE(SUM(e.amount), 0) AS total, COUNT(DISTINCT ${EXPENSE_IDENTITY_SQL}) AS count
         ${from.sql} WHERE 1 ${where.sql}`,
      [...from.params, ...where.params],
    )
    const totalCents = toCents(totals[0]?.total as string)
    const count = Number(totals[0]?.count ?? 0)
    const top: { id: unknown; name: unknown; total: unknown }[] = await this.db.query(
      `SELECT e.id_category AS id, MAX(gca.name) AS name, SUM(e.amount) AS total
         ${from.sql} WHERE 1 ${where.sql}
         GROUP BY e.id_category ORDER BY total DESC, id ASC LIMIT 1`,
      [...from.params, ...where.params],
    )
    const out: ExpenseSummaryResponse = {
      total: fromCents(totalCents),
      count,
      average: fromCents(count > 0 ? Math.round(totalCents / count) : 0),
    }
    if (top.length) {
      out.topCategory = { id: Number(top[0].id ?? 0), name: String(top[0].name ?? ''), total: money(top[0].total) }
    }
    return out
  }

  /** Export de la lista: una fila por EXP_EXPENSE (sin la fila padre), mismo WHERE. */
  async exportRows(filter: ExpenseListFilter): Promise<SingleWithMeta[]> {
    const select = this.rowSelect(filter)
    const where = this.buildExpenseWhere(filter)
    return this.rawRows(`${select.sql} WHERE 1 ${where.sql} ORDER BY e.ticket_date DESC, e.id DESC`, [
      ...select.params,
      ...where.params,
    ])
  }

  /**
   * Analytics: totales por categoría, compañía o dealer del período y del anterior de igual largo. `count` =
   * gastos (identidad) salvo por dealer, donde cada fila es un dealer. Compañías y categorías borradas aparecen con
   * su nombre.
   */
  async amountsBy(
    filter: ExpenseListFilter,
    groupBy: 'category' | 'company' | 'dealer',
  ): Promise<{ total: string; prevTotal: string; rows: AnalyticsRow[] }> {
    const current = await this.amountsByPeriod(filter, groupBy)
    const prevRange = previousPeriod(filter.from, filter.to)
    const prev = await this.amountsByPeriod({ ...filter, from: prevRange.from, to: prevRange.to }, groupBy)
    const removed = new Set<number>()
    const removedOf = removedDealersProvider(filter)
    if (groupBy === 'dealer' && removedOf !== null) {
      const q = removedDealersOfProviderListSql(removedOf)
      const rows: { dealerId: unknown }[] = await this.db.query(q.sql, q.params)
      for (const r of rows) removed.add(Number(r.dealerId))
    }
    const byId = new Map<number, AnalyticsRow>()
    let total = 0
    let prevTotal = 0
    for (const r of current) {
      total += r.cents
      byId.set(r.id, { id: r.id, name: r.name, count: r.count, total: fromCents(r.cents), prevTotal: '0.00' })
    }
    for (const r of prev) {
      prevTotal += r.cents
      const row = byId.get(r.id)
      if (row) row.prevTotal = fromCents(r.cents)
      else byId.set(r.id, { id: r.id, name: r.name, count: 0, total: '0.00', prevTotal: fromCents(r.cents) })
    }
    const rows = [...byId.values()].sort((a, b) => toCents(b.total) - toCents(a.total) || a.name.localeCompare(b.name))
    if (groupBy === 'dealer') for (const r of rows) if (removed.has(r.id)) r.removed = true
    return { total: fromCents(total), prevTotal: fromCents(prevTotal), rows }
  }

  private async amountsByPeriod(
    filter: ExpenseListFilter,
    groupBy: 'category' | 'company' | 'dealer',
  ): Promise<{ id: number; name: string; count: number; cents: number }[]> {
    const from = this.fromSql(filter)
    const where = this.buildExpenseWhere(filter)
    const keyExpr = groupBy === 'category' ? 'e.id_category' : groupBy === 'company' ? 'e.id_company' : 'c.id'
    const nameExpr =
      groupBy === 'category' ? 'gca.name' : groupBy === 'company' ? 'gco.name' : 'GET_DEALER_NAME_BY_PROVIDER(?, c.id)'
    const nameParams = groupBy === 'dealer' ? [filter.idDealerProvider] : []
    const countExpr = groupBy === 'dealer' ? 'COUNT(*)' : `COUNT(DISTINCT ${EXPENSE_IDENTITY_SQL})`
    const rows: { id: unknown; name: unknown; count: unknown; total: unknown }[] = await this.db.query(
      `SELECT ${keyExpr} AS id, MAX(${nameExpr}) AS name, ${countExpr} AS count, SUM(e.amount) AS total
         ${from.sql} WHERE 1 ${where.sql}
         GROUP BY ${keyExpr} ORDER BY total DESC`,
      [...nameParams, ...from.params, ...where.params],
    )
    return rows.map((r) => ({
      id: Number(r.id ?? 0),
      name: String(r.name ?? ''),
      count: Number(r.count ?? 0),
      cents: toCents(r.total as string),
    }))
  }

  /**
   * Monthly Closing T3: Expenses por dealer (y «Accident»: categoría 35 con nombre `accident`, sin ids fijos).
   * Un gasto repartido ya son N filas: no hay que unir EXP_EXPENSE_DEALER_ASSIGN.
   */
  async amountsByDealer(filter: ExpenseListFilter): Promise<ExpenseAmountsByDealerRow[]> {
    const from = this.fromSql(filter)
    const where = this.buildExpenseWhere(filter)
    const rows: { dealerId: unknown; dealer: unknown; total: unknown; accidentTotal: unknown }[] = await this.db.query(
      `SELECT c.id AS dealerId, GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS dealer, SUM(e.amount) AS total,
          SUM(CASE WHEN gca.id_categoria = ? AND LOWER(TRIM(gca.name)) = 'accident' THEN e.amount ELSE 0 END) AS accidentTotal
         ${from.sql} WHERE 1 ${where.sql}
         GROUP BY c.id ORDER BY dealer`,
      [filter.idDealerProvider, EXPENSES_CATEGORY_CATEGORY, ...from.params, ...where.params],
    )
    return rows.map((r) => ({
      dealerId: Number(r.dealerId),
      dealer: String(r.dealer ?? ''),
      total: money(r.total),
      accidentTotal: money(r.accidentTotal),
    }))
  }

  /** Monthly Closing T3: las líneas de un dealer en el rango. */
  async linesForDealer(filter: ExpenseListFilter, dealerId: number): Promise<ExpenseLineRow[]> {
    return this.linesForRange({ ...filter, dealerIds: [dealerId] })
  }

  /** Monthly Closing T3: las líneas del rango (fecha, dealer, vendor, categoría, monto, notas). */
  async linesForRange(filter: ExpenseListFilter): Promise<ExpenseLineRow[]> {
    const rows = await this.exportRows(filter)
    return rows.map((r) => ({
      id: r.row.id,
      ticketDate: r.row.ticketDate,
      dealerId: r.row.dealer.id,
      dealer: r.row.dealer.name,
      vendor: r.row.company.name,
      category: r.row.category.name,
      amount: r.row.amount,
      notes: r.row.notes,
    }))
  }

  /** LOG_GENERIC del gasto y, si tiene grupo, del grupo (tipo 7), con el nombre del autor. */
  async logRows(idExpense: number, idExpGroup: number | null): Promise<ExpenseLogEntry[]> {
    const rows: { id: unknown; date: unknown; idAuthor: unknown; author: unknown; description: unknown; idExpGroup: unknown }[] =
      await this.db.query(
        `SELECT lg.id, lg.date_update AS date, lg.id_author AS idAuthor, u.nombre AS author, lg.description,
                lg.id_exp_group AS idExpGroup
           FROM LOG_GENERIC lg
           LEFT JOIN usuarios u ON u.id_usuario = lg.id_author
          WHERE lg.tipo = 7 AND (lg.id_expense = ? OR (? > 0 AND lg.id_exp_group = ?))
          ORDER BY lg.id DESC`,
        [idExpense, idExpGroup ?? 0, idExpGroup ?? 0],
      )
    return rows.map((r) => ({
      id: Number(r.id),
      date: String(r.date ?? ''),
      author: { id: Number(r.idAuthor ?? 0), name: String(r.author ?? '') },
      description: String(r.description ?? ''),
      scope: r.idExpGroup ? 'group' : 'expense',
    }))
  }

  /**
   * Empleados de la empresa (AVANCE.md, mismo SQL que `UsuarioDao` sin la rama de face recognition): con dealers,
   * los asignados a alguno de ellos; sin dealers, todos. Pro filtra `u.estado = 1`: un empleado dado de baja no
   * recibe gastos nuevos.
   */
  async employees(idDealerProvider: number, term: string, dealerIds: number[], limit = 50): Promise<NamedRef[]> {
    const params: unknown[] = [idDealerProvider, `%${term}%`]
    let sql = `SELECT u.id_usuario AS id, u.nombre AS name FROM usuarios u
       WHERE u.estado = 1 AND u.is_empleado = 1 AND u.id_contratista_owner = ? AND u.nombre LIKE ?`
    if (dealerIds.length) {
      const ph = dealerIds.map(() => '?').join(',')
      sql += ` AND EXISTS (SELECT 1 FROM USUARIO_ROL_REL lurr INNER JOIN ROL lr ON lr.id_rol = lurr.id_rol
         WHERE lurr.id_usuario = u.id_usuario AND (lurr.id_dealer_asigned IN (${ph}) OR lr.id_compania_origen IN (${ph})))`
      params.push(...dealerIds, ...dealerIds)
    }
    sql += ' ORDER BY u.nombre LIMIT ?'
    params.push(limit)
    const rows: { id: unknown; name: unknown }[] = await this.db.query(sql, params)
    return rows.map((r) => ({ id: Number(r.id), name: String(r.name ?? '') }))
  }

  /** El empleado es de la empresa y está asignado a alguno de los dealers (la misma consulta del combo). */
  async employeeAssigned(idDealerProvider: number, idUsuario: number, dealerIds: number[]): Promise<boolean> {
    if (!dealerIds.length) return false
    const ph = dealerIds.map(() => '?').join(',')
    const rows: { ok: unknown }[] = await this.db.query(
      `SELECT 1 AS ok FROM usuarios u
        WHERE u.id_usuario = ? AND u.estado = 1 AND u.is_empleado = 1 AND u.id_contratista_owner = ?
          AND EXISTS (SELECT 1 FROM USUARIO_ROL_REL lurr INNER JOIN ROL lr ON lr.id_rol = lurr.id_rol
               WHERE lurr.id_usuario = u.id_usuario AND (lurr.id_dealer_asigned IN (${ph}) OR lr.id_compania_origen IN (${ph})))
        LIMIT 1`,
      [idUsuario, idDealerProvider, ...dealerIds, ...dealerIds],
    )
    return rows.length > 0
  }

  /** De los ids pedidos, los que pasan RESTRICTION_DEALER_V2 para el usuario (Admin: todos). */
  async dealerIdsInRestriction(scope: ExpenseScope, ids: number[]): Promise<number[]> {
    if (!ids.length) return []
    if (scope.skipDealerRestriction) return [...ids]
    const rows: { id: unknown }[] = await this.db.query(
      `SELECT c.id FROM CONTRATISTA c WHERE c.id IN (${ids.map(() => '?').join(',')}) AND RESTRICTION_DEALER_V2(?, c.id) = 1`,
      [...ids, scope.idUsuario],
    )
    return rows.map((r) => Number(r.id))
  }

  /** Nombres de dealers con GET_DEALER_NAME_BY_PROVIDER (ids ya validados por quien llama). */
  async dealerNames(idDealerProvider: number, ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    if (!ids.length) return out
    const rows: { id: unknown; name: unknown }[] = await this.db.query(
      `SELECT c.id, GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS name FROM CONTRATISTA c WHERE c.id IN (${ids
        .map(() => '?')
        .join(',')})`,
      [idDealerProvider, ...ids],
    )
    for (const r of rows) out.set(Number(r.id), String(r.name ?? r.id))
    return out
  }

  /** Los dealers eliminados de la empresa (regla include-removed-dealers), con su nombre. */
  async removedDealersOfProvider(idDealerProvider: number): Promise<{ dealerId: number; dealer: string }[]> {
    const q = removedDealersOfProviderListSql(idDealerProvider)
    const rows: { dealerId: unknown; dealer: unknown }[] = await this.db.query(q.sql, q.params)
    return rows.map((r) => ({ dealerId: Number(r.dealerId), dealer: String(r.dealer ?? '') }))
  }

  /** Nombres de compañía/categoría de la empresa por id (aunque estén borradas), para el Report Info. */
  async genericNames(idDealerProvider: number, ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    const valid = ids.filter((n) => n > 0)
    if (!valid.length) return out
    const rows: { id: unknown; name: unknown }[] = await this.db.query(
      `SELECT g.id, g.name FROM GENERIC_DATA g WHERE g.id_dealer_provider = ? AND g.id IN (${valid.map(() => '?').join(',')})`,
      [idDealerProvider, ...valid],
    )
    for (const r of rows) out.set(Number(r.id), String(r.name ?? ''))
    return out
  }

  /**
   * Nombres de usuarios por id (Report Info: Assigned to / Created by), solo los de la empresa: empleados suyos o
   * quienes figuran en sus gastos (un Admin General no tiene empresa propia). El id viene del pedido: uno ajeno no da nombre.
   */
  async userNames(idDealerProvider: number, ids: number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    const valid = ids.filter((n) => n > 0)
    if (!valid.length) return out
    const rows: { id: unknown; name: unknown }[] = await this.db.query(
      `SELECT u.id_usuario AS id, u.nombre AS name FROM usuarios u
        WHERE u.id_usuario IN (${valid.map(() => '?').join(',')})
          AND (u.id_contratista_owner = ?
            OR EXISTS (SELECT 1 FROM EXP_EXPENSE e WHERE e.id_detailer = ? AND e.id_author = u.id_usuario)
            OR EXISTS (SELECT 1 FROM EXP_EXPENSE e WHERE e.id_detailer = ? AND e.id_created_by = u.id_usuario))`,
      [...valid, idDealerProvider, idDealerProvider, idDealerProvider],
    )
    for (const r of rows) out.set(Number(r.id), String(r.name ?? ''))
    return out
  }
}
