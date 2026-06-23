import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { CollectionsKpiDto } from '../dto/collections-kpi.dto'

/**
 * DAO de KPIs de cobranza (BILLING + BILLING_WO_REL) contra la base legacy SRS.
 * Read-only, toda query filtrada por `idDealerProvider` (tenant).
 */
@Injectable()
export class CollectionsKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  // Statement 100% cobrado (IS_STATEMENT_BILLED=1, contra BILLING — NO el flag pagado)
  // + fecha del último cheque.
  private readonly paySub = `
    SELECT s.id id_statement, MAX(b.fecha) paid_at
    FROM INVOICE_STATEMENT s
    JOIN BILLING_WO_REL bwr ON (bwr.id_statement = s.id
        OR bwr.id_statement_inv_rel IN (SELECT r.id FROM INVOICE_STATEMENT_INV_REL r WHERE r.id_statement = s.id))
    JOIN BILLING b ON b.id = bwr.id_billing AND b.estado = 1
    WHERE IS_STATEMENT_BILLED(s.id) = 1
    GROUP BY s.id`

  async getCollectionsKpis(
    idDealerProvider: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<CollectionsKpiDto> {
    // 3.1 Collected $ = SUM(BILLING.amount) por fecha del cheque (estado=1, día completo).
    // Validado contra la base (prov 79 may-2025 => $2.100.545,59).
    const collected = await this.srs.query(
      `SELECT IFNULL(SUM(b.amount), 0) AS collectedValue
       FROM BILLING b
       WHERE b.estado = 1 AND b.id_dealer_provider = ?
         AND b.fecha >= ? AND b.fecha < DATE_ADD(?, INTERVAL 1 DAY)`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // 3.2 DSO (sobre statements totalmente cobrados con último cheque en el período)
    const dso = await this.srs.query(
      `SELECT ROUND(AVG(DATEDIFF(pay.paid_at, s.fecha_create)), 1) AS dsoDays
       FROM INVOICE_STATEMENT s
       JOIN (${this.paySub}) pay ON pay.id_statement = s.id
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         AND pay.paid_at BETWEEN ? AND ?`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // 3.3 Outstanding AR + open statements + AR over 60 (snapshot).
    // "No cobrado" = IS_STATEMENT_BILLED(s.id)=0 y valor = GET_TOTAL_BY_STATEMENT_NOT_BILLED
    // (funciones del legacy). El flag `pagado` por línea NO es fuente de verdad.
    // Validado contra la base (prov 79 => 64.022 statements / $1.964.708,08 / 46.2% >60d).
    const ar = await this.srs.query(
      `SELECT COUNT(*)                                                 AS openStatements,
              ROUND(IFNULL(SUM(t.notBilled), 0), 2)                    AS outstandingAr,
              ROUND(100 * SUM(CASE WHEN t.ageDays > 60 THEN t.notBilled ELSE 0 END)
                    / NULLIF(SUM(t.notBilled), 0), 1)                  AS arOver60Pct
       FROM (
         SELECT GET_TOTAL_BY_STATEMENT_NOT_BILLED(s.id, s.discount, NULL, s.discount_type, s.statement_type, NULL) notBilled,
                DATEDIFF(NOW(), s.fecha_create) ageDays
         FROM INVOICE_STATEMENT s
         WHERE s.estado = 1 AND s.id_dealer_provider = ?
           AND IS_STATEMENT_BILLED(s.id) = 0
       ) t`,
      [idDealerProvider],
    )

    // 3.4 Collection rate = collected / invoiced del período (mismo invoiced que billing)
    const invoiced = await this.srs.query(
      `SELECT ROUND(IFNULL(SUM(GET_TOTAL_BY_STATEMENT(s.id, s.discount, NULL, s.discount_type, NULL)), 0), 2) AS invoicedValue
       FROM INVOICE_STATEMENT s
       WHERE s.estado = 1 AND s.id_dealer_provider = ?
         AND s.fecha_create >= ? AND s.fecha_create < DATE_ADD(?, INTERVAL 1 DAY)`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    const collectedValue = Number(collected[0]?.collectedValue ?? 0)
    const invoicedValue = Number(invoiced[0]?.invoicedValue ?? 0)
    const a = ar[0] ?? {}

    return {
      outstandingAr: Number(a.outstandingAr ?? 0),
      dsoDays: Number(dso[0]?.dsoDays ?? 0),
      collectedValue,
      collectionRatePct: invoicedValue > 0 ? Math.round((collectedValue / invoicedValue) * 1000) / 10 : 0,
      arOver60Pct: Number(a.arOver60Pct ?? 0),
      openStatements: Number(a.openStatements ?? 0),
    }
  }

  /** 3.3 AR aging por bucket (snapshot). */
  async getArAging(
    idDealerProvider: number,
  ): Promise<{ bucket: string; statements: number; value: number }[]> {
    // Mismo criterio que el outstanding AR: no cobrado = IS_STATEMENT_BILLED=0,
    // valor = GET_TOTAL_BY_STATEMENT_NOT_BILLED (NO el flag `pagado`). Buckets por
    // antigüedad de fecha_create. Validado (prov 79 => suma = $1.964.708,08).
    const rows = await this.srs.query(
      `SELECT CASE WHEN t.ageDays <= 30 THEN '0-30 days'
                   WHEN t.ageDays <= 60 THEN '31-60 days'
                   WHEN t.ageDays <= 90 THEN '61-90 days'
                   ELSE '90+ days' END        AS bucket,
              COUNT(*)                        AS statements,
              ROUND(IFNULL(SUM(t.notBilled), 0), 2) AS value
       FROM (
         SELECT GET_TOTAL_BY_STATEMENT_NOT_BILLED(s.id, s.discount, NULL, s.discount_type, s.statement_type, NULL) notBilled,
                DATEDIFF(NOW(), s.fecha_create) ageDays
         FROM INVOICE_STATEMENT s
         WHERE s.estado = 1 AND s.id_dealer_provider = ?
           AND IS_STATEMENT_BILLED(s.id) = 0
       ) t
       GROUP BY bucket
       ORDER BY MIN(t.ageDays)`,
      [idDealerProvider],
    )
    return rows.map((r: any) => ({
      bucket: r.bucket,
      statements: Number(r.statements),
      value: Number(r.value),
    }))
  }
}
