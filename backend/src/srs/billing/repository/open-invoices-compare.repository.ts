import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import type { CompareInvoiceFacts } from '../open-invoice-compare'
import { OPEN_INVOICES_IN_BATCH } from './open-invoices.repository'

/**
 * The reasons query of the comparison (T7, §3.6 of plans/plan-reporte-javier/PLAN.md), only for the
 * invoices that changed: their state and creation, and every payment linked to them today (of the whole
 * invoice or of a line), active or deleted. Read-only report SQL; everything filtered by the session
 * provider. In batches of 1,000 ids.
 */
@Injectable()
export class OpenInvoicesCompareRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async factsBySid(idDealerProvider: number, sids: readonly number[]): Promise<Map<number, CompareInvoiceFacts>> {
    const out = new Map<number, CompareInvoiceFacts>()
    const ids = [...new Set(sids)].map((n) => Math.trunc(Number(n))).filter((n) => n > 0)
    for (let i = 0; i < ids.length; i += OPEN_INVOICES_IN_BATCH) {
      const list = ids.slice(i, i + OPEN_INVOICES_IN_BATCH).join(',')
      const heads: { sid: unknown; estado: unknown; fechaCreate: unknown }[] = await this.srs.query(
        `SELECT s.id AS sid, s.estado AS estado, s.fecha_create AS fechaCreate
         FROM INVOICE_STATEMENT s
         WHERE s.id_dealer_provider = ? AND s.id IN (${list})`,
        [idDealerProvider],
      )
      for (const h of heads) {
        out.set(Number(h.sid), {
          estado: h.estado == null ? null : Number(h.estado),
          fechaCreate: h.fechaCreate == null ? null : String(h.fechaCreate),
          payments: [],
        })
      }
      const pays: { sid: unknown; idBilling: unknown; checkNumber: unknown; fechaAlta: unknown; estado: unknown }[] =
        await this.srs.query(
          `SELECT x.sid, b.id AS idBilling, b.check_number AS checkNumber, b.fecha_alta AS fechaAlta, b.estado AS estado
           FROM (
             SELECT bw.id_statement AS sid, bw.id_billing FROM BILLING_WO_REL bw
             WHERE bw.id_statement IN (${list})
             UNION
             SELECT r.id_statement AS sid, bw.id_billing FROM BILLING_WO_REL bw
             JOIN INVOICE_STATEMENT_INV_REL r ON r.id = bw.id_statement_inv_rel
             WHERE r.id_statement IN (${list})
           ) x
           JOIN BILLING b ON b.id = x.id_billing AND b.id_dealer_provider = ?
           ORDER BY x.sid, b.fecha_alta, b.id`,
          [idDealerProvider],
        )
      for (const p of pays) {
        const f = out.get(Number(p.sid))
        if (!f) continue
        f.payments.push({
          idBilling: Number(p.idBilling),
          checkNumber: String(p.checkNumber ?? ''),
          fechaAlta: String(p.fechaAlta ?? '').slice(0, 10),
          estado: Number(p.estado),
        })
      }
    }
    return out
  }

  /** Dealers of the list that the user sees (RESTRICTION_DEALER_V2), in one query per request (§3.6, step 3). */
  async dealersVisibleToUser(idUsuario: number, dealerIds: readonly number[]): Promise<number[]> {
    const ids = [...new Set(dealerIds)].map((n) => Math.trunc(Number(n))).filter((n) => n > 0)
    if (ids.length === 0) return []
    const rows: { id: unknown }[] = await this.srs.query(
      `SELECT c.id AS id FROM CONTRATISTA c WHERE c.id IN (${ids.join(',')}) AND RESTRICTION_DEALER_V2(?, c.id) = 1`,
      [idUsuario],
    )
    return rows.map((r) => Number(r.id))
  }
}
