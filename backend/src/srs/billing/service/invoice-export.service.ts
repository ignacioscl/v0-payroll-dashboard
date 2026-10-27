import { BadRequestException, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'
import { createHash } from 'crypto'
import { PassThrough, type Writable } from 'stream'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import {
  ROL_ACCION_INVOICE_PRINT,
  ROL_ACCION_INVOICES_MODULE_ACCESS,
  SrsPermissionRepository,
} from '../../auth/srs-permission.repository'
import { PunchExportSemaphore } from '../../shared/export/punch-export-semaphore'
import { PunchExportTicketStore } from '../../shared/export/punch-export-ticket.store'
import type { ReportInfoRow } from '../../shared/export/report-info-sheet'
import {
  contentDispositionAttachment,
  formatNyStamp,
  XLSX_MIME,
  ymdToUs,
} from '../../punch/punch-export-format'
import { loadUserName, resolveLocale } from '../../punch/punch-export-lookups'
import { DB_POOL_BUSY, isPoolBusyError } from '../../srs-pool-acquire-timeout'
import {
  buildInvoiceListFilter,
  type InvoiceListFilter,
  InvoiceListQueryDto,
} from '../dto/invoice-list.dto'
import {
  InvoiceExportMailBodyDto,
  InvoiceExportPrepareBodyDto,
  InvoiceExportPrepareResponseDto,
  InvoiceExportStatusDto,
  parseInvoiceExportEmails,
  type InvoiceExportMailResult,
  type InvoiceExportStoredFilters,
  type InvoiceExportType,
} from '../dto/invoice-export.dto'
import { buildMultipart, phpRequest } from '../invoice-export-php-client'
import { InvoiceRepository } from '../repository/invoice.repository'
import { invoiceExportLabels, invoiceExportReportName, type InvoiceExportLabels } from '../invoice-export-labels'
import { writeInvoiceExportWorkbook } from '../invoice-export-xlsx'

const TICKET_KIND = 'invoice-export' as const
const EXPORT_CHUNK_SIZE = 1000
/** Invoices per valued-lines query, as binvoice_export_xls.php (array_chunk of 400). */
const WO_LINES_STATEMENTS_PER_QUERY = 400

/**
 * File name of the download (D12): the File Name typed in the dialog, keeping only letters,
 * digits, space, `_`, `-` and `.`, with `.xlsx` added; empty → the legacy default.
 */
export function invoiceExportFilename(exportType: InvoiceExportType, fileName?: string): string {
  const clean = (fileName ?? '').replace(/[^A-Za-z0-9 _.-]+/g, '').trim()
  if (!clean) return exportType === 1 ? 'report_invoice.xlsx' : 'report_invoice_wo_details.xlsx'
  return /\.xlsx$/i.test(clean) ? clean : `${clean}.xlsx`
}

function yesNo(labels: InvoiceExportLabels, value: boolean): string {
  return value ? labels.yes : labels.no
}

function orAll(labels: InvoiceExportLabels, values: readonly string[] | string | undefined): string {
  if (Array.isArray(values)) return values.length ? values.join(', ') : labels.all
  const v = typeof values === 'string' ? values.trim() : ''
  return v || labels.all
}

/** Report Info rows (plans/plan-export-invoices-nest §1.6): the filters the query received. */
export function buildInvoiceExportReportInfo(input: {
  labels: InvoiceExportLabels
  exportType: InvoiceExportType
  generatedAt: Date
  generatedBy: string
  query: InvoiceListQueryDto
  filter: InvoiceListFilter
  names: { dealers: string[]; departments: string[]; services: string[]; authors: string[]; workers: string[] }
  /** Removed dealers with rows in this export (exportRemovedDealers), by name. */
  removedDealers?: string[]
}): ReportInfoRow[] {
  const { labels, query, filter, names } = input
  const typeTokens = (query.types ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t): t is 'wo' | 'ttk' | 'generic' => t === 'wo' || t === 'ttk' || t === 'generic')
  const uniqueTypes = [...new Set(typeTokens)]
  const typesValue =
    uniqueTypes.length === 0 || uniqueTypes.length === 3
      ? labels.all
      : uniqueTypes.map((t) => labels.typeNames[t]).join(', ')
  const payment =
    filter.payed === '1'
      ? labels.paymentValues.paid
      : filter.payed === '0'
        ? labels.paymentValues.unpaid
        : labels.paymentValues.all
  const sent =
    filter.sended === '1'
      ? labels.sentValues.sent
      : filter.sended === '0'
        ? labels.sentValues.notSent
        : labels.sentValues.all
  return [
    { field: labels.report, value: invoiceExportReportName(input.exportType) },
    { field: labels.generated, value: formatNyStamp(input.generatedAt) },
    { field: labels.generatedBy, value: input.generatedBy },
    { field: labels.screen, value: labels.screenValue },
    { field: labels.dealers, value: orAll(labels, names.dealers) },
    { field: labels.dateFrom, value: ymdToUs(filter.fechaDesde) },
    { field: labels.dateTo, value: ymdToUs(filter.fechaHasta) },
    { field: labels.ignorePeriod, value: yesNo(labels, filter.ignorePeriod) },
    { field: labels.invoiceTypes, value: typesValue },
    { field: labels.invoiceNumber, value: orAll(labels, filter.search) },
    { field: labels.exactMatch, value: yesNo(labels, filter.exactMatch) },
    { field: labels.employeeWorked, value: orAll(labels, names.workers) },
    { field: labels.payment, value: payment },
    { field: labels.sent, value: sent },
    { field: labels.hideZero, value: yesNo(labels, !filter.includeZero) },
    { field: labels.deleted, value: labels.deletedValues[filter.deleted] },
    { field: labels.wo, value: orAll(labels, filter.woNumbers) },
    { field: labels.poRo, value: orAll(labels, filter.roPo) },
    { field: labels.vinStock, value: orAll(labels, filter.stock) },
    { field: labels.department, value: orAll(labels, names.departments) },
    { field: labels.service, value: orAll(labels, names.services) },
    { field: labels.createdBy, value: orAll(labels, names.authors) },
    { field: labels.notCreatedBy, value: yesNo(labels, filter.authorsExclude) },
    { field: labels.createdBySystem, value: yesNo(labels, filter.createdBySystem) },
    { field: labels.checkDate, value: filter.checkDate ? ymdToUs(filter.checkDate) : labels.all },
    { field: labels.checkNumber, value: orAll(labels, filter.checkNumber) },
    { field: labels.overdueOnly, value: yesNo(labels, filter.dueOn) },
    // «Include removed dealers»: only when it is on (and honoured: admins only, see the filter),
    // with the removed dealers that have rows in the file (§5, M2).
    ...(filter.includeRemovedDealers
      ? [
          {
            field: labels.includeRemovedDealers,
            value: input.removedDealers?.length
              ? `${labels.yes} — ${input.removedDealers.join(', ')}`
              : labels.yes,
          },
        ]
      : []),
  ]
}

/**
 * Export of Billing → Invoices (plans/plan-export-invoices-nest, "Export" action): every row of
 * the list with the grid's filters, without selecting anything, as XLSX with Report Info. Same
 * ticket + semaphore flow as Punch Report: `prepare` takes the slot, the download releases it.
 */
@Injectable()
export class InvoiceExportService {
  constructor(
    @Inject(InvoiceRepository) private readonly repository: InvoiceRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
    @Inject(PunchExportSemaphore) private readonly semaphore: PunchExportSemaphore,
    @Inject(PunchExportTicketStore) private readonly tickets: PunchExportTicketStore,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** "Invoices > Modulde Access" (15) like the list, plus "Invoices > Print Invoice" (19, D23). */
  private async assertAccess(ctx: SrsContext): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICES_MODULE_ACCESS)
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_INVOICE_PRINT)
  }

  private filterOf(ctx: SrsContext, query: InvoiceListQueryDto): InvoiceListFilter {
    const filter = buildInvoiceListFilter(ctx, query)
    if (filter.dealerIds.length === 0) {
      throw new BadRequestException('Select at least one dealer to list invoices')
    }
    return filter
  }

  async prepare(
    ctx: SrsContext,
    query: InvoiceListQueryDto,
    body: InvoiceExportPrepareBodyDto,
    isCompanyTypeCompany: boolean,
  ): Promise<InvoiceExportPrepareResponseDto> {
    await this.assertAccess(ctx)
    this.filterOf(ctx, query)
    if (!this.semaphore.tryAcquire()) {
      throw new HttpException(
        'An export is already running. Try again when it finishes.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    try {
      const stored: InvoiceExportStoredFilters = {
        query,
        exportType: body.exportType,
        fileName: body.fileName,
        isCompanyTypeCompany,
      }
      return this.tickets.createPending(
        ctx.idUsuario,
        stored,
        () => this.semaphore.release(),
        TICKET_KIND,
      )
    } catch (e) {
      this.semaphore.release()
      throw e
    }
  }

  getStatus(ctx: SrsContext, ticket: string): InvoiceExportStatusDto {
    // Only this service writes `result` on invoice tickets, always an InvoiceExportMailResult.
    return this.tickets.getStatus(ticket, ctx.idUsuario, TICKET_KIND) as InvoiceExportStatusDto
  }

  async streamToResponse(ctx: SrsContext, ticketId: string, res: Response): Promise<void> {
    const ticket = this.tickets.consumeForDownload(ticketId, ctx.idUsuario, TICKET_KIND)
    const stored = ticket.filters as InvoiceExportStoredFilters

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
      const reportInfo = buildInvoiceExportReportInfo({
        labels: invoiceExportLabels(locale),
        exportType: stored.exportType,
        generatedAt,
        generatedBy,
        query: stored.query,
        filter,
        names,
        removedDealers: removed.map((d) => d.dealer),
      })

      // Headers and Report Info go out before the heavy query (§2.1.4, F3).
      res.setHeader('Content-Type', XLSX_MIME)
      res.setHeader(
        'Content-Disposition',
        contentDispositionAttachment(invoiceExportFilename(stored.exportType, stored.fileName)),
      )
      res.flushHeaders()
      headersSent = true

      await writeInvoiceExportWorkbook({
        stream: res as unknown as Writable,
        locale,
        exportType: stored.exportType,
        generatedAt,
        reportInfo,
        isCompanyTypeCompany: stored.isCompanyTypeCompany,
        providerName: names.providerName,
        includeAuthor: filter.authorIds.length > 0 || filter.idAuthor != null,
        includeDeleted: filter.deleted !== 'hide',
        removedDealerIds: new Set(removed.map((d) => d.dealerId)),
        chunks: this.repository.exportRowChunks(filter, EXPORT_CHUNK_SIZE),
        woLinesOf: (ids) => this.woLinesOf(filter, ids),
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

  /* -------------------------------------------------------------------------------------------- */
  /* Send Email / Create File to Email (§8.7, D33): Nest builds the .xlsx with the SAME function   */
  /* and filters as the download, and hands it to the PHP, which stores it, builds the queue and  */
  /* sends. The request answers at once with a ticket; the job keeps going in the background.     */
  /* -------------------------------------------------------------------------------------------- */

  async startMail(
    ctx: SrsContext,
    query: InvoiceListQueryDto,
    body: InvoiceExportMailBodyDto,
    action: 'email' | 'queue',
    isCompanyTypeCompany: boolean,
    phpToken: string,
  ): Promise<{ ticket: string }> {
    await this.assertAccess(ctx)
    this.filterOf(ctx, query)
    const emails = parseInvoiceExportEmails(body.emailTo)
    if (!emails) {
      throw new BadRequestException('Enter one or more valid email addresses.')
    }
    const baseUrl = this.config.get<string>('srsApiUrl')?.trim()
    if (!baseUrl) {
      throw new HttpException('The email server is not configured (SRS_API_URL).', HttpStatus.INTERNAL_SERVER_ERROR)
    }
    if (!phpToken) {
      throw new BadRequestException('Missing session token.')
    }
    if (!this.semaphore.tryAcquire()) {
      throw new HttpException(
        'An export is already running. Try again when it finishes.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
    let ticket: string
    try {
      const stored: InvoiceExportStoredFilters = {
        query,
        exportType: body.exportType,
        fileName: body.fileName,
        isCompanyTypeCompany,
        mail: { ...body, emailTo: emails.join(','), action },
      }
      ticket = this.tickets.createRunning(ctx.idUsuario, stored, TICKET_KIND).ticket
    } catch (e) {
      this.semaphore.release()
      throw e
    }
    // The job owns the slot from here; it releases it when it ends, well or not.
    void this.runMailJob(ctx, ticket, baseUrl, phpToken)
    return { ticket }
  }

  private async runMailJob(ctx: SrsContext, ticketId: string, baseUrl: string, phpToken: string) {
    try {
      const stored = this.tickets.peek(ticketId)?.filters as InvoiceExportStoredFilters
      const mail = stored.mail!
      const filter = this.filterOf(ctx, stored.query)

      // 1. Size limits of the PHP, before building anything big (M3).
      const limits = await phpRequest<{ upload_max_bytes: number; post_max_bytes: number }>({
        baseUrl,
        token: phpToken,
        method: 'GET',
        timeoutMs: 30_000,
      })
      if (limits.status !== 'success' || !limits.data) {
        throw new Error(limits.message || 'The email server did not answer.')
      }

      // 2. The same workbook as the download, in memory.
      const generatedAt = new Date()
      const [locale, generatedBy, names, removed] = await Promise.all([
        resolveLocale(this.srs, ctx),
        loadUserName(this.srs, ctx.idUsuario),
        this.repository.exportFilterNames(filter),
        this.repository.exportRemovedDealers(filter),
      ])
      const reportInfo = buildInvoiceExportReportInfo({
        labels: invoiceExportLabels(locale),
        exportType: stored.exportType,
        generatedAt,
        generatedBy,
        query: stored.query,
        filter,
        names,
        removedDealers: removed.map((d) => d.dealer),
      })
      const ttkIds = new Set<number>()
      const source = this.repository.exportRowChunks(filter, EXPORT_CHUNK_SIZE)
      const chunks = (async function* () {
        for await (const chunk of source) {
          for (const row of chunk) if (row.statementType === 5) ttkIds.add(row.id)
          yield chunk
        }
      })()
      const sink = new PassThrough()
      const parts: Buffer[] = []
      sink.on('data', (c: Buffer) => parts.push(c))
      const ended = new Promise<void>((resolve, reject) => {
        sink.on('end', () => resolve())
        sink.on('error', reject)
      })
      await writeInvoiceExportWorkbook({
        stream: sink,
        locale,
        exportType: stored.exportType,
        generatedAt,
        reportInfo,
        isCompanyTypeCompany: stored.isCompanyTypeCompany,
        providerName: names.providerName,
        includeAuthor: filter.authorIds.length > 0 || filter.idAuthor != null,
        includeDeleted: filter.deleted !== 'hide',
        removedDealerIds: new Set(removed.map((d) => d.dealerId)),
        chunks,
        woLinesOf: (ids) => this.woLinesOf(filter, ids),
      })
      await ended
      const file = Buffer.concat(parts)

      // 3. The body, its size, and the checksum the PHP verifies (§8.7 «Mismos bytes»).
      const { body, contentType } = buildMultipart(
        [
          { name: 'action', value: mail.action },
          { name: 'export_type', value: String(stored.exportType) },
          { name: 'file_name', value: (mail.fileName ?? '').trim() },
          { name: 'emailto', value: mail.emailTo },
          { name: 'subject', value: mail.subject ?? '' },
          { name: 'message', value: mail.message ?? '' },
          { name: 'replyto', value: (mail.replyTo ?? '').trim() },
          { name: 'queuename', value: (mail.queueName ?? '').trim() },
          { name: 'attach_time_card', value: mail.attachTimeCard ? '1' : '0' },
          { name: 'ids_statement_ttk', value: [...ttkIds].join(',') },
          { name: 'sha256', value: createHash('sha256').update(file).digest('hex') },
        ],
        {
          name: 'file',
          filename: invoiceExportFilename(stored.exportType, mail.fileName),
          contentType: XLSX_MIME,
          content: file,
        },
      )
      const tooBig =
        (limits.data.upload_max_bytes > 0 && file.length > limits.data.upload_max_bytes) ||
        (limits.data.post_max_bytes > 0 && body.length > limits.data.post_max_bytes)
      if (tooBig) {
        throw new Error(
          `The file is too big to send by email (${(file.length / 1048576).toFixed(1)} MB). Use Export to download it.`,
        )
      }

      // 4. The PHP stores the file, builds the queue and, for Send Email, sends (§8.7).
      const res = await phpRequest<{
        id_queue: number
        descripcion: string
        time_card: boolean
        sent: boolean
      }>({ baseUrl, token: phpToken, method: 'POST', body, contentType })
      if (res.status !== 'success' || !res.data) {
        throw new Error(res.message || 'The email could not be processed.')
      }
      const result: InvoiceExportMailResult = {
        idQueue: Number(res.data.id_queue),
        descripcion: String(res.data.descripcion ?? ''),
        timeCard: Boolean(res.data.time_card),
        sent: Boolean(res.data.sent),
      }
      this.tickets.markDone(ticketId, result)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'The email could not be processed.'
      this.tickets.markError(ticketId, message, isPoolBusyError(e) ? DB_POOL_BUSY : undefined)
    } finally {
      this.semaphore.release()
    }
  }

  /** Valued WO lines of these invoices, 400 per query (§8.6, tipo 2). */
  private async woLinesOf(filter: InvoiceListFilter, statementIds: number[]) {
    const lines = []
    for (let i = 0; i < statementIds.length; i += WO_LINES_STATEMENTS_PER_QUERY) {
      lines.push(
        ...(await this.repository.exportWoValuedLines(
          filter,
          statementIds.slice(i, i + WO_LINES_STATEMENTS_PER_QUERY),
        )),
      )
    }
    return lines
  }
}
