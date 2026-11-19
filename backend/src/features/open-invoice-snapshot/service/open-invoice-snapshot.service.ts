import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from '../../../commons/service/global.base.service'
import {
  OpenInvoiceSnapshotDealerTotals,
  OpenInvoiceSnapshotFull,
  OpenInvoiceSnapshotHeader,
  OpenInvoiceSnapshotPayments,
  OpenInvoiceSnapshotQueryDto,
  OpenInvoiceSnapshotRow,
  OpenInvoiceSnapshotSave,
} from '../dto/open-invoice-snapshot.dto'
import { OpenInvoiceSnapshot } from '../entity/open-invoice-snapshot.entity'
import { OpenInvoiceSnapshotRepository } from '../repository/open-invoice-snapshot.repository'

const toCents = (n: number): number => Math.round(Number(n) * 100)

/** `YYYY-MM-DD HH:MM:SS` in UTC of an instant (the column is DATETIME in UTC). */
export function utcDbDateTime(at: Date): string {
  return at.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * `dealer_totals_json` (§3.6): every dealer the engine ran with, at 0, plus the rows on top (a removed
 * dealer with rows, with the switch on, is added while summing). A dealer picked with no balance goes
 * all the same, at 0: it is the universe of the snapshot.
 */
export function buildDealerTotals(
  engineDealerIds: readonly number[],
  rows: readonly Pick<OpenInvoiceSnapshotRow, 'dealerId' | 'amount'>[],
): OpenInvoiceSnapshotDealerTotals {
  const cents = new Map<number, { c: number; rows: number }>()
  for (const id of engineDealerIds) cents.set(id, { c: 0, rows: 0 })
  for (const r of rows) {
    const g = cents.get(r.dealerId) ?? { c: 0, rows: 0 }
    g.c += toCents(r.amount)
    g.rows += 1
    cents.set(r.dealerId, g)
  }
  const out: OpenInvoiceSnapshotDealerTotals = {}
  for (const [id, g] of [...cents.entries()].sort((a, b) => a[0] - b[0])) out[String(id)] = { total: g.c / 100, rows: g.rows }
  return out
}

function parseDealerIds(raw: string | null): number[] | null {
  if (raw == null || raw.trim() === '') return null
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
}

export function toSnapshotHeader(e: OpenInvoiceSnapshot): OpenInvoiceSnapshotHeader {
  return {
    id: Number(e.id),
    idDealerProvider: Number(e.idDealerProvider),
    idUsuario: Number(e.idUsuario),
    generatedAt: String(e.generatedAt),
    asOf: String(e.asOf).slice(0, 10),
    dealerIds: parseDealerIds(e.dealerIds),
    includeRemoved: Number(e.includeRemoved) === 1,
    total: Number(e.total),
    rowCount: Number(e.rowCount),
    dealerTotals: JSON.parse(e.dealerTotalsJson || '{}') as OpenInvoiceSnapshotDealerTotals,
  }
}

/**
 * The snapshots of Reports › Open Invoices (T6 of plans/plan-reporte-javier/PLAN.md). Saved only by the
 * Excel export, before the file is sent; never edited or deleted. Orchestrated by billing (no controller).
 */
@Injectable()
export class OpenInvoiceSnapshotService extends GlobalBaseService<OpenInvoiceSnapshot, OpenInvoiceSnapshotQueryDto> {
  constructor(@Inject(OpenInvoiceSnapshotRepository) private readonly repository: OpenInvoiceSnapshotRepository) {
    super()
  }

  protected getRepository(): OpenInvoiceSnapshotRepository {
    return this.repository
  }

  /** Saves what the export shows and returns the snapshot number. One row: no transaction needed. */
  async save(input: OpenInvoiceSnapshotSave): Promise<number> {
    const totalCents = input.rows.reduce((s, r) => s + toCents(r.amount), 0)
    const payments: OpenInvoiceSnapshotPayments = {}
    for (const r of input.rows) payments[String(r.sid)] = input.payments[String(r.sid)] ?? []
    return this.repository.insertOne({
      idDealerProvider: input.idDealerProvider,
      idUsuario: input.idUsuario,
      generatedAt: utcDbDateTime(input.generatedAt),
      asOf: input.asOf,
      dealerIds: input.dealerIds == null ? null : [...new Set(input.dealerIds)].join(','),
      includeRemoved: input.includeRemoved ? 1 : 0,
      total: (totalCents / 100).toFixed(2),
      rowCount: input.rows.length,
      rowsJson: JSON.stringify(input.rows),
      dealerTotalsJson: JSON.stringify(buildDealerTotals(input.engineDealerIds, input.rows)),
      paymentsJson: JSON.stringify(payments),
    })
  }

  async listByProvider(
    idDealerProvider: number,
    page: number,
    pageSize: number,
  ): Promise<{ rows: OpenInvoiceSnapshotHeader[]; total: number }> {
    const res = await this.repository.listByProvider(idDealerProvider, page, pageSize)
    return { rows: res.rows.map(toSnapshotHeader), total: res.total }
  }

  async listHeadersByProvider(idDealerProvider: number): Promise<OpenInvoiceSnapshotHeader[]> {
    return (await this.repository.listHeadersByProvider(idDealerProvider)).map(toSnapshotHeader)
  }

  /** A whole snapshot, only of this company; null when it does not exist or is of another one. */
  async findOneByProvider(id: number, idDealerProvider: number): Promise<OpenInvoiceSnapshotFull | null> {
    const e = await this.repository.findOneByProvider(id, idDealerProvider)
    if (!e) return null
    return {
      ...toSnapshotHeader(e),
      rows: JSON.parse(e.rowsJson || '[]') as OpenInvoiceSnapshotRow[],
      payments: JSON.parse(e.paymentsJson || '{}') as OpenInvoiceSnapshotPayments,
    }
  }
}
