import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'
import type { Writable } from 'stream'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import {
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  SrsPermissionRepository,
} from '../../auth/srs-permission.repository'
import { PunchExportSemaphore } from '../../shared/export/punch-export-semaphore'
import { PunchExportTicketStore } from '../../shared/export/punch-export-ticket.store'
import {
  buildNyStampedExportFilename,
  contentDispositionAttachment,
  XLSX_MIME,
} from '../../punch/punch-export-format'
import { loadUserName, resolveLocale } from '../../punch/punch-export-lookups'
import { DB_POOL_BUSY, isPoolBusyError } from '../../srs-pool-acquire-timeout'
import { buildInvoiceListFilter, type InvoiceListFilter, InvoiceListQueryDto } from '../dto/invoice-list.dto'
import {
  InvoiceExportPrepareResponseDto,
  InvoiceExportStatusDto,
  type InvoiceListExportStoredFilters,
} from '../dto/invoice-export.dto'
import { InvoiceRepository } from '../repository/invoice.repository'
import { invoiceExportLabels } from '../invoice-export-labels'
import { invoiceListExportLabels } from '../invoice-list-export-values'
import { writeInvoiceListExportWorkbook } from '../invoice-list-export-xlsx'
import { buildInvoiceExportReportInfo } from './invoice-export.service'

const TICKET_KIND = 'invoice-list-export' as const
const EXPORT_CHUNK_SIZE = 1000

/**
 * Billing › Invoices, «Export» of the grid's toolbar (plans/plan-report-info-exports-tablas §6):
 * the same columns, values and order the browser wrote, now built here with Report Info (D5).
 * Same ticket + semaphore as Export / Email and Punch Report (the slot protects the pool), with its
 * own ticket kind. Only «Invoices > Module Access» (15), like the list: this button never asked for
 * «Print Invoice», and it still does not.
 */
@Injectable()
export class InvoiceListExportService {
  constructor(
    @Inject(InvoiceRepository) private readonly repository: InvoiceRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
    @Inject(PunchExportSemaphore) private readonly semaphore: PunchExportSemaphore,
    @Inject(PunchExportTicketStore) private readonly tickets: PunchExportTicketStore,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  private async assertAccess(ctx: SrsContext): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
  }

  private filterOf(ctx: SrsContext, query: InvoiceListQueryDto): InvoiceListFilter {
    const filter = buildInvoiceListFilter(ctx, query)
    if (filter.dealerIds.length === 0) {
      throw new BadRequestException('Select at least one dealer to list invoices')
    }
    return filter
  }

  async prepare(ctx: SrsContext, query: InvoiceListQueryDto): Promise<InvoiceExportPrepareResponseDto> {
    await this.assertAccess(ctx)
    this.filterOf(ctx, query)
    if (!this.semaphore.tryAcquire()) {
      throw new HttpException(
        'An export is already running. Try again when it finishes.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    try {
      const stored: InvoiceListExportStoredFilters = { listExport: true, query }
      return this.tickets.createPending(ctx.idUsuario, stored, () => this.semaphore.release(), TICKET_KIND)
    } catch (e) {
      this.semaphore.release()
      throw e
    }
  }

  getStatus(ctx: SrsContext, ticket: string): InvoiceExportStatusDto {
    return this.tickets.getStatus(ticket, ctx.idUsuario, TICKET_KIND) as InvoiceExportStatusDto
  }

  async streamToResponse(ctx: SrsContext, ticketId: string, res: Response): Promise<void> {
    const ticket = this.tickets.consumeForDownload(ticketId, ctx.idUsuario, TICKET_KIND)
    const stored = ticket.filters as InvoiceListExportStoredFilters

    let headersSent = false
    let released = false
    const cleanup = (kind: 'ok' | 'err', message?: string, code?: string) => {
      if (released) return
      released = true
      this.semaphore.release()
      if (kind === 'ok') {
        this.tickets.markDone(ticketId)
      } else {
        this.tickets.markError(ticketId, message ?? 'Export failed', code)
      }
    }

    res.on('close', () => {
      if (!released && !res.writableFinished) cleanup('err', 'client closed')
    })

    try {
      // Revalidated on the download: the permission may have been removed since `prepare`.
      await this.assertAccess(ctx)
      const filter = this.filterOf(ctx, stored.query)
      const generatedAt = new Date()
      const [locale, generatedBy, names, removed] = await Promise.all([
        resolveLocale(this.srs, ctx),
        loadUserName(this.srs, ctx.idUsuario),
        this.repository.exportFilterNames(filter),
        this.repository.exportRemovedDealers(filter),
      ])
      const labels = invoiceExportLabels(locale)
      const listLabels = invoiceListExportLabels(locale)
      const yesNo = (v: boolean) => (v ? labels.yes : labels.no)
      const reportInfo = buildInvoiceExportReportInfo({
        labels,
        exportType: 1,
        generatedAt,
        generatedBy,
        query: stored.query,
        filter,
        names,
        removedDealers: removed.map((d) => d.dealer),
        listExport: {
          reportName: listLabels.reportName,
          extraRows: [
            { field: listLabels.includePartial, value: yesNo(filter.includePartial) },
            { field: listLabels.filterDateDone, value: yesNo(filter.filterDateDone) },
          ],
        },
      })

      res.setHeader('Content-Type', XLSX_MIME)
      res.setHeader(
        'Content-Disposition',
        contentDispositionAttachment(buildNyStampedExportFilename('invoices', generatedAt)),
      )
      res.flushHeaders()
      headersSent = true

      await writeInvoiceListExportWorkbook({
        stream: res as unknown as Writable,
        locale,
        generatedAt,
        reportInfo,
        includePartial: filter.includePartial,
        chunks: this.repository.listExportRowChunks(filter, EXPORT_CHUNK_SIZE),
      })
      cleanup('ok')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Export failed'
      const code = isPoolBusyError(e) ? DB_POOL_BUSY : undefined
      cleanup('err', message, code)
      if (!headersSent) throw e
      if (!res.destroyed) res.destroy(e instanceof Error ? e : undefined)
    }
  }
}
