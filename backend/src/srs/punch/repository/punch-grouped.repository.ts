import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'
import {
  PunchGroupedPaymentTypeRowDto,
  PunchGroupedResponseDto,
  PunchGroupedRowDto,
} from '../dto/punch-grouped.dto'
import { resolveGroupedIssueFilter } from './punch-grouped-issue-filter'

export interface GroupedPunchOptions {
  page: number
  pageSize: number
  sort?: string
  dir?: 'asc' | 'desc'
  minHoursTotal?: number
  maxHoursTotal?: number
  idPaymentType?: number
  search?: string
  idEmployee?: number
  issueType?: string
}

const SORTABLE_COLUMNS: Record<string, string> = {
  nombreEmployee: 'nombreEmployee',
  hoursNumber: 'hoursNumber',
  breakNumber: 'breakNumber',
}

@Injectable()
export class GroupedPunchRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getGrouped(filter: SrsKpiFilter, opts: GroupedPunchOptions): Promise<PunchGroupedResponseDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
    const issue = resolveGroupedIssueFilter(opts.issueType)

    const paymentTypeFilterSql = opts.idPaymentType ? ' AND tew.id_payment_type = ?' : ''
    const paymentTypeParams = opts.idPaymentType ? [opts.idPaymentType] : []

    const employeeSql = opts.idEmployee ? ' AND tew.id_author = ?' : ''
    const employeeParams = opts.idEmployee ? [opts.idEmployee] : []

    const searchSql =
      !opts.idEmployee && opts.search?.trim() ? ' AND u.nombre LIKE ?' : ''
    const searchParams =
      !opts.idEmployee && opts.search?.trim() ? [`%${opts.search.trim()}%`] : []

    const baseFrom = `
      FROM TTK_EMPLOYEE_WORK tew
      ${ttk.join}
      INNER JOIN usuarios u ON u.id_usuario = tew.id_author
      WHERE tew.estado = ?
        AND tew.id_dealer_provider = ?
        ${ttk.and}
        AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
        ${issue.extraSql}
        ${paymentTypeFilterSql}
        ${employeeSql}
        ${searchSql}`

    const baseParams = [
      issue.estado,
      idDealerProvider,
      ...ttk.params,
      fechaDesde,
      fechaHasta,
      ...paymentTypeParams,
      ...employeeParams,
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

    const sortCol = SORTABLE_COLUMNS[opts.sort ?? ''] ?? 'nombreEmployee'
    const sortDir = opts.dir === 'desc' ? 'DESC' : 'ASC'
    const offset = (opts.page - 1) * opts.pageSize

    const rows = await this.srs.query(
      `SELECT
         u.id_usuario                                                              AS idUsuario,
         u.nombre                                                                  AS nombreEmployee,
         SUM(TTK_CALCULATE_TIME_DAY(1, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1)) AS hoursNumber,
         SUM(TTK_CALCULATE_TIME_DAY(1, tew.break_end, tew.break_start, NULL, NULL, 1))                  AS breakNumber,
         MAX(CASE WHEN TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1, 2, 3) THEN 1 ELSE 0 END)          AS hasError,
         NULLIF(
           GROUP_CONCAT(
             DISTINCT CASE
               WHEN TTK_PUNCH_WITH_ERROR_V2(tew.id, '') IN (1, 2, 3)
               THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(TTK_PUNCH_WITH_ERROR(tew.id), '$.res')), '')
               ELSE NULL
             END
             ORDER BY tew.punch_in
             SEPARATOR '<br/>'
           ),
           ''
         )                                                                                            AS errorSummary
       ${baseFrom}
       GROUP BY u.id_usuario, u.nombre
       ${havingSql}
       ORDER BY ${sortCol} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...baseParams, ...havingParams, opts.pageSize, offset],
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
    if (ids.length > 0) {
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
         WHERE tew.estado = ?
           AND tew.id_dealer_provider = ?
           ${ttk.and}
           AND tew.punch_in >= ? AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
           ${issue.extraSql}
           ${paymentTypeFilterSql}
           ${employeeSql}
           ${searchSql}
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

    const results: PunchGroupedRowDto[] = rows.map((r: Record<string, unknown>) => ({
      idUsuario: Number(r.idUsuario),
      nombreEmployee: String(r.nombreEmployee ?? ''),
      hoursNumber: Math.round(Number(r.hoursNumber) * 100) / 100,
      breakNumber: Math.round(Number(r.breakNumber) * 100) / 100,
      hasError: Boolean(Number(r.hasError)),
      errorSummary: r.errorSummary ? String(r.errorSummary) : null,
      byPaymentType: byType[Number(r.idUsuario)] ?? [],
    }))

    return {
      results,
      page: opts.page,
      pageSize: opts.pageSize,
      total,
      hasMore: offset + results.length < total,
    }
  }
}
