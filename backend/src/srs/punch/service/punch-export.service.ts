import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'
import type { Writable } from 'stream'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchAccessPolicyService } from '../punch-access-policy'
import { PunchExportSemaphore } from '../punch-export-semaphore'
import { PunchExportTicketStore } from '../punch-export-ticket.store'
import {
  PunchExportPrepareDto,
  PunchExportPrepareResponseDto,
  PunchExportStatusDto,
} from '../dto/punch-export.dto'
import { PunchListRepository } from '../repository/punch-list.repository'
import {
  buildPunchExportFilename,
  contentDispositionAttachment,
  formatNyStamp,
  XLSX_MIME,
  type PunchExportLocale,
} from '../punch-export-format'
import {
  localeFromNavTemplate,
  punchExportLabels,
  type PunchExportLabels,
} from '../punch-export-labels'
import { writePunchExportWorkbook, type PunchExportMetaRow } from '../punch-export-xlsx'
import { isPunchIssueType } from '../punch-issue-types'
import { isDefaultErrorTypes, parseErrorTypes } from '../repository/punch-error-types'
import type { PunchListRowDto } from '../dto/punch-list.dto'

function ymdToUs(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd.trim())
  if (!m) return ymd
  return `${m[2]}/${m[3]}/${m[1]}`
}

function metaAll(labels: PunchExportLabels, value?: string | null): string {
  const v = value?.trim()
  return v ? v : labels.all
}

@Injectable()
export class PunchExportService {
  constructor(
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
    @Inject(PunchExportSemaphore) private readonly semaphore: PunchExportSemaphore,
    @Inject(PunchExportTicketStore) private readonly tickets: PunchExportTicketStore,
    @Inject(PunchListRepository) private readonly listRepo: PunchListRepository,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  async prepare(
    ctx: SrsContext,
    body: PunchExportPrepareDto,
  ): Promise<PunchExportPrepareResponseDto> {
    if (!this.semaphore.tryAcquire()) {
      throw new HttpException(
        'An export is already running. Try again when it finishes.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    try {
      const errorTypes = parseErrorTypes(body.errorTypes).values
      await this.policy.assertAndResolve(ctx, { ...body, errorTypes })
      return this.tickets.createPending(ctx.idUsuario, { ...body }, () => this.semaphore.release())
    } catch (e) {
      this.semaphore.release()
      throw e
    }
  }

  getStatus(ctx: SrsContext, ticket: string): PunchExportStatusDto {
    return this.tickets.getStatus(ticket, ctx.idUsuario)
  }

  async streamToResponse(ctx: SrsContext, ticketId: string, res: Response): Promise<void> {
    const ticket = this.tickets.consumeForDownload(ticketId, ctx.idUsuario)
    const filters = ticket.filters as PunchExportPrepareDto

    let headersSent = false
    let mysqlCleanup: (() => Promise<void>) | null = null
    let released = false

    const cleanup = async (kind: 'ok' | 'err', message?: string) => {
      if (released) return
      released = true
      try {
        await mysqlCleanup?.()
      } catch {
        // connection already gone
      }
      this.semaphore.release()
      if (kind === 'ok') {
        this.tickets.markDone(ticketId)
      } else {
        this.tickets.markError(ticketId, message ?? 'Export failed')
      }
    }

    res.on('close', () => {
      if (!released && !res.writableFinished) {
        void cleanup('err', 'client closed')
      }
    })

    try {
      // Misma lista que se validó en `prepare`: sale del ticket, no de un re-parseo
      // de un raw distinto. Si esto se salteara, el xlsx tendría otro filtro que
      // la pantalla y ningún test lo detectaría.
      const errorTypes = parseErrorTypes(filters.errorTypes).values
      const access = await this.policy.assertAndResolve(ctx, { ...filters, errorTypes })
      const filter = buildSrsKpiFilter(ctx, filters)
      const sqlOpts = {
        minHours: filters.minHours,
        maxHours: filters.maxHours,
        idPaymentType: filters.idPaymentType,
        search: filters.search,
        idEmployee: filters.idEmployee,
        issueType: filters.issueType,
        errorTypes,
        includeErrorType: access.includeErrorType,
        todayLiveStatus: filters.todayLiveStatus,
        includeAmounts: false,
        includePaymentTypeName: access.canViewPaymentTypeName,
      }

      const generatedAt = new Date()
      const locale = await this.resolveLocale(ctx)
      const generatedBy = await this.loadUserName(ctx.idUsuario)
      const meta = await this.buildReportMeta(
        ctx,
        filters,
        access.canViewPaymentTypeName,
        access.dealerIds,
        locale,
        generatedBy,
        generatedAt,
      )

      await this.listRepo.probeExport(filter, sqlOpts)

      const filename = buildPunchExportFilename(generatedAt)
      res.setHeader('Content-Type', XLSX_MIME)
      res.setHeader('Content-Disposition', contentDispositionAttachment(filename))
      res.flushHeaders()
      headersSent = true

      const opened = await this.listRepo.openExportStream(filter, sqlOpts)
      mysqlCleanup = opened.cleanup

      await writePunchExportWorkbook({
        stream: res as unknown as Writable,
        locale,
        includePaymentType: access.canViewPaymentTypeName,
        generatedBy,
        generatedAt,
        reportMeta: meta,
        rows: this.readableToRows(opened.readable, sqlOpts),
      })
      await cleanup('ok')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Export failed'
      if (!headersSent) {
        await cleanup('err', message)
        throw e
      }
      await cleanup('err', message)
      if (!res.destroyed) {
        res.destroy(e instanceof Error ? e : undefined)
      }
    }
  }

  private readableToRows(
    readable: NodeJS.ReadableStream,
    sqlOpts: {
      includeAmounts: boolean
      includePaymentTypeName: boolean
    },
  ): AsyncIterable<PunchListRowDto> {
    const map = (raw: Record<string, unknown>) => this.listRepo.mapRow(raw, sqlOpts)
    return (async function* () {
      for await (const raw of readable) {
        yield map(raw as unknown as Record<string, unknown>)
      }
    })()
  }

  private async resolveLocale(ctx: SrsContext): Promise<PunchExportLocale> {
    if (!ctx.idDealerProvider) return localeFromNavTemplate(1)
    const rows: { type_nav_template?: number }[] = await this.srs.query(
      'SELECT type_nav_template FROM CONTRATISTA WHERE id = ? LIMIT 1',
      [ctx.idDealerProvider],
    )
    return localeFromNavTemplate(Number(rows[0]?.type_nav_template ?? 1))
  }

  private async loadUserName(idUsuario: number): Promise<string> {
    const rows: { nombre?: string }[] = await this.srs.query(
      'SELECT nombre FROM usuarios WHERE id_usuario = ? LIMIT 1',
      [idUsuario],
    )
    return String(rows[0]?.nombre ?? idUsuario)
  }

  private async buildReportMeta(
    ctx: SrsContext,
    filters: PunchExportPrepareDto,
    canViewPaymentTypeName: boolean,
    dealerIds: number[],
    locale: PunchExportLocale,
    generatedBy: string,
    generatedAt: Date,
  ): Promise<PunchExportMetaRow[]> {
    const labels = punchExportLabels(locale)
    const dealerNames = await this.loadDealerNames(ctx.idDealerProvider, dealerIds)

    const issueType = (filters.issueType ?? 'all').trim() || 'all'
    const issueLabel = isPunchIssueType(issueType)
      ? labels.issueTypeLabels[issueType]
      : issueType

    // Nombres visibles de los tipos incluidos; "All" cuando están los tres.
    const includedErrorTypes = parseErrorTypes(filters.errorTypes).values
    const errorTypesLabel = isDefaultErrorTypes(includedErrorTypes)
      ? labels.all
      : includedErrorTypes.map((t) => labels.errorTypeNames[t as 1 | 2 | 3]).join(', ')

    const liveLabel = filters.todayLiveStatus
      ? labels.liveStatusLabels[filters.todayLiveStatus] ?? filters.todayLiveStatus
      : labels.all

    const employeeName = filters.idEmployee
      ? await this.loadEmployeeName(filters.idEmployee)
      : null

    const paymentTypeName =
      canViewPaymentTypeName && filters.idPaymentType
        ? await this.loadPaymentTypeName(filters.idPaymentType)
        : null

    const meta: PunchExportMetaRow[] = [
      { field: labels.report, value: labels.reportName },
      { field: labels.generated, value: formatNyStamp(generatedAt) },
      { field: labels.generatedBy, value: generatedBy },
      { field: labels.screen, value: labels.screenValue },
      { field: labels.punchTimeZone, value: labels.punchTimeZoneValue },
      {
        field: labels.period,
        value: `${ymdToUs(filters.fechaDesde)} ${labels.until} ${ymdToUs(filters.fechaHasta)}`,
      },
      { field: labels.dealers, value: dealerNames.length ? dealerNames.join(', ') : labels.all },
      { field: labels.employee, value: metaAll(labels, employeeName) },
      { field: labels.issueType, value: issueLabel },
      { field: labels.errorTypes, value: errorTypesLabel },
      { field: labels.liveStatus, value: liveLabel },
      {
        field: labels.minHours,
        value: filters.minHours != null ? String(filters.minHours) : labels.all,
      },
      {
        field: labels.maxHours,
        value: filters.maxHours != null ? String(filters.maxHours) : labels.all,
      },
      { field: labels.search, value: metaAll(labels, filters.search) },
    ]

    if (canViewPaymentTypeName) {
      meta.push({
        field: labels.paymentType,
        value:
          filters.issueType === 'without_salary'
            ? labels.issueTypeLabels.without_salary
            : metaAll(labels, paymentTypeName),
      })
    }

    return meta
  }

  private async loadDealerNames(idDealerProvider: number, dealerIds: number[]): Promise<string[]> {
    if (dealerIds.length === 0) return []
    const names: string[] = []
    for (const id of dealerIds) {
      const rows: { name?: string }[] = await this.srs.query(
        'SELECT GET_DEALER_NAME_BY_PROVIDER(?, ?) AS name',
        [idDealerProvider, id],
      )
      names.push(String(rows[0]?.name ?? id))
    }
    return names
  }

  private async loadEmployeeName(idEmployee: number): Promise<string> {
    const rows: { nombre?: string }[] = await this.srs.query(
      'SELECT nombre FROM usuarios WHERE id_usuario = ? LIMIT 1',
      [idEmployee],
    )
    return String(rows[0]?.nombre ?? idEmployee)
  }

  private async loadPaymentTypeName(id: number): Promise<string> {
    const rows: { name?: string }[] = await this.srs.query(
      'SELECT name FROM GENERIC_DATA WHERE id = ? LIMIT 1',
      [id],
    )
    return String(rows[0]?.name ?? id)
  }
}
