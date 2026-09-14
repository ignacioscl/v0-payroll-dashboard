import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { buildSrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { PunchAccessPolicyService, type PunchAccessPolicy } from '../punch-access-policy'
import { PunchExportSemaphore } from '../punch-export-semaphore'
import {
  PunchExportTicketStore,
  type DealerRankingExportStoredFilters,
} from '../punch-export-ticket.store'
import { PunchExportPrepareResponseDto, PunchExportStatusDto } from '../dto/punch-export.dto'
import { PunchDealerRankingExportPrepareDto } from '../dto/punch-dealer-ranking.dto'
import { PunchDealerRankingRepository } from '../repository/punch-dealer-ranking.repository'
import { isDefaultErrorTypes, parseErrorTypes } from '../repository/punch-error-types'
import {
  buildDealerRankingExportFilename,
  contentDispositionAttachment,
  formatNyStamp,
  XLSX_MIME,
  ymdToUs,
} from '../punch-export-format'
import { loadDealerNames, loadUserName, resolveLocale } from '../punch-export-lookups'
import {
  punchDealerRankingLabels,
  type PunchDealerRankingLabels,
} from '../punch-dealer-ranking-labels'
import { buildDealerRankingWorkbook } from '../punch-dealer-ranking-xlsx'
import { CORRECTIONS_LOG_START, correctionsCoverageNoticeApplies } from '../punch-corrections-log'
import type { PunchExportMetaRow } from '../punch-export-xlsx'

/** Lo que mira el gate: sale del body en el `prepare` y del ticket en la descarga. */
type DealerRankingGateFilters = Pick<DealerRankingExportStoredFilters, 'idDealer' | 'errorTypes'>

/**
 * Export del modal de dealers del Dashboard: Report Info + Dealers + Employees.
 *
 * Mismo protocolo que el export de Punch Report (`prepare` → ticket → `status` →
 * descarga) y el MISMO semáforo y ticket store: un export del ranking espera a que
 * termine uno de Punch Report y al revés. El ticket lleva `kind: 'dealer-ranking'`,
 * así que nunca se descarga por la ruta del otro.
 */
@Injectable()
export class PunchDealerRankingExportService {
  constructor(
    @Inject(PunchAccessPolicyService) private readonly policy: PunchAccessPolicyService,
    @Inject(PunchExportSemaphore) private readonly semaphore: PunchExportSemaphore,
    @Inject(PunchExportTicketStore) private readonly tickets: PunchExportTicketStore,
    @Inject(PunchDealerRankingRepository)
    private readonly repository: PunchDealerRankingRepository,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  async prepare(
    ctx: SrsContext,
    body: PunchDealerRankingExportPrepareDto,
  ): Promise<PunchExportPrepareResponseDto> {
    if (!this.semaphore.tryAcquire()) {
      throw new HttpException(
        'An export is already running. Try again when it finishes.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    try {
      await this.assertExportAccess(ctx, body)
      // Se guarda sólo lo que usa la descarga, no el body entero.
      const filters: DealerRankingExportStoredFilters = {
        fechaDesde: body.fechaDesde,
        fechaHasta: body.fechaHasta,
        idDealer: body.idDealer,
        errorTypes: body.errorTypes,
        search: body.search,
        status: body.status,
      }
      return this.tickets.createPending(
        ctx.idUsuario,
        filters,
        () => this.semaphore.release(),
        'dealer-ranking',
      )
    } catch (e) {
      this.semaphore.release()
      throw e
    }
  }

  getStatus(ctx: SrsContext, ticket: string): PunchExportStatusDto {
    return this.tickets.getStatus(ticket, ctx.idUsuario, 'dealer-ranking')
  }

  async download(ctx: SrsContext, ticketId: string, res: Response): Promise<void> {
    const ticket = this.tickets.consumeForDownload(ticketId, ctx.idUsuario, 'dealer-ranking')
    const filters = ticket.filters as DealerRankingExportStoredFilters

    let released = false
    const cleanup = (kind: 'ok' | 'err', message?: string) => {
      if (released) return
      released = true
      this.semaphore.release()
      if (kind === 'ok') {
        this.tickets.markDone(ticketId)
      } else {
        this.tickets.markError(ticketId, message ?? 'Export failed')
      }
    }

    res.on('close', () => {
      if (!released && !res.writableFinished) {
        cleanup('err', 'client closed')
      }
    })

    try {
      // Se revalida en la descarga, igual que Punch Report: el permiso o un dealer
      // pueden haber cambiado entre el `prepare` y el click.
      const access = await this.assertExportAccess(ctx, filters)
      const errorTypes = parseErrorTypes(filters.errorTypes).values
      const filter = buildSrsKpiFilter(ctx, filters)
      const opts = {
        errorTypes,
        search: filters.search,
        includeDeletedFixes: access.includeDeletedFixes,
      }

      // Sólo el estado pedido, y en serie: el pool es de 5 conexiones.
      const corrected = filters.status === 'corrected'
      const dealers = corrected
        ? await this.repository.getCorrectedByDealer(filter, opts)
        : await this.repository.getPendingByDealer(filter, opts)
      const employees = corrected
        ? await this.repository.getCorrectedByEmployee(filter, opts)
        : await this.repository.getPendingByEmployee(filter, opts)

      const generatedAt = new Date()
      const locale = await resolveLocale(this.srs, ctx)
      const labels = punchDealerRankingLabels(locale)
      const generatedBy = await loadUserName(this.srs, ctx.idUsuario)
      // Sólo dealers que ya pasaron la policy, DEALER_REL incluido:
      // GET_DEALER_NAME_BY_PROVIDER no mira el scope.
      const dealerNames = await loadDealerNames(this.srs, ctx.idDealerProvider, access.dealerIds)
      // El texto de la pantalla, con la fecha MM/DD/YYYY también en español (DP3).
      const notice = correctionsCoverageNoticeApplies(filters.status, filters.fechaDesde)
        ? labels.correctionsCoverageNotice(ymdToUs(CORRECTIONS_LOG_START))
        : null

      const workbook = buildDealerRankingWorkbook({
        locale,
        status: filters.status,
        errorTypes,
        generatedAt,
        reportMeta: buildReportMeta(
          labels,
          filters,
          errorTypes,
          dealerNames,
          generatedBy,
          generatedAt,
          notice,
        ),
        notice,
        dealers,
        employees,
      })

      res.setHeader('Content-Type', XLSX_MIME)
      res.setHeader(
        'Content-Disposition',
        contentDispositionAttachment(buildDealerRankingExportFilename(generatedAt)),
      )
      // El libro ya está entero en memoria: `write` lo vuelca al response y lo
      // cierra. No hace falta el stream de Punch Report.
      await workbook.xlsx.write(res)
      cleanup('ok')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Export failed'
      cleanup('err', message)
      if (!res.headersSent) {
        // Falló antes del primer byte: el error sale como JSON por el filtro de Nest.
        // Con estos headers puestos, el navegador lo bajaría como un .xlsx roto.
        res.removeHeader('Content-Type')
        res.removeHeader('Content-Disposition')
        throw e
      }
      if (!res.destroyed) {
        res.destroy(e instanceof Error ? e : undefined)
      }
    }
  }

  /**
   * El export SÍ exige *Time Tracking > Hours Admin.* (65), a diferencia del
   * ranking: la hoja Employees muestra errores por empleado, que hoy sólo se ven en
   * Punch Report con ese permiso (DP1). Pasa por el gate completo de Punch Report con
   * `only_error` (permiso, externos afuera, dealers en scope) y además por DEALER_REL,
   * para que el Report Info no pueda nombrar un dealer de otro cliente.
   */
  private async assertExportAccess(
    ctx: SrsContext,
    filters: DealerRankingGateFilters,
  ): Promise<PunchAccessPolicy> {
    const errorTypes = parseErrorTypes(filters.errorTypes).values
    const access = await this.policy.assertAndResolve(ctx, {
      idDealer: filters.idDealer,
      issueType: 'only_error',
      errorTypes,
    })
    await this.policy.assertDealersRelatedToProvider(ctx, access.dealerIds)
    return access
  }
}

/**
 * Report Info: cuándo, quién, desde qué pantalla y TODOS los filtros, con "All"
 * cuando vienen vacíos (xls-export-report-info). Fechas en formato de Estados Unidos.
 */
function buildReportMeta(
  labels: PunchDealerRankingLabels,
  filters: DealerRankingExportStoredFilters,
  errorTypes: readonly number[],
  dealerNames: readonly string[],
  generatedBy: string,
  generatedAt: Date,
  notice: string | null,
): PunchExportMetaRow[] {
  // Nombres visibles de los tipos incluidos; "All" cuando están los tres.
  const errorTypesLabel = isDefaultErrorTypes(errorTypes)
    ? labels.all
    : errorTypes.map((t) => labels.errorTypeNames[t as 1 | 2 | 3]).join(', ')
  const search = filters.search?.trim()

  const meta: PunchExportMetaRow[] = [
    { field: labels.report, value: labels.reportNames[filters.status] },
    { field: labels.generated, value: formatNyStamp(generatedAt) },
    { field: labels.generatedBy, value: generatedBy },
    { field: labels.screen, value: labels.screenValue },
    {
      field: labels.period,
      value: `${ymdToUs(filters.fechaDesde)} ${labels.until} ${ymdToUs(filters.fechaHasta)}`,
    },
    { field: labels.dateBasis, value: labels.dateBasisValue },
    { field: labels.dealers, value: dealerNames.length ? dealerNames.join(', ') : labels.all },
    { field: labels.errorStatus, value: labels.errorStatusLabels[filters.status] },
    { field: labels.errorTypes, value: errorTypesLabel },
    { field: labels.search, value: search ? search : labels.all },
  ]
  if (notice) {
    meta.push({ field: labels.notice, value: notice })
  }
  return meta
}
