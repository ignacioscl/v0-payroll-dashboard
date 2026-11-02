import { Inject, Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import type { Response } from 'express'

import { fromCents, toCents } from 'src/features/srs-expense/rules/expense-rules'
import { ContratistaService } from 'src/features/srs-contratista/service/contratista.service'
import { SrsContext } from '../../auth/srs-auth-context.service'
import {
  ROL_ACCION_EXPENSES_ADD,
  ROL_ACCION_EXPENSES_APPROVE,
  ROL_ACCION_EXPENSES_EDIT,
  ROL_ACCION_EXPENSES_ON_BEHALF,
  SrsPermissionRepository,
} from '../../auth/srs-permission.repository'
import { parseDealerIds, removedDealersProvider } from '../../shared/kpi/srs-kpi-dealer-filter'
import { buildTableExportWorkbook, type TableExportColumn } from '../../shared/export/table-export-xlsx'
import type { ReportInfoRow } from '../../shared/export/report-info-sheet'
import {
  buildNyStampedExportFilename,
  contentDispositionAttachment,
  formatNyStamp,
  XLSX_MIME,
  ymdToUs,
} from '../../punch/punch-export-format'
import { loadUserName, resolveLocale } from '../../punch/punch-export-lookups'
import { ExpenseAnalyticsQueryDto, ExpenseEmployeesQueryDto, ExpenseListQueryDto } from '../dto/expense-list-query.dto'
import type { AnalyticsResponse, ExpenseListResponse, ExpenseSingleRow, ExpenseSummaryResponse, NamedRef } from '../dto/expense-row.dto'
import { dealerIdsInScope } from '../expense-dealer-scope'
import { ExpenseListFilter, buildExpenseListFilter, pageOf } from '../expense-list-filter'
import { ExpenseExportLabels, expenseExportLabels } from '../expense-export-labels'
import { ExpenseReportRepository } from '../repository/expense-report.repository'

/**
 * Expenses List (lista, tarjetas, export), Analytics y el combo de empleados. Permiso 111 (el que abre el menú
 * legacy) salvo `/employees`, que acepta cualquiera de los cuatro de Expenses.
 */
@Injectable()
export class ExpenseReportService {
  constructor(
    @Inject(ExpenseReportRepository) private readonly report: ExpenseReportRepository,
    @Inject(SrsPermissionRepository) private readonly permissions: SrsPermissionRepository,
    @Inject(ContratistaService) private readonly dealers: ContratistaService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async list(ctx: SrsContext, query: ExpenseListQueryDto): Promise<ExpenseListResponse> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const filter = buildExpenseListFilter(ctx, query)
    const { page, pageSize } = pageOf(query)
    const { rows, total } = await this.report.list(filter, page - 1, pageSize, query.sort ?? 'date', query.dir ?? 'desc')
    return { data: rows, total, page, pageSize }
  }

  async summary(ctx: SrsContext, query: ExpenseListQueryDto): Promise<ExpenseSummaryResponse> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    return this.report.summary(buildExpenseListFilter(ctx, query))
  }

  async analytics(ctx: SrsContext, query: ExpenseAnalyticsQueryDto): Promise<AnalyticsResponse> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    return this.report.amountsBy(buildExpenseListFilter(ctx, query), query.groupBy)
  }

  /** Combo «Assign to employee» (con dealers) y filtros Assigned to / Created by (sin dealers). */
  async employees(ctx: SrsContext, query: ExpenseEmployeesQueryDto): Promise<{ results: NamedRef[] }> {
    const allowed = [
      ROL_ACCION_EXPENSES_ADD,
      ROL_ACCION_EXPENSES_APPROVE,
      ROL_ACCION_EXPENSES_ON_BEHALF,
      ROL_ACCION_EXPENSES_EDIT,
    ]
    let ok = false
    for (const id of allowed) {
      if (await this.permissions.userHasRolAccion(ctx, id)) {
        ok = true
        break
      }
    }
    if (!ok) await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const requested = [...new Set(parseDealerIds(query.idDealer))]
    let dealerIds: number[] = []
    if (requested.length) {
      dealerIds = [...(await dealerIdsInScope(this.dealers, this.report, ctx, requested))]
      if (!dealerIds.length) return { results: [] }
    }
    const results = await this.report.employees(ctx.idDealerProvider, (query.term ?? '').trim(), dealerIds)
    return { results }
  }

  /** Report Info común a la lista y Analytics: fecha y hora, usuario, pantalla y todos los filtros (con «All»). */
  private async reportInfo(
    ctx: SrsContext,
    filter: ExpenseListFilter,
    labels: ExpenseExportLabels,
    generatedAt: Date,
    reportName: string,
    screen: string,
    extra: ReportInfoRow[] = [],
    withListFilters = true,
  ): Promise<ReportInfoRow[]> {
    const [generatedBy, dealerNames, genericNames, userNames] = await Promise.all([
      loadUserName(this.db, ctx.idUsuario),
      this.report.dealerNames(ctx.idDealerProvider, filter.dealerIds),
      this.report.genericNames(ctx.idDealerProvider, [filter.idCompany ?? 0, filter.idCategory ?? 0]),
      this.report.userNames(ctx.idDealerProvider, [filter.idAuthor ?? 0, filter.idCreatedBy ?? 0]),
    ])
    const dealerList = filter.dealerIds.map((id) => dealerNames.get(id) ?? String(id)).join(', ')
    const rows: ReportInfoRow[] = [
      { field: labels.report, value: reportName },
      { field: labels.generated, value: formatNyStamp(generatedAt) },
      { field: labels.generatedBy, value: generatedBy },
      { field: labels.screen, value: screen },
      { field: labels.dates, value: `${ymdToUs(filter.from)} – ${ymdToUs(filter.to)}` },
      { field: labels.branch, value: dealerList },
      ...extra,
    ]
    if (withListFilters) {
      rows.push(
        { field: labels.company, value: filter.idCompany ? genericNames.get(filter.idCompany) ?? String(filter.idCompany) : labels.all },
        { field: labels.category, value: filter.idCategory ? genericNames.get(filter.idCategory) ?? String(filter.idCategory) : labels.all },
        { field: labels.assignedTo, value: filter.idAuthor ? userNames.get(filter.idAuthor) ?? String(filter.idAuthor) : labels.all },
        { field: labels.createdBy, value: filter.idCreatedBy ? userNames.get(filter.idCreatedBy) ?? String(filter.idCreatedBy) : labels.all },
      )
    }
    rows.push({ field: labels.status, value: filter.status ? labels.statusLabels[filter.status] : labels.all })
    if (withListFilters) {
      rows.push(
        { field: labels.amountFrom, value: filter.amountMin ? fromCents(toCents(filter.amountMin)) : labels.all },
        { field: labels.amountTo, value: filter.amountMax ? fromCents(toCents(filter.amountMax)) : labels.all },
        { field: labels.showDeleted, value: filter.deleted ? labels.yes : labels.no },
      )
    }
    return rows
  }

  private sendWorkbook(res: Response, prefix: string, generatedAt: Date, workbook: ReturnType<typeof buildTableExportWorkbook>) {
    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader('Content-Disposition', contentDispositionAttachment(buildNyStampedExportFilename(prefix, generatedAt)))
    return workbook.xlsx.write(res)
  }

  /** Expenses List › Export: una fila por EXP_EXPENSE con las columnas de la grilla (regla xls-export-report-info). */
  async exportList(ctx: SrsContext, query: ExpenseListQueryDto, res: Response): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const filter = buildExpenseListFilter(ctx, query)
    const generatedAt = new Date()
    const locale = await resolveLocale(this.db, ctx)
    const labels = expenseExportLabels(locale)
    const rows = (await this.report.exportRows(filter)).map((r) => r.row)
    const removedOf = removedDealersProvider(filter)
    const removed = removedOf != null ? await this.report.removedDealersOfProvider(removedOf) : []
    const removedIds = new Set(removed.map((d) => d.dealerId))
    const rowDealerIds = new Set(rows.map((r) => r.dealer.id))
    const extra: ReportInfoRow[] =
      removedOf != null
        ? [
            {
              field: labels.includeRemovedDealers,
              value: (() => {
                const names = removed.filter((d) => rowDealerIds.has(d.dealerId)).map((d) => d.dealer)
                return names.length ? `${labels.yes} — ${names.join(', ')}` : labels.yes
              })(),
            },
          ]
        : []
    const columns: TableExportColumn<ExpenseSingleRow>[] = [
      { header: labels.colDate, width: 12, kind: 'text', value: (r) => ymdToUs(r.ticketDate) },
      { header: labels.colCompany, width: 28, kind: 'text', value: (r) => r.company.name },
      { header: labels.colCategory, width: 22, kind: 'text', value: (r) => r.category.name },
      {
        header: labels.colBranch,
        width: 30,
        kind: 'text',
        value: (r) => (removedIds.has(r.dealer.id) ? `${r.dealer.name} ${labels.removedSuffix}` : r.dealer.name),
      },
      { header: labels.colAmount, width: 14, kind: 'money', value: (r) => Number(r.amount) },
      { header: labels.colAssignedTo, width: 24, kind: 'text', value: (r) => r.author.name },
      { header: labels.colCreatedBy, width: 24, kind: 'text', value: (r) => r.createdBy.name },
      {
        header: labels.colStatus,
        width: 18,
        kind: 'text',
        value: (r) => (r.deleted ? labels.deletedLabel : labels.statusLabels[r.status]),
      },
      { header: labels.colDescription, width: 32, kind: 'text', value: (r) => r.description },
      { header: labels.colReceipt, width: 16, kind: 'text', value: (r) => r.receiptNumber },
      { header: labels.colNotes, width: 40, kind: 'text', value: (r) => r.notes },
    ]
    const workbook = buildTableExportWorkbook({
      reportInfoSheet: labels.reportInfo,
      reportInfoHeader: { field: labels.field, value: labels.value },
      reportInfo: await this.reportInfo(ctx, filter, labels, generatedAt, labels.listReportName, labels.listScreen, extra),
      dataSheet: labels.listReportName,
      stamp: `${labels.generated} ${formatNyStamp(generatedAt)} · ${labels.listReportName}`,
      columns,
      rows,
    })
    await this.sendWorkbook(res, 'expenses', generatedAt, workbook)
  }

  /** Analytics › Export: la tabla de la solapa (Category / Company / Branch) con Report Info. */
  async exportAnalytics(ctx: SrsContext, query: ExpenseAnalyticsQueryDto, res: Response): Promise<void> {
    await this.permissions.assertRolAccion(ctx, ROL_ACCION_EXPENSES_APPROVE)
    const filter = buildExpenseListFilter(ctx, query)
    const generatedAt = new Date()
    const locale = await resolveLocale(this.db, ctx)
    const labels = expenseExportLabels(locale)
    const data = await this.report.amountsBy(filter, query.groupBy)
    const totalCents = toCents(data.total)
    const reportName = labels.analyticsReportName[query.groupBy]
    const removedOf = removedDealersProvider(filter)
    const extra: ReportInfoRow[] = [
      {
        field: labels.groupBy,
        value: query.groupBy === 'category' ? labels.category : query.groupBy === 'company' ? labels.company : labels.branch,
      },
    ]
    if (query.groupBy === 'dealer' && removedOf != null) {
      const names = data.rows.filter((r) => r.removed).map((r) => r.name)
      extra.push({
        field: labels.includeRemovedDealers,
        value: names.length ? `${labels.yes} — ${names.join(', ')}` : labels.yes,
      })
    }
    type Row = (typeof data.rows)[number]
    const columns: TableExportColumn<Row>[] = [
      {
        header: labels.colName,
        width: 34,
        kind: 'text',
        value: (r) => (r.removed ? `${r.name} ${labels.removedSuffix}` : r.name),
      },
      { header: labels.colExpenses, width: 12, kind: 'int', value: (r) => r.count },
      { header: labels.colTotal, width: 16, kind: 'money', value: (r) => Number(r.total) },
      {
        header: labels.colPctOfTotal,
        width: 12,
        kind: 'pct',
        value: (r) => (totalCents > 0 ? Math.round((toCents(r.total) * 1000) / totalCents) / 10 : null),
      },
      { header: labels.colPrevTotal, width: 16, kind: 'money', value: (r) => Number(r.prevTotal) },
      {
        header: labels.colVsPrev,
        width: 16,
        kind: 'money',
        value: (r) => Number(fromCents(toCents(r.total) - toCents(r.prevTotal))),
      },
    ]
    const workbook = buildTableExportWorkbook({
      reportInfoSheet: labels.reportInfo,
      reportInfoHeader: { field: labels.field, value: labels.value },
      reportInfo: await this.reportInfo(ctx, filter, labels, generatedAt, reportName, labels.analyticsScreen, extra, false),
      dataSheet: reportName,
      stamp: `${labels.generated} ${formatNyStamp(generatedAt)} · ${reportName}`,
      columns,
      rows: data.rows,
    })
    await this.sendWorkbook(res, `expenses_by_${query.groupBy}`, generatedAt, workbook)
  }
}
