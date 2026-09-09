import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'
import {
  type PunchGroupedSort,
  PunchGroupedPaymentTypeRowDto,
  PunchGroupedResponseDto,
  PunchGroupedRowDto,
} from '../dto/punch-grouped.dto'
import { resolveGroupedIssueFilter } from './punch-grouped-issue-filter'
import { buildPaymentTypeFilterSql } from './punch-payment-types'
import { liveStatusSql } from './punch-list-sql'
import type { PunchListLiveStatus } from '../dto/punch-list.dto'

export interface GroupedPunchOptions {
  page: number
  pageSize: number
  sort?: string
  dir?: 'asc' | 'desc'
  minHoursTotal?: number
  maxHoursTotal?: number
  /** Ids YA parseados y validados (parsePaymentTypeIds + catalogo del provider). */
  idPaymentTypes?: readonly number[]
  /** Estado en vivo del dia. Se reusa `liveStatusSql()`, que NO aporta binds. */
  todayLiveStatus?: PunchListLiveStatus
  search?: string
  idEmployee?: number
  issueType?: string
  /** Frontera superior congelada (`punch_in <= ?`) para que todas las páginas vean la misma foto. */
  snapshotAt?: string
  includePaymentTypeName?: boolean
  /** Lista blanca de tipos de error. Default `[1,2,3]` = comportamiento de siempre. */
  errorTypes?: readonly number[]
  /**
   * Sale de la policy (`resolveDeletedVisibility`). Sólo pesa en `only_fixed`.
   * Default seguro `false`.
   */
  includeDeletedFixes?: boolean
}

/**
 * Los codigos de tipo corregido llegan doblemente concatenados: `GROUP_CONCAT` por
 * ponchada los une con coma y el de afuera une las ponchadas con `<br/>`.
 * Se aplanan a un set ordenado de {1,2,3}.
 */
function parseCorrectedTypes(raw: string | null): number[] {
  if (!raw) return []
  const seen = new Set<number>()
  for (const token of raw.split(/<br\/>|,/)) {
    const value = Number(token.trim())
    if (value === 1 || value === 2 || value === 3) seen.add(value)
  }
  return [...seen].sort((a, b) => a - b)
}

/**
 * Las dos expresiones agregadas se definen UNA vez y las usan el SELECT y el
 * `nullFlag` del ORDER BY. Dos textos distintos que tienen que dar el mismo
 * numero es exactamente como se cuela el proximo bug de orden.
 */
const HOURS_NUMBER_EXPR =
  'SUM(TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1))'
const BREAK_NUMBER_EXPR =
  'SUM(TTK_CALCULATE_TIME_DAY(1, tew.break_end, tew.break_start, NULL, NULL, 1))'

type GroupedSortSpec = {
  /** Alias del SELECT: es lo que va como termino de orden. */
  order: string
  /**
   * Expresion agregada REPETIDA, solo si el alias puede ser NULL.
   *
   * ⚠️ NO se puede meter el ALIAS adentro del flag: MariaDB 10.3 devuelve
   *    ERROR 1247 (42S22): Reference 'breakNumber' not supported
   *    (reference to group function)
   * y la pantalla ve un 500. `ISNULL(breakNumber)` falla igual. Lo unico que
   * corre es repetir la agregada aca y dejar el alias como termino de orden.
   * Reproducido contra la base el 2026-09-08, en las dos direcciones.
   */
  nullFlag?: string
}

/**
 * Whitelist de orden de Grouped.
 *
 * `SUM()` devuelve NULL cuando TODOS los sumandos lo son, y eso pasa con 445 de
 * 1245 empleados de 2026 en `breakNumber`: por eso esos dos llevan `nullFlag`.
 * `nombreEmployee` no es nulable, y los tres contadores de P7 tampoco
 * (`COUNT(*)` y `SUM(CASE ... ELSE 0 END)` nunca dan NULL sobre un grupo no
 * vacio), asi que a esos el ORDER BY les queda identico al de hoy.
 */
const SORTABLE_COLUMNS: Record<PunchGroupedSort, GroupedSortSpec> = {
  nombreEmployee: { order: 'nombreEmployee' },
  hoursNumber: { order: 'hoursNumber', nullFlag: HOURS_NUMBER_EXPR },
  breakNumber: { order: 'breakNumber', nullFlag: BREAK_NUMBER_EXPR },
  punchCount: { order: 'punchCount' },
  errorCount: { order: 'errorCount' },
  fixedCount: { order: 'fixedCount' },
}

@Injectable()
export class GroupedPunchRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getGrouped(filter: SrsKpiFilter, opts: GroupedPunchOptions): Promise<PunchGroupedResponseDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)

    // Interpolado, no bindeado: este predicado aparece DOS veces (baseFrom y la
    // consulta de byPaymentType) y las dos comparten `baseParams`. Con binds
    // habria que tocar las dos y el orden se rompe. Ver punch-payment-types.ts.
    const paymentTypeFilterSql = buildPaymentTypeFilterSql(opts.idPaymentTypes ?? [])
    const paymentTypeParams: (string | number)[] = []

    const employeeSql = opts.idEmployee ? ' AND tew.id_author = ?' : ''
    const employeeParams = opts.idEmployee ? [opts.idEmployee] : []

    const searchSql =
      !opts.idEmployee && opts.search?.trim() ? ' AND u.nombre LIKE ?' : ''
    const searchParams =
      !opts.idEmployee && opts.search?.trim() ? [`%${opts.search.trim()}%`] : []

    // Frontera congelada: sin esto, cada ponchada nueva corre los OFFSET de las
    // páginas siguientes y un empleado puede repetirse o saltearse al navegar.
    //
    // La genera la BASE, no el navegador: `punch_in` se compara contra el reloj de
    // MariaDB, y la hora local del cliente cortaría filas de más. La primera página
    // la resuelve acá y el cliente la reenvía en las siguientes.
    let snapshotAt = opts.snapshotAt
    if (!snapshotAt) {
      const nowRows: { now_at: string }[] = await this.srs.query(
        "SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS now_at",
      )
      snapshotAt = String(nowRows[0]?.now_at ?? '')
    }
    const snapshotSql = snapshotAt ? ' AND tew.punch_in <= ?' : ''
    const snapshotParams = snapshotAt ? [snapshotAt] : []

    // El filtro se resuelve DESPUES del sello, no antes: en modo Corrected necesita
    // `snapshotAt` para congelar tambien el ledger (`f.fixed_at <= ?`). Construirlo
    // arriba dejaba la primera pagina sin congelar nada.
    const issue = resolveGroupedIssueFilter({
      issueType: opts.issueType,
      errorTypes: opts.errorTypes,
      fechaDesde,
      fechaHasta,
      includeDeletedFixes: opts.includeDeletedFixes === true,
      snapshotAt,
      dealerIds,
    })

    // El JOIN de dealer no se omite nunca — solo su predicado (§T6). En Corrected la
    // autorizacion por dealer se resuelve adentro, sobre `f.id_dealer`. El provider
    // NO se omite nunca, ni afuera ni adentro.
    const estadoSql = issue.estado === null ? '' : 'tew.estado = ? AND '
    const estadoParams = issue.estado === null ? [] : [issue.estado]

    const dealerAndSql = issue.skipOuterDealerPredicate ? '' : ttk.and
    const dealerAndParams = issue.skipOuterDealerPredicate ? [] : ttk.params

    const dateRangeSql = issue.skipOuterDateRange
      ? ''
      : ' AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)'
    const dateRangeParams = issue.skipOuterDateRange ? [] : [fechaDesde, fechaHasta]

    const outerEmployeeSql = issue.skipOuterEmployeeFilter ? '' : employeeSql
    const outerEmployeeParams = issue.skipOuterEmployeeFilter ? [] : employeeParams

    const baseFrom = `
      FROM TTK_EMPLOYEE_WORK tew
      ${ttk.join}
      INNER JOIN usuarios u ON u.id_usuario = tew.id_author
      WHERE ${estadoSql}tew.id_dealer_provider = ?
        ${dealerAndSql}
        ${dateRangeSql}
        ${snapshotSql}
        ${issue.extraSql}
        ${paymentTypeFilterSql}
        ${outerEmployeeSql}
        ${searchSql}
        ${liveStatusSql(opts.todayLiveStatus)}`

    // Cada bloque aporta sus binds EN EL ORDEN EN QUE SU SQL APARECE EN EL TEXTO.
    // El sello exterior se arma ANTES de issue.extraSql, asi que va antes.
    const baseParams = [
      ...estadoParams,
      idDealerProvider,
      ...dealerAndParams,
      ...dateRangeParams,
      ...snapshotParams,
      ...issue.extraParams,
      ...paymentTypeParams,
      ...outerEmployeeParams,
      ...searchParams,
    ]

    const havingClauses: string[] = []
    const havingParams: number[] = []
    if (opts.minHoursTotal != null) {
      havingClauses.push('hoursNumber >= ?')
      havingParams.push(opts.minHoursTotal)
    }
    if (opts.maxHoursTotal != null) {
      havingClauses.push('hoursNumber <= ?')
      havingParams.push(opts.maxHoursTotal)
    }
    const havingSql = havingClauses.length ? `HAVING ${havingClauses.join(' AND ')}` : ''

    // El @IsIn del DTO ya rechaza lo desconocido con 400; esto queda como red.
    const sortSpec =
      SORTABLE_COLUMNS[opts.sort as PunchGroupedSort] ?? SORTABLE_COLUMNS.nombreEmployee
    const sortDir = opts.dir === 'desc' ? 'DESC' : 'ASC'
    // Termino lider SIEMPRE ASC: los vacios al final en las dos direcciones (D-4).
    const nullTerm = sortSpec.nullFlag ? `(${sortSpec.nullFlag} IS NULL) ASC, ` : ''
    const orderBy = `${nullTerm}${sortSpec.order} ${sortDir}, u.id_usuario ${sortDir}`
    const offset = (opts.page - 1) * opts.pageSize

    const rows = await this.srs.query(
      `SELECT
         u.id_usuario                                                              AS idUsuario,
         u.nombre                                                                  AS nombreEmployee,
         ${HOURS_NUMBER_EXPR}                                                      AS hoursNumber,
         ${BREAK_NUMBER_EXPR}                                                      AS breakNumber,
         MAX(CASE WHEN ${issue.markSql} THEN 1 ELSE 0 END)          AS hasError,
         COUNT(*)                                                                  AS punchCount,
         SUM(CASE WHEN ${issue.currentErrorMarkSql} THEN 1 ELSE 0 END)              AS errorCount,
         SUM(CASE WHEN EXISTS (SELECT 1 FROM TTK_PUNCH_ERROR_FIX f7
                                WHERE ${issue.fixedCountSql})
                  THEN 1 ELSE 0 END)                                                AS fixedCount,
         NULLIF(
           GROUP_CONCAT(
             DISTINCT ${issue.markDetailSql}
             ORDER BY tew.punch_in
             SEPARATOR '<br/>'
           ),
           ''
         )                                                                                            AS errorDetail
       ${baseFrom}
       GROUP BY u.id_usuario, u.nombre
       ${havingSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      // Los binds del SELECT van ANTES que los del FROM y EN EL ORDEN EN QUE
      // APARECE SU TEXTO, que es: markSql (hasError) -> fixedCountSql
      // (fixedCount) -> markDetailSql (errorDetail). `currentErrorMarkSql` no
      // aporta binds: la lista de tipos va interpolada.
      //
      // No es cosmetico: `markDetailParams` y `fixedCountParams` salen los dos
      // de `buildFixPredicate` y hoy traen los MISMOS valores, asi que
      // invertirlos no se nota — hasta que los predicados diverjan, y ahi
      // `fixedCount` empieza a contar sobre otro periodo sin ningun error de SQL.
      //
      // OJO: la consulta de countRows NO lleva ninguno de los tres, porque su
      // SELECT interno no tiene esas columnas. Es el error mas facil de cometer aca.
      [
        ...issue.markParams,
        ...issue.fixedCountParams,
        ...issue.markDetailParams,
        ...baseParams,
        ...havingParams,
        opts.pageSize,
        offset,
      ],
    )

    const countRows = await this.srs.query(
      `SELECT COUNT(*) AS total FROM (
         SELECT u.id_usuario,
                SUM(TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1)) AS hoursNumber
         ${baseFrom}
         GROUP BY u.id_usuario
         ${havingSql}
       ) x`,
      [...baseParams, ...havingParams],
    )
    const total = Number(countRows[0]?.total ?? 0)

    const ids = rows.map((r: { idUsuario: number }) => Number(r.idUsuario))
    let byType: Record<number, PunchGroupedPaymentTypeRowDto[]> = {}
    if (ids.length > 0 && opts.includePaymentTypeName === true) {
      const placeholders = ids.map(() => '?').join(',')
      const typeRows = await this.srs.query(
        `SELECT
           tew.id_author                                                             AS idUsuario,
           tew.id_payment_type                                                       AS idPaymentType,
           COALESCE(gd.name, '(without)')                                            AS label,
           SUM(TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1)) AS hoursNumber
         FROM TTK_EMPLOYEE_WORK tew
         ${ttk.join}
         INNER JOIN usuarios u ON u.id_usuario = tew.id_author
         LEFT JOIN GENERIC_DATA gd ON gd.id = tew.id_payment_type
         WHERE ${estadoSql}tew.id_dealer_provider = ?
           ${dealerAndSql}
           ${dateRangeSql}
           ${snapshotSql}
           ${issue.extraSql}
           ${paymentTypeFilterSql}
           ${outerEmployeeSql}
           ${searchSql}
           ${liveStatusSql(opts.todayLiveStatus)}
           AND tew.id_author IN (${placeholders})
         GROUP BY tew.id_author, tew.id_payment_type, gd.name`,
        [...baseParams, ...ids],
      )
      byType = typeRows.reduce(
        (acc: Record<number, PunchGroupedPaymentTypeRowDto[]>, r: Record<string, unknown>) => {
          const id = Number(r.idUsuario)
          acc[id] = acc[id] ?? []
          acc[id].push({
            idPaymentType: r.idPaymentType == null ? null : Number(r.idPaymentType),
            label: String(r.label ?? '(without)'),
            hoursNumber: Math.round(Number(r.hoursNumber) * 100) / 100,
          })
          return acc
        },
        {},
      )
    }

    // La misma columna SQL alimenta dos campos distintos del DTO, segun la fuente:
    // en Pending trae el texto del error VIGENTE; en Corrected, los codigos de tipo
    // que se CORRIGIERON. Nunca las dos cosas a la vez.
    const results: PunchGroupedRowDto[] = rows.map((r: Record<string, unknown>) => {
      const detail = r.errorDetail ? String(r.errorDetail) : null
      return {
        idUsuario: Number(r.idUsuario),
        nombreEmployee: String(r.nombreEmployee ?? ''),
        hoursNumber: Math.round(Number(r.hoursNumber) * 100) / 100,
        breakNumber: Math.round(Number(r.breakNumber) * 100) / 100,
        hasError: Boolean(Number(r.hasError)),
        // Number() OBLIGATORIO: el driver de MariaDB devuelve COUNT/SUM como
        // string. Declararlos `number` en TS no transforma nada, y sin esto el
        // XLSX escribe TEXTO en columnas que tienen que ser numericas y ordenables.
        punchCount: Number(r.punchCount ?? 0),
        errorCount: Number(r.errorCount ?? 0),
        fixedCount: Number(r.fixedCount ?? 0),
        errorSummary: issue.marksCorrections ? null : detail,
        correctedTypes: issue.marksCorrections ? parseCorrectedTypes(detail) : null,
        byPaymentType: byType[Number(r.idUsuario)] ?? [],
      }
    })

    return {
      results,
      page: opts.page,
      pageSize: opts.pageSize,
      total,
      hasMore: offset + results.length < total,
      snapshotAt,
    }
  }
}
