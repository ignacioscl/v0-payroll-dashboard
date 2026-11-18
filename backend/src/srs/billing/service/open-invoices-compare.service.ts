import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type { Response } from 'express'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsContext } from '../../auth/srs-auth-context.service'
import { skipDealerRestrictionForRol } from '../../shared/kpi/srs-kpi-dealer-filter'
import {
  buildNyStampedExportFilename,
  contentDispositionAttachment,
  XLSX_MIME,
  ymdToUs,
} from '../../punch/punch-export-format'
import { loadUserName } from '../../punch/punch-export-lookups'
import { OpenInvoiceSnapshotService } from '../../../features/open-invoice-snapshot/service/open-invoice-snapshot.service'
import type {
  OpenInvoiceSnapshotFull,
  OpenInvoiceSnapshotHeader,
} from '../../../features/open-invoice-snapshot/dto/open-invoice-snapshot.dto'
import {
  OpenInvoiceCompareDto,
  OpenInvoiceSnapshotHeaderDto,
  OpenInvoiceSnapshotPageDto,
  OpenInvoiceSnapshotsQueryDto,
} from '../dto/open-invoices.dto'
import { openInvoicesToday } from '../open-invoice-aging'
import { compareReasons, compareRows } from '../open-invoice-compare'
import type { OpenInvoicesExportLabels } from '../open-invoices-export-labels'
import { buildOpenInvoicesCompareWorkbook, openInvoicesDealersValue } from '../open-invoices-export'
import { OpenInvoicesCompareRepository } from '../repository/open-invoices-compare.repository'
import { OpenInvoicesRepository } from '../repository/open-invoices.repository'
import { OpenInvoicesService, toSnapshotRow } from './open-invoices.service'

const DEFAULT_PAGE_SIZE = 25

/** `YYYY-MM-DD HH:MM:SS` UTC → ISO instant. */
function utcToIso(utc: string): string {
  return `${utc.slice(0, 19).replace(' ', 'T')}Z`
}

/** The snapshot as one user sees it: only the dealers they see (§3.6, step 3). */
type VisibleSnapshot = {
  header: OpenInvoiceSnapshotHeader
  /** Dealers of the snapshot's universe that the user sees. */
  dealers: number[]
  total: number
  rowCount: number
}

/**
 * Snapshots of Reports › Open Invoices and their comparison with today (T7 of
 * plans/plan-reporte-javier/PLAN.md, §1.5 and §3.6). Same permission as the report (123). A user with
 * assigned dealers only sees, in the list, the comparison and its Excel, the dealers they see: totals, row
 * counts and dealers of the filter are recalculated on them, and a snapshot with none of them is a 404.
 */
@Injectable()
export class OpenInvoicesCompareService {
  constructor(
    @Inject(OpenInvoicesService) private readonly report: OpenInvoicesService,
    @Inject(OpenInvoicesRepository) private readonly repository: OpenInvoicesRepository,
    @Inject(OpenInvoicesCompareRepository) private readonly compareRepository: OpenInvoicesCompareRepository,
    @Inject(OpenInvoiceSnapshotService) private readonly snapshots: OpenInvoiceSnapshotService,
    @InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource,
  ) {}

  /**
   * The dealers of the list that the user sees, in one query per request: Admin General and Admin Company
   * see them all; anyone else, the ones that pass RESTRICTION_DEALER_V2 (§3.6, step 3).
   */
  async visibleSnapshotDealers(ctx: SrsContext, dealerIds: readonly number[]): Promise<Set<number>> {
    if (skipDealerRestrictionForRol(ctx.idRol)) return new Set(dealerIds)
    return new Set(await this.compareRepository.dealersVisibleToUser(ctx.idUsuario, dealerIds))
  }

  private visible(header: OpenInvoiceSnapshotHeader, seen: Set<number>): VisibleSnapshot | null {
    const dealers = Object.keys(header.dealerTotals)
      .map(Number)
      .filter((id) => seen.has(id))
    if (dealers.length === 0) return null
    let cents = 0
    let rowCount = 0
    for (const id of dealers) {
      const t = header.dealerTotals[String(id)]
      cents += Math.round(Number(t?.total ?? 0) * 100)
      rowCount += Number(t?.rows ?? 0)
    }
    return { header, dealers, total: cents / 100, rowCount }
  }

  /** «All» when the snapshot was All; else the names of its filter that the user sees. */
  private dealersLabel(
    labels: OpenInvoicesExportLabels,
    v: VisibleSnapshot,
    names: Map<number, string>,
  ): string {
    if (v.header.dealerIds == null) return labels.all
    // v.dealers = the snapshot's universe for Admin General / Admin Company, their dealers for anyone else.
    const seen = new Set(v.dealers)
    const mine = v.header.dealerIds.filter((id) => seen.has(id))
    return openInvoicesDealersValue(labels, mine.map((id) => names.get(id) ?? String(id)))
  }

  private async userNames(ids: readonly number[]): Promise<Map<number, string>> {
    const out = new Map<number, string>()
    for (const id of [...new Set(ids)]) out.set(id, await loadUserName(this.srs, id))
    return out
  }

  private async toHeaderDtos(
    ctx: SrsContext,
    labels: OpenInvoicesExportLabels,
    list: VisibleSnapshot[],
  ): Promise<OpenInvoiceSnapshotHeaderDto[]> {
    const filterIds = list.flatMap((v) => v.header.dealerIds ?? [])
    const [names, users] = await Promise.all([
      this.repository.dealerNames(ctx.idDealerProvider, filterIds),
      this.userNames(list.map((v) => v.header.idUsuario)),
    ])
    const out: OpenInvoiceSnapshotHeaderDto[] = []
    for (const v of list) {
      out.push({
        id: v.header.id,
        generatedAt: utcToIso(v.header.generatedAt),
        generatedBy: users.get(v.header.idUsuario) ?? String(v.header.idUsuario),
        asOf: v.header.asOf,
        dealers: this.dealersLabel(labels, v, names),
        includeRemovedDealers: v.header.includeRemoved,
        total: v.total,
        rowCount: v.rowCount,
      })
    }
    return out
  }

  /** The list of snapshots, newest first (§1.5), cut to the dealers of the user. */
  async list(ctx: SrsContext, query: OpenInvoiceSnapshotsQueryDto): Promise<OpenInvoiceSnapshotPageDto> {
    await this.report.assertAccess(ctx)
    const labels = await this.report.labels(ctx)
    const page = query.page ?? 1
    const pageSize = query.page_size ?? DEFAULT_PAGE_SIZE
    let pageItems: VisibleSnapshot[]
    let total: number
    if (skipDealerRestrictionForRol(ctx.idRol)) {
      const res = await this.snapshots.listByProvider(ctx.idDealerProvider, page, pageSize)
      pageItems = res.rows.map((h) => this.visible(h, new Set(Object.keys(h.dealerTotals).map(Number)))!).filter(Boolean)
      total = res.total
    } else {
      // Filtered in the service: every header of the company (without rows), then paged.
      const headers = await this.snapshots.listHeadersByProvider(ctx.idDealerProvider)
      const universe = [...new Set(headers.flatMap((h) => Object.keys(h.dealerTotals).map(Number)))]
      const seen = await this.visibleSnapshotDealers(ctx, universe)
      const mine = headers.map((h) => this.visible(h, seen)).filter((v): v is VisibleSnapshot => v != null)
      total = mine.length
      pageItems = mine.slice((page - 1) * pageSize, page * pageSize)
    }
    return {
      results: await this.toHeaderDtos(ctx, labels, pageItems),
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total,
    }
  }

  /** The snapshot of this company that the user can see, cut to their dealers; 404 otherwise. */
  private async loadVisible(ctx: SrsContext, id: number): Promise<{ full: OpenInvoiceSnapshotFull; v: VisibleSnapshot }> {
    const full = Number.isInteger(id) && id > 0 ? await this.snapshots.findOneByProvider(id, ctx.idDealerProvider) : null
    if (!full) throw new NotFoundException('Snapshot not found')
    const universe = Object.keys(full.dealerTotals).map(Number)
    const v = this.visible(full, await this.visibleSnapshotDealers(ctx, universe))
    if (!v) throw new NotFoundException('Snapshot not found')
    return { full, v }
  }

  /**
   * The comparison (§3.6): the report run today with the As of, dealers and switch of the snapshot (only
   * the dealers the user sees), compared invoice by invoice; the reasons of each change.
   */
  async compare(ctx: SrsContext, id: number): Promise<OpenInvoiceCompareDto & { labels: OpenInvoicesExportLabels }> {
    await this.report.assertAccess(ctx)
    const { full, v } = await this.loadVisible(ctx, id)
    const labels = await this.report.labels(ctx)
    const seen = new Set(v.dealers)
    const snapshotRows = full.rows.filter((r) => seen.has(r.dealerId))
    const comparedAt = new Date()
    const skip = skipDealerRestrictionForRol(ctx.idRol)
    // Today runs on the dealers of the snapshot only (its universe ∩ the user's), never on every dealer removed today:
    // the removed dealers that were in the snapshot already come by id (CODE-review 1). The switch is not turned on
    // here: it would add, with its OR, removed dealers that were not in the snapshot.
    const [today, removedNow] = await Promise.all([
      this.report.run(
        {
          idDealerProvider: ctx.idDealerProvider,
          idUsuario: ctx.idUsuario,
          dealerIds: v.dealers,
          skipDealerRestriction: skip,
          includeRemovedDealers: false,
          asOf: full.asOf,
        },
        openInvoicesToday(comparedAt),
        labels,
      ),
      skip && full.includeRemoved ? this.repository.removedDealersOfProvider(ctx.idDealerProvider) : Promise.resolve([]),
    ])
    const removedIds = new Set(removedNow.map((d) => d.dealerId))
    const todayRows = today.rows.filter((r) => seen.has(r.dealerId)).map(toSnapshotRow)
    const changed = compareRows(snapshotRows, todayRows)
    const facts = await this.compareRepository.factsBySid(ctx.idDealerProvider, changed.map((c) => c.sid))
    const names = new Map(today.names)
    const missing = changed.map((c) => c.dealerId).filter((d) => !names.has(d))
    if (missing.length) for (const [k, n] of await this.repository.dealerNames(ctx.idDealerProvider, missing)) names.set(k, n)
    const [header] = await this.toHeaderDtos(ctx, labels, [v])

    const rows = changed
      .map((c) => ({
        sid: c.sid,
        dealerId: c.dealerId,
        dealer: names.get(c.dealerId) ?? String(c.dealerId),
        removed: removedIds.has(c.dealerId),
        invoice: c.fullNro,
        department: c.department,
        snapshot: c.snapshot,
        today: c.today,
        difference: c.differenceCents / 100,
        why: compareReasons(c, facts.get(c.sid), full.payments[String(c.sid)], full.generatedAt, labels.reasons, ymdToUs),
      }))
      .sort((a, b) => a.dealer.localeCompare(b.dealer) || a.invoice.localeCompare(b.invoice, undefined, { numeric: true }))
    const snapCents = snapshotRows.reduce((s, r) => s + Math.round(r.amount * 100), 0)
    const todayCents = todayRows.reduce((s, r) => s + Math.round(r.amount * 100), 0)
    return {
      snapshot: header,
      comparedAt: comparedAt.toISOString(),
      rows,
      totals: { snapshot: snapCents / 100, today: todayCents / 100, difference: (todayCents - snapCents) / 100 },
      labels,
    }
  }

  async compareExport(ctx: SrsContext, id: number, res: Response): Promise<void> {
    const result = await this.compare(ctx, id)
    const { labels } = result
    const comparedAt = new Date(result.comparedAt)
    const workbook = buildOpenInvoicesCompareWorkbook({
      labels,
      comparedAt,
      generatedBy: await loadUserName(this.srs, ctx.idUsuario),
      snapshot: {
        id: result.snapshot.id,
        generatedAt: new Date(result.snapshot.generatedAt),
        by: result.snapshot.generatedBy,
        asOf: result.snapshot.asOf,
        dealers: result.snapshot.dealers,
        includeRemovedDealers: result.snapshot.includeRemovedDealers,
      },
      rows: result.rows.map((r) => ({
        ...r,
        dealer: r.removed ? `${r.dealer} ${labels.removedSuffix}` : r.dealer,
      })),
      totals: result.totals,
    })
    res.setHeader('Content-Type', XLSX_MIME)
    res.setHeader(
      'Content-Disposition',
      contentDispositionAttachment(buildNyStampedExportFilename(`open_invoices_snapshot_${result.snapshot.id}`, comparedAt)),
    )
    await workbook.xlsx.write(res)
  }
}
