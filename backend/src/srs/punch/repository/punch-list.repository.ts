import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryRunner } from 'typeorm'
import { Readable } from 'stream'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  PunchListFixDto,
  PunchListLiveStatus,
  PunchListResponseDto,
  PunchListRowDto,
  PunchListSort,
} from '../dto/punch-list.dto'
import { DEFAULT_ERROR_TYPES, fixLedgerInList } from './punch-error-types'
import { mapPunchListRow } from './punch-list-row'
import {
  buildPunchListExportSql,
  buildPunchListFromWhere,
  buildPunchListPageSql,
  PunchListSqlOpts,
} from './punch-list-sql'

export { utcEpochExpr } from './punch-list-sql'
export { epochToIso } from './punch-list-epoch'

export interface PunchListOptions {
  pageSize: number
  sort?: PunchListSort
  dir?: 'asc' | 'desc'
  afterValue?: string
  afterId?: number
  /** '1' = la ultima fila recibida cae en el tramo de vacios. */
  afterEmpty?: '0' | '1'
  minHours?: number
  maxHours?: number
  /** Ids YA parseados y validados (parsePaymentTypeIds + catalogo del provider). */
  idPaymentTypes?: readonly number[]
  search?: string
  idEmployee?: number
  issueType?: string
  todayLiveStatus?: PunchListLiveStatus
  includeAmounts: boolean
  includePaymentTypeName: boolean
  errorTypes?: readonly number[]
  includeErrorType?: boolean
  includeDeletedFixes?: boolean
  snapshotAt?: string
}

@Injectable()
export class PunchListRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getList(filter: SrsKpiFilter, opts: PunchListOptions): Promise<PunchListResponseDto> {
    const flags = {
      includeAmounts: opts.includeAmounts,
      includePaymentTypeName: opts.includePaymentTypeName,
      includeErrorType: opts.includeErrorType === true,
    }
    const page = buildPunchListPageSql(filter, opts)

    const rows: Record<string, unknown>[] = await this.srs.query(page.sql, page.params)

    const hasMore = rows.length > opts.pageSize
    const pageRows = hasMore ? rows.slice(0, opts.pageSize) : rows

    const countRows: { total: number | string }[] = await this.srs.query(page.countSql, page.baseParams)
    const total = Number(countRows[0]?.total ?? 0)

    const results = pageRows.map((r) => mapPunchListRow(r, flags))
    await this.attachFixes(results, filter, opts)

    const last = pageRows[pageRows.length - 1]
    // UNA sola forma de leer el cursor, sirva la columna que sirva: el SELECT de
    // pagina proyecta `sort_value`/`sort_empty` para el sort activo. Antes esto
    // elegia entre `nombre` y `punch_in_cursor` a mano, y por eso agregar
    // columnas al orden mandaba el `punch_in` de la ultima fila y la pagina 2
    // salia de cualquier lado (BUG-07).
    const nextCursor =
      hasMore && last
        ? {
            empty: (Number(last.sort_empty) === 1 ? 1 : 0) as 0 | 1,
            value: last.sort_value == null ? null : String(last.sort_value),
            id: Number(last.id),
          }
        : null

    return { results, pageSize: opts.pageSize, total, hasMore, nextCursor }
  }

  /**
   * Segunda consulta por los ids de la página, sólo en modo Corrected.
   *
   * La página tiene 25-50 ids: una consulta más, indexada por `idx_punch`, y
   * `fixes[]` llega completo y ordenado. Meterlo en el SQL de filas con un
   * `GROUP_CONCAT` lo truncaría en `group_concat_max_len` sin avisar.
   *
   * El predicado es el MISMO que el del `EXISTS` que seleccionó las filas: un evento
   * de un tipo destildado no aparece acá aunque la ponchada haya entrado por otro.
   */
  private async attachFixes(
    rows: PunchListRowDto[],
    filter: SrsKpiFilter,
    opts: PunchListSqlOpts,
  ): Promise<void> {
    if (opts.issueType !== 'only_fixed' || rows.length === 0) return

    const ids = rows.map((r) => r.id).filter((id) => Number.isFinite(id) && id > 0)
    if (ids.length === 0) return

    const ledger = fixLedgerInList(opts.errorTypes ?? DEFAULT_ERROR_TYPES)
    if (!ledger) {
      for (const row of rows) row.fixes = []
      return
    }
    const types = ledger
    const params: (string | number)[] = [filter.idDealerProvider, ...ids]
    let sql =
      `SELECT f.id_ttk_employee_work                        AS punch_id,
              f.error_type                                  AS error_type,
              DATE_FORMAT(f.punch_date, '%Y-%m-%d')         AS punch_date,
              DATE_FORMAT(f.fixed_at, '%Y-%m-%d %H:%i:%s')  AS fixed_at,
              uf.nombre                                     AS fixed_by_nombre
         FROM TTK_PUNCH_ERROR_FIX f
         LEFT JOIN usuarios uf ON uf.id_usuario = f.id_fixed_by
        WHERE f.id_dealer_provider = ?
          AND f.id_ttk_employee_work IN (${ids.map(() => '?').join(',')})
          AND f.error_type IN (${types})`

    if (filter.fechaDesde && filter.fechaHasta) {
      sql += ' AND f.punch_date >= ? AND f.punch_date <= ?'
      params.push(filter.fechaDesde, filter.fechaHasta)
    }
    if (opts.snapshotAt) {
      sql += ' AND f.fixed_at <= ?'
      params.push(opts.snapshotAt)
    }
    sql += ' ORDER BY f.fixed_at ASC, f.id ASC'

    const fixRows: Record<string, unknown>[] = await this.srs.query(sql, params)

    const byPunch = new Map<number, PunchListFixDto[]>()
    for (const r of fixRows) {
      const punchId = Number(r.punch_id)
      const list = byPunch.get(punchId) ?? []
      list.push({
        errorType: Number(r.error_type),
        punchDate: String(r.punch_date ?? ''),
        fixedAt: String(r.fixed_at ?? ''),
        fixedByName: r.fixed_by_nombre == null ? null : String(r.fixed_by_nombre),
      })
      byPunch.set(punchId, list)
    }

    for (const row of rows) {
      row.fixes = byPunch.get(row.id) ?? []
    }
  }

  /** Cheap preflight so SQL errors become JSON before the xlsx headers go out. */
  async probeExport(filter: SrsKpiFilter, opts: PunchListSqlOpts): Promise<void> {
    const { fromWhere, params } = buildPunchListFromWhere(filter, opts)
    await this.srs.query(`SELECT 1 ${fromWhere} LIMIT 1`, params)
  }

  async openExportStream(
    filter: SrsKpiFilter,
    opts: PunchListSqlOpts,
  ): Promise<{
    queryRunner: QueryRunner
    readable: Readable
    cleanup: () => Promise<void>
  }> {
    const { sql, params } = buildPunchListExportSql(filter, opts)
    const queryRunner = this.srs.createQueryRunner()
    await queryRunner.connect()

    let cleaned = false
    const cleanup = async () => {
      if (cleaned) return
      cleaned = true
      const conn = (
        queryRunner as QueryRunner & { databaseConnection?: { destroy?: () => void } }
      ).databaseConnection
      try {
        if (conn && typeof conn.destroy === 'function') {
          conn.destroy()
        }
      } finally {
        try {
          await queryRunner.release()
        } catch {
          // release is a no-op after destroy() nulls the pool handle
        }
      }
    }

    try {
      const readable = (await queryRunner.stream(sql, params)) as Readable
      return { queryRunner, readable, cleanup }
    } catch (e) {
      await cleanup()
      throw e
    }
  }

  mapRow(raw: Record<string, unknown>, opts: PunchListSqlOpts): PunchListRowDto {
    return mapPunchListRow(raw, {
      includeAmounts: Boolean(opts.includeAmounts),
      includePaymentTypeName: Boolean(opts.includePaymentTypeName),
      includeErrorType: Boolean(opts.includeErrorType),
    })
  }
}
