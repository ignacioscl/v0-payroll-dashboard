import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, QueryRunner } from 'typeorm'
import { Readable } from 'stream'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import {
  PunchListLiveStatus,
  PunchListResponseDto,
  PunchListRowDto,
  PunchListSort,
} from '../dto/punch-list.dto'
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
  minHours?: number
  maxHours?: number
  idPaymentType?: number
  search?: string
  idEmployee?: number
  issueType?: string
  todayLiveStatus?: PunchListLiveStatus
  includeAmounts: boolean
  includePaymentTypeName: boolean
  errorTypes?: readonly number[]
  includeErrorType?: boolean
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

    const last = pageRows[pageRows.length - 1]
    const sort: PunchListSort = opts.sort ?? 'punchIn'
    const nextCursor =
      hasMore && last
        ? {
            value: String(sort === 'employee' ? (last.nombre ?? '') : (last.punch_in_cursor ?? '')),
            id: Number(last.id),
          }
        : null

    return { results, pageSize: opts.pageSize, total, hasMore, nextCursor }
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
