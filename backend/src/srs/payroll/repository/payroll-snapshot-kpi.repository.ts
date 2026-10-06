import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerRestrictionClause } from '../../shared/kpi/srs-kpi-dealer-filter'

export interface SnapshotTypeAgg {
  idPaymentType: number
  name: string
  concepto: 'ponchada' | 'prorrateo' | 'overtime'
  monto: number
  tax: number
  horas: number
  filas: number
  empleados: number
}

export interface SnapshotDayHours {
  idUsuario: number
  idDealer: number
  fecha: string
  horas: number
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const mapAgg = (r: any): SnapshotTypeAgg => ({
  idPaymentType: num(r.idPaymentType),
  name: String(r.name ?? ''),
  concepto: r.concepto,
  monto: num(r.monto),
  tax: num(r.tax),
  horas: num(r.horas),
  filas: num(r.filas),
  empleados: num(r.empleados),
})

/**
 * Lecturas de `PAYROLL_SNAPSHOT_DAY` para la tab Payroll Spend (SQL crudo de KPI). Tenant: toda
 * query filtra `p.id_contratista = ctx.idDealerProvider`; los dealers van por la lista del header y
 * `RESTRICTION_DEALER_V2` salvo Admin General / Admin Company.
 */
@Injectable()
export class PayrollSnapshotKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  /** Q0: método de pago y primer día de semana de la empresa. */
  async getProviderConfig(idContratista: number): Promise<{ paymentMethod: number | null; firstDayWeek: number }> {
    const rows = await this.srs.query(
      `SELECT c.payment_method AS paymentMethod, IFNULL(c.first_day_week, 0) AS firstDayWeek
       FROM CONTRATISTA c WHERE c.id = ?`,
      [idContratista],
    )
    const r = rows[0]
    return {
      paymentMethod: r?.paymentMethod === null || r?.paymentMethod === undefined ? null : num(r.paymentMethod),
      firstDayWeek: num(r?.firstDayWeek),
    }
  }

  /** Dealers activos de la empresa (la misma lista que ofrece el header). */
  async activeDealerIds(idContratista: number): Promise<number[]> {
    const rows = await this.srs.query(
      `SELECT dr.id_dealer_customer AS id
       FROM DEALER_REL dr
       WHERE dr.id_dealer_provider = ? AND dr.estado = 1 AND dr.fecha_end IS NULL`,
      [idContratista],
    )
    return rows.map((r: any) => num(r.id))
  }

  /** Q1: totales por (tipo, concepto) de los dealers pedidos. Lo sin dealer se lee aparte. */
  async totalsByType(filter: SrsKpiFilter): Promise<SnapshotTypeAgg[]> {
    const dealer = buildDealerRestrictionClause(filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const rows = await this.srs.query(
      `SELECT p.id_payment_type AS idPaymentType, g.name AS name, p.concepto AS concepto,
              SUM(p.monto) AS monto, SUM(p.monto_tax) AS tax, SUM(p.horas) AS horas,
              COUNT(*) AS filas, COUNT(DISTINCT p.id_usuario) AS empleados
       FROM PAYROLL_SNAPSHOT_DAY p
       JOIN CONTRATISTA c ON c.id = p.id_dealer
       JOIN GENERIC_DATA g ON g.id = p.id_payment_type
       WHERE p.id_contratista = ?
         AND p.fecha BETWEEN ? AND ?
         ${dealer.and}
       GROUP BY p.id_payment_type, g.name, p.concepto`,
      [filter.idDealerProvider, filter.fechaDesde, filter.fechaHasta, ...dealer.params],
    )
    return rows.map(mapAgg)
  }

  /**
   * Montos por (dealer, tipo, concepto), para redondear a centavos por dealer igual que el TTK Payroll
   * Report de legacy (`ROUND(sum(...), 2)` por columna y dealer) antes de sumar: así el total de la
   * tab da al centavo lo mismo que la pantalla legacy. Incluye lo sin dealer (`id_dealer` NULL)
   * solo si se pide.
   */
  async amountsByDealerType(
    filter: SrsKpiFilter,
    includeWithoutDealer: boolean,
  ): Promise<{ idDealer: number | null; idPaymentType: number; concepto: SnapshotTypeAgg['concepto']; monto: number; tax: number }[]> {
    const dealer = buildDealerRestrictionClause(filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const rows = await this.srs.query(
      `SELECT p.id_dealer AS idDealer, p.id_payment_type AS idPaymentType, p.concepto AS concepto,
              SUM(p.monto) AS monto, SUM(p.monto_tax) AS tax
       FROM PAYROLL_SNAPSHOT_DAY p
       JOIN CONTRATISTA c ON c.id = p.id_dealer
       WHERE p.id_contratista = ? AND p.fecha BETWEEN ? AND ? ${dealer.and}
       GROUP BY p.id_dealer, p.id_payment_type, p.concepto
       ${
         includeWithoutDealer
           ? `UNION ALL
       SELECT NULL, p.id_payment_type, p.concepto, SUM(p.monto), SUM(p.monto_tax)
       FROM PAYROLL_SNAPSHOT_DAY p
       WHERE p.id_contratista = ? AND p.id_dealer IS NULL AND p.fecha BETWEEN ? AND ?
       GROUP BY p.id_payment_type, p.concepto`
           : ''
       }`,
      [
        filter.idDealerProvider,
        filter.fechaDesde,
        filter.fechaHasta,
        ...dealer.params,
        ...(includeWithoutDealer ? [filter.idDealerProvider, filter.fechaDesde, filter.fechaHasta] : []),
      ],
    )
    return rows.map((r: any) => ({
      idDealer: r.idDealer === null ? null : num(r.idDealer),
      idPaymentType: num(r.idPaymentType),
      concepto: r.concepto,
      monto: num(r.monto),
      tax: num(r.tax),
    }))
  }

  /** Q1-bis: salarios y comisiones sin dealer (decisión G). Solo para quien ve toda la empresa. */
  async withoutDealerByType(filter: SrsKpiFilter): Promise<SnapshotTypeAgg[]> {
    const rows = await this.srs.query(
      `SELECT p.id_payment_type AS idPaymentType, g.name AS name, p.concepto AS concepto,
              SUM(p.monto) AS monto, SUM(p.monto_tax) AS tax, SUM(p.horas) AS horas,
              COUNT(*) AS filas, COUNT(DISTINCT p.id_usuario) AS empleados
       FROM PAYROLL_SNAPSHOT_DAY p
       JOIN GENERIC_DATA g ON g.id = p.id_payment_type
       WHERE p.id_contratista = ?
         AND p.id_dealer IS NULL
         AND p.fecha BETWEEN ? AND ?
       GROUP BY p.id_payment_type, g.name, p.concepto`,
      [filter.idDealerProvider, filter.fechaDesde, filter.fechaHasta],
    )
    return rows.map(mapAgg)
  }

  /** Empleados distintos con algún monto o ponchada en el rango (dealers pedidos). */
  async countEmployees(filter: SrsKpiFilter, includeWithoutDealer: boolean): Promise<number> {
    const dealer = buildDealerRestrictionClause(filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const rows = await this.srs.query(
      `SELECT COUNT(DISTINCT x.id_usuario) AS n FROM (
         SELECT p.id_usuario
         FROM PAYROLL_SNAPSHOT_DAY p
         JOIN CONTRATISTA c ON c.id = p.id_dealer
         WHERE p.id_contratista = ? AND p.fecha BETWEEN ? AND ? ${dealer.and}
         ${
           includeWithoutDealer
             ? `UNION ALL
         SELECT p.id_usuario FROM PAYROLL_SNAPSHOT_DAY p
         WHERE p.id_contratista = ? AND p.id_dealer IS NULL AND p.fecha BETWEEN ? AND ?`
             : ''
         }
       ) x`,
      [
        filter.idDealerProvider,
        filter.fechaDesde,
        filter.fechaHasta,
        ...dealer.params,
        ...(includeWithoutDealer ? [filter.idDealerProvider, filter.fechaDesde, filter.fechaHasta] : []),
      ],
    )
    return num(rows[0]?.n)
  }

  /**
   * Q2: horas trabajadas por (empleado, dealer, día) en [desde, hasta] — el rango ya ampliado a
   * semanas enteras. Solo `concepto = 'ponchada'`: cada hora trabajada se cuenta una vez (las filas
   * `overtime` repiten las horas pagadas a 1,5 y las de prorrateo no tienen horas).
   */
  async hoursByDay(filter: SrsKpiFilter, desde: string, hasta: string): Promise<SnapshotDayHours[]> {
    const dealer = buildDealerRestrictionClause(filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const rows = await this.srs.query(
      `SELECT p.id_usuario AS idUsuario, p.id_dealer AS idDealer,
              DATE_FORMAT(p.fecha, '%Y-%m-%d') AS fecha, SUM(p.horas) AS horas
       FROM PAYROLL_SNAPSHOT_DAY p
       JOIN CONTRATISTA c ON c.id = p.id_dealer
       WHERE p.id_contratista = ?
         AND p.fecha BETWEEN ? AND ?
         AND p.concepto = 'ponchada'
         ${dealer.and}
       GROUP BY p.id_usuario, p.id_dealer, p.fecha`,
      [filter.idDealerProvider, desde, hasta, ...dealer.params],
    )
    return rows.map((r: any) => ({
      idUsuario: num(r.idUsuario),
      idDealer: num(r.idDealer),
      fecha: String(r.fecha),
      horas: num(r.horas),
    }))
  }

  /**
   * Fecha y hora (UTC) de la última corrida que escribió algo de la empresa. Los períodos de los
   * últimos 30 días se recalculan en cada corrida, así que alcanza con mirar los recientes.
   */
  async lastCalculatedAt(idContratista: number, recentFrom: string): Promise<string | null> {
    const recent = await this.srs.query(
      `SELECT DATE_FORMAT(MAX(p.fecha_calculo), '%Y-%m-%d %H:%i:%s') AS at
       FROM PAYROLL_SNAPSHOT_DAY p
       WHERE p.id_contratista = ? AND p.periodo_desde >= ?`,
      [idContratista, recentFrom],
    )
    if (recent[0]?.at) return String(recent[0].at)
    const any = await this.srs.query(
      `SELECT DATE_FORMAT(MAX(p.fecha_calculo), '%Y-%m-%d %H:%i:%s') AS at
       FROM PAYROLL_SNAPSHOT_DAY p WHERE p.id_contratista = ?`,
      [idContratista],
    )
    return any[0]?.at ? String(any[0].at) : null
  }
}
