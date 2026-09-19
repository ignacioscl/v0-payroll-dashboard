import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'
import type { Writable } from 'stream'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchAccessPolicyService, type PunchAccessPolicy } from '../punch-access-policy'
import { PunchExportSemaphore } from '../punch-export-semaphore'
import { PunchExportTicketStore, type PunchExportStoredFilters } from '../punch-export-ticket.store'
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
  ymdToUs,
  type PunchExportLocale,
} from '../punch-export-format'
import { punchExportLabels, type PunchExportLabels } from '../punch-export-labels'
import { loadDealerNames, loadUserName, resolveLocale } from '../punch-export-lookups'
import { writePunchExportWorkbook, type PunchExportMetaRow } from '../punch-export-xlsx'
import { isPunchIssueType } from '../punch-issue-types'
import { parsePaymentTypeIds } from '../repository/punch-payment-types'
import { assertPaymentTypesInCatalog } from '../repository/punch-payment-type-catalog'
import { isCompleteEffectiveList, parseErrorTypes } from '../repository/punch-error-types'
import type { PunchListRowDto } from '../dto/punch-list.dto'

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
      const idPaymentTypes = parsePaymentTypeIds(body.idPaymentTypes)
      await this.policy.assertAndResolve(ctx, { ...body, errorTypes, idPaymentTypes })
      await assertPaymentTypesInCatalog(this.srs, ctx.idDealerProvider, idPaymentTypes)
      // El ticket guarda la forma YA canonica: el replay de la descarga no
      // vuelve a parsear un raw distinto del que se valido aca.
      return this.tickets.createPending(ctx.idUsuario, { ...body, idPaymentTypes }, () =>
        this.semaphore.release(),
      )
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
    // Tipado con la forma ALMACENADA, no con el DTO crudo: el ticket guarda
    // `idPaymentTypes` ya parseado a number[] (ver `prepare`).
    const filters = ticket.filters as PunchExportStoredFilters

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
      const idPaymentTypes = filters.idPaymentTypes ?? []
      const access = await this.policy.assertAndResolve(ctx, { ...filters, errorTypes, idPaymentTypes })
      // Se revalida en la descarga: un id puede haber dejado de ser valido entre
      // el `prepare` y el click (se desactivo, cambio de provider). Sin esto el
      // XLSX saldria con un filtro que hoy ya no esta autorizado.
      const paymentTypeRows = await assertPaymentTypesInCatalog(
        this.srs,
        ctx.idDealerProvider,
        idPaymentTypes,
      )
      const filter = buildSrsKpiFilter(ctx, filters)
      const sqlOpts = {
        minHours: filters.minHours,
        maxHours: filters.maxHours,
        idPaymentTypes,
        search: filters.search,
        idEmployee: filters.idEmployee,
        issueType: filters.issueType,
        errorTypes: access.effectiveErrorTypes,
        includeErrorType: access.includeErrorType,
        includeDeletedFixes: access.includeDeletedFixes,
        todayLiveStatus: filters.todayLiveStatus,
        includeAmounts: false,
        includePaymentTypeName: access.canViewPaymentTypeName,
      }

      const generatedAt = new Date()
      const locale = await resolveLocale(this.srs, ctx)
      const generatedBy = await loadUserName(this.srs, ctx.idUsuario)
      const meta = await this.buildReportMeta(
        ctx,
        filters,
        paymentTypeRows.map((r: { name: string }) => r.name),
        access,
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
        includeCorrected: filters.issueType === 'only_fixed',
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

  private async buildReportMeta(
    ctx: SrsContext,
    filters: PunchExportStoredFilters,
    /**
     * Nombres YA resueltos contra el catalogo del provider
     * (assertPaymentTypesInCatalog). NO se resuelven aca: la version vieja
     * consultaba GENERIC_DATA sin categoria, sin estado y sin provider, y por
     * ahi se filtraba el nombre de un tipo ajeno al Report Info (4.2.3ter).
     */
    paymentTypeNames: readonly string[],
    access: PunchAccessPolicy,
    locale: PunchExportLocale,
    generatedBy: string,
    generatedAt: Date,
  ): Promise<PunchExportMetaRow[]> {
    const labels = punchExportLabels(locale)
    const dealerNames = await loadDealerNames(this.srs, ctx.idDealerProvider, access.dealerIds)
    const canViewPaymentTypeName = access.canViewPaymentTypeName

    const issueType = (filters.issueType ?? 'all').trim() || 'all'
    const issueLabel = isPunchIssueType(issueType)
      ? labels.issueTypeLabels[issueType]
      : issueType

    const includedErrorTypes = access.effectiveErrorTypes
    const errorTypesLabel = isCompleteEffectiveList(includedErrorTypes, {
      canViewPaymentType: access.canViewPaymentTypeName,
      includeDeletedFixes: access.includeDeletedFixes,
      canViewFakeGps: access.canViewFakeGps,
      isExternal: ctx.isUserDealer,
    })
      ? labels.all
      : includedErrorTypes
          .map((t) => labels.errorTypeNames[t as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8] ?? String(t))
          .join(', ')

    const liveLabel = filters.todayLiveStatus
      ? labels.liveStatusLabels[filters.todayLiveStatus] ?? filters.todayLiveStatus
      : labels.all

    const employeeName = filters.idEmployee
      ? await this.loadEmployeeName(filters.idEmployee)
      : null

    const paymentTypeLabel = paymentTypeNames.length > 0 ? paymentTypeNames.join(', ') : null

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
      // El eje pendiente/corregido salió de `issueType` y es un filtro propio: sin
      // esta fila el archivo lista corregidos y dice que no hay filtro de estado.
      {
        field: labels.errorStatus,
        value:
          filters.issueType === 'only_fixed'
            ? labels.errorStatusLabels.corrected
            : labels.errorStatusLabels.pending,
      },
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
      // D-12: `All` o la lista de nombres, y NADA MAS.
      //
      // «Sin tipo de pago» NO sale por aca: sale por la fila de *Issue type*,
      // que ya escribe `Without salary`. Hasta la v8 esta fila tenia una rama
      // `issueType === 'without_salary'` que lo duplicaba, y con D-6 quedo
      // directamente mal: el combo ya no puede pedir «sin tipo», asi que esa
      // rama hacia que el Report Info dijera «Payment type: Without salary»
      // cuando el filtro de payment type estaba en `All`.
      meta.push({
        field: labels.paymentType,
        value: metaAll(labels, paymentTypeLabel),
      })
    }

    return meta
  }

  private async loadEmployeeName(idEmployee: number): Promise<string> {
    const rows: { nombre?: string }[] = await this.srs.query(
      'SELECT nombre FROM usuarios WHERE id_usuario = ? LIMIT 1',
      [idEmployee],
    )
    return String(rows[0]?.nombre ?? idEmployee)
  }

}
