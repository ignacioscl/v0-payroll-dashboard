import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type { Response } from 'express'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_REPORT_OPEN_INVOICES, SrsPermissionRepository } from '../../auth/srs-permission.repository'
import { ContratistaService } from '../../../features/srs-contratista/service/contratista.service'
import { buildSrsKpiFilterNoPeriod } from '../../shared/kpi/srs-kpi-filter'
import { countRequestedDealersInScope } from '../../shared/kpi/srs-kpi-dealer-scope'
import { removedDealersProvider } from '../../shared/kpi/srs-kpi-dealer-filter'
import { PayrollSnapshotKpiRepository } from '../../payroll/repository/payroll-snapshot-kpi.repository'
import {
  buildNyStampedExportFilename,
  contentDispositionAttachment,
  XLSX_MIME,
} from '../../punch/punch-export-format'
import { loadUserName, resolveLocale } from '../../punch/punch-export-lookups'
import { OpenInvoiceSnapshotService } from '../../../features/open-invoice-snapshot/service/open-invoice-snapshot.service'
import type { OpenInvoiceSnapshotRow } from '../../../features/open-invoice-snapshot/dto/open-invoice-snapshot.dto'
import {
  OPEN_INVOICES_AS_OF_ERROR,
  OpenInvoicesDto,
  OpenInvoicesQueryDto,
  isValidOpenInvoicesAsOf,
} from '../dto/open-invoices.dto'
import {
  buildOpenInvoiceRows,
  openInvoicesToday,
  sortOpenInvoiceRows,
  summarizeOpenInvoices,
  type OpenInvoiceRow,
  type OpenInvoiceSummaryRow,
  type OpenInvoiceTotals,
} from '../open-invoice-aging'
import { openInvoicesExportLabels, type OpenInvoicesExportLabels } from '../open-invoices-export-labels'
import { buildOpenInvoicesReportInfo, buildOpenInvoicesWorkbook } from '../open-invoices-export'
import { OpenInvoicesRepository, type OpenInvoicesFilter } from '../repository/open-invoices.repository'

/** What one run of the report gives: the invoice rows, the summary and the names. */
export type OpenInvoicesRun = {
  rows: OpenInvoiceRow[]
  summary: { rows: OpenInvoiceSummaryRow[]; totals: OpenInvoiceTotals }
  names: Map<number, string>
  removedIds: Set<number>
}

/** The snapshot row of an invoice row (§3.6, `rows_json`). */
export function toSnapshotRow(r: OpenInvoiceRow): OpenInvoiceSnapshotRow {
  return {
    sid: r.sid,
    fullNro: r.fullNro,
    dealerId: r.dealerId,
    statementType: r.statementType,
    createdYmd: r.createdYmd,
    dateToYmd: r.dateToYmd,
    department: r.department,
    departmentKey: r.departmentKey,
    days: r.days,
    termDays: r.termDays,
    bucket: r.bucket,
    amount: r.amount,
  }
}

/**
 * Reports › Open Invoices (T4 of plans/plan-reporte-javier/PLAN.md): the screen and its Excel. Permission
 * «Report Pro > Open Invoices» (153, migration 033) and the company's «Closing reports» module (D17 of
 * plans/plan-reunion-juan-18-11); Admin General and Admin Company pass the permission, not the module. The provider
 * always comes from the session.
 */
@Injectable()
export class OpenInvoicesService {
  constructor(
    @Inject(OpenInvoicesRepository) private readonly repository: OpenInvoicesRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
    @Inject(PayrollSnapshotKpiRepository) private readonly payroll: PayrollSnapshotKpiRepository,
    @Inject(OpenInvoiceSnapshotService) private readonly snapshots: OpenInvoiceSnapshotService,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
    @Inject(ContratistaService) private readonly contratistas: ContratistaService,
  ) {}

  /**
   * Permission and company module: what every endpoint of the report checks first (the screen, the Excel, the
   * snapshots and their comparison, through OpenInvoicesCompareService).
   */
  async assertAccess(ctx: SrsContext): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_REPORT_OPEN_INVOICES)
    await this.contratistas.assertCompanyModule(ctx, 'closingReports')
  }

  async labels(ctx: SrsContext): Promise<OpenInvoicesExportLabels> {
    return openInvoicesExportLabels(await resolveLocale(this.srs, ctx))
  }

  private async prepare(ctx: SrsContext, query: OpenInvoicesQueryDto): Promise<OpenInvoicesFilter> {
    await this.assertAccess(ctx)
    if (!isValidOpenInvoicesAsOf(query.asOf)) {
      throw new BadRequestException({ message: OPEN_INVOICES_AS_OF_ERROR, field: 'asOf' })
    }
    const f = buildSrsKpiFilterNoPeriod(ctx, {
      idDealer: query.idDealer,
      includeRemovedDealers: query.includeRemovedDealers,
    })
    return {
      idDealerProvider: f.idDealerProvider,
      idUsuario: f.idUsuario,
      dealerIds: [...new Set(f.dealerIds)],
      skipDealerRestriction: f.skipDealerRestriction,
      includeRemovedDealers: f.includeRemovedDealers,
      asOf: query.asOf,
    }
  }

  /**
   * One run of the report: the rows of the engine with their days, term, column and department, the
   * summary dealer × department and the dealer names (§3, T2/T3). `todayYmd` is the day in New York of the
   * instant the balance is taken («Generated»).
   */
  async run(f: OpenInvoicesFilter, todayYmd: string, labels: OpenInvoicesExportLabels): Promise<OpenInvoicesRun> {
    const sqlRows = await this.repository.openRows(f)
    const dealerIds = [...new Set(sqlRows.map((r) => r.dealerId))]
    const removedOf = removedDealersProvider(f)
    const [terms, names, removed] = await Promise.all([
      this.repository.dueOnByDealer(f.idDealerProvider, dealerIds),
      this.repository.dealerNames(f.idDealerProvider, dealerIds),
      removedOf != null ? this.repository.removedDealersOfProvider(removedOf) : Promise.resolve([]),
    ])
    const name = (id: number) => names.get(id) ?? String(id)
    const rows = sortOpenInvoiceRows(buildOpenInvoiceRows(sqlRows, terms, todayYmd, labels), name)
    return {
      rows,
      summary: summarizeOpenInvoices(rows, name),
      names,
      removedIds: new Set(removed.map((d) => d.dealerId)),
    }
  }

  async getReport(ctx: SrsContext, query: OpenInvoicesQueryDto): Promise<OpenInvoicesDto> {
    const f = await this.prepare(ctx, query)
    const generatedAt = new Date()
    const result = await this.run(f, openInvoicesToday(generatedAt), await this.labels(ctx))
    return {
      asOf: f.asOf,
      generatedAt: generatedAt.toISOString(),
      rows: result.summary.rows.map((r) => ({
        ...r,
        dealer: result.names.get(r.dealerId) ?? String(r.dealerId),
        removed: result.removedIds.has(r.dealerId),
      })),
      totals: result.summary.totals,
    }
  }

  /**
   * The Excel (T5): Report Info, Summary and Invoices. Before the file is written, the snapshot of what
   * it shows is saved (T6, §3.6): its number goes to Report Info. If the snapshot cannot be saved, the
   * export fails: no snapshot, no Excel.
   */
  async export(ctx: SrsContext, query: OpenInvoicesQueryDto, res: Response): Promise<void> {
    const f = await this.prepare(ctx, query)
    // Report Info names the dealers with GET_DEALER_NAME_BY_PROVIDER, which does not look at the scope: like
    // Production vs Goal and Monthly Closing, every requested dealer is of the company and seen by the user.
    if ((await countRequestedDealersInScope(this.srs, f)) !== f.dealerIds.length) {
      throw new ForbiddenException('One or more dealers are outside your scope.')
    }
    const generatedAt = new Date()
    const [labels, generatedBy, activeDealers] = await Promise.all([
      this.labels(ctx),
      loadUserName(this.srs, ctx.idUsuario),
      this.payroll.activeDealerIds(ctx.idDealerProvider),
    ])
    const result = await this.run(f, openInvoicesToday(generatedAt), labels)
    const payments = await this.repository.activeBillingIdsBySid(
      f.idDealerProvider,
      result.rows.map((r) => r.sid),
    )
    const allDealers = activeDealers.length > 0 && activeDealers.every((id) => f.dealerIds.includes(id))
    const snapshotId = await this.snapshots.save({
      idDealerProvider: f.idDealerProvider,
      idUsuario: ctx.idUsuario,
      generatedAt,
      asOf: f.asOf,
      dealerIds: allDealers ? null : f.dealerIds,
      includeRemoved: removedDealersProvider(f) != null,
      engineDealerIds: f.dealerIds,
      rows: result.rows.map(toSnapshotRow),
      payments: Object.fromEntries([...payments.entries()].map(([sid, ids]) => [String(sid), ids])),
    })

    const filterNames = allDealers ? null : (await this.repository.dealerNames(f.idDealerProvider, f.dealerIds))
    const rowDealerIds = new Set(result.rows.map((r) => r.dealerId))
    const dealerLabel = (id: number) => {
      const n = result.names.get(id) ?? String(id)
      return result.removedIds.has(id) ? `${n} ${labels.removedSuffix}` : n
    }
    const workbook = buildOpenInvoicesWorkbook({
      labels,
      generatedAt,
      reportInfo: buildOpenInvoicesReportInfo({
        labels,
        generatedAt,
        generatedBy,
        asOf: f.asOf,
        snapshotId,
        dealerNames: filterNames == null ? null : f.dealerIds.map((id) => filterNames.get(id) ?? String(id)),
        includeRemovedDealers: removedDealersProvider(f) != null,
        removedDealersWithRows: [...result.removedIds]
          .filter((id) => rowDealerIds.has(id))
          .map((id) => result.names.get(id) ?? String(id)),
      }),
      summary: result.summary,
      invoices: result.rows,
      dealerLabel,
    })
    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader(
      'Content-Disposition',
      contentDispositionAttachment(buildNyStampedExportFilename('open_invoices', generatedAt)),
    )
    await workbook.xlsx.write(res)
  }
}
