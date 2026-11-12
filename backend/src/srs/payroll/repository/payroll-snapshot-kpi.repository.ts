import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerRestrictionClause, removedDealersProvider } from '../../shared/kpi/srs-kpi-dealer-filter'
import { PAYMENT_TYPE_IDS, PIECEWORK_TYPE_IDS } from '../snapshot/payment-type-ids'
import { minDate, snapshotCutoff } from '../snapshot/payroll-dates'

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

/** Piecework de un empleado en un dealer y un día (lado WO o lado payroll). */
export interface PieceworkDayAmount {
  idUsuario: number
  idDealer: number
  fecha: string
  amount: number
}

export interface PieceworkEmployeeDayInfo {
  idUsuario: number
  fecha: string
  employee: string
  hasPieceworkType: boolean
  hasPunch: boolean
  hasPieceworkPunch: boolean
  /** Nombres de los otros tipos de pago ponchados ese día (GENERIC_DATA.name), o null. */
  otherTypes: string | null
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
   * Piecework de las WO por (empleado, dealer, día), solo de los empleados con Piecework en su ficha
   * (la condición del Piecework Report de legacy sin tildar, `ReportPieceWorkDao.php:66-68`), sin
   * mirar sus ponchadas: la cuenta de `GET_PIECEWORK_EMPLOYEES_BY_WO` (DDL 6251-6267) —
   * `iser.piecework` si está cargado, si no `isr.piecework` / empleados de la WO, redondeado por fila
   * como su DECIMAL(10,2). Mismo dealer (departamento de la WO) y misma fecha (alta) que el snapshot.
   * Plan plan-demo-prime-piecework-avisos §6.1.
   */
  async pieceworkWorkOrdersByDay(filter: SrsKpiFilter, desde: string, hasta: string): Promise<PieceworkDayAmount[]> {
    const dealer = buildDealerRestrictionClause(filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const types = PIECEWORK_TYPE_IDS.map(() => '?').join(',')
    const rows = await this.srs.query(
      `SELECT w.idUsuario, w.idDealer, w.fecha, w.amount
       FROM (
         SELECT ier.id_usuario AS idUsuario, d.id_dealer AS idDealer,
                DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS fecha,
                SUM(ROUND(COALESCE(iser.piecework,
                      isr.piecework / (SELECT COUNT(DISTINCT x.id_usuario) FROM INVOICE_EMPLOYEE_REL x WHERE x.id_invoice = i.id)), 2)) AS amount
         FROM INVOICE i
         INNER JOIN DEPARTMENT d ON d.id = i.id_department
         INNER JOIN CONTRATISTA c ON c.id = d.id_dealer
         INNER JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         INNER JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
         INNER JOIN INVOICE_EMPLOYEE_REL ier ON ier.id_invoice = i.id
         LEFT JOIN INVOICE_SERVICE_EMPLOYEE_REL iser
                ON iser.id_invoice = i.id AND iser.id_invoice_service = _is.id AND iser.id_employee = ier.id_usuario
         WHERE i.estado = 1
           AND i.id_dealer_provider = ?
           AND i.fecha_alta >= ? AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)
           AND EXISTS (SELECT 1 FROM USUARIO_PAYROLL_REL lupr
                       WHERE lupr.id_usuario = ier.id_usuario AND lupr.id_payment_type IN (${types}))
           ${dealer.and}
         GROUP BY ier.id_usuario, d.id_dealer, DATE(i.fecha_alta)
       ) w`,
      [filter.idDealerProvider, desde, hasta, ...PIECEWORK_TYPE_IDS, ...dealer.params],
    )
    return rows.map((r: any) => ({
      idUsuario: num(r.idUsuario),
      idDealer: num(r.idDealer),
      fecha: String(r.fecha),
      amount: num(r.amount),
    }))
  }

  /** Piecework pagado por payroll (snapshot) por (empleado, dealer, día). */
  async pieceworkPaidByDay(filter: SrsKpiFilter, desde: string, hasta: string): Promise<PieceworkDayAmount[]> {
    const dealer = buildDealerRestrictionClause(filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const types = PIECEWORK_TYPE_IDS.map(() => '?').join(',')
    const rows = await this.srs.query(
      `SELECT p.id_usuario AS idUsuario, p.id_dealer AS idDealer,
              DATE_FORMAT(p.fecha, '%Y-%m-%d') AS fecha, SUM(p.monto) AS amount
       FROM PAYROLL_SNAPSHOT_DAY p
       JOIN CONTRATISTA c ON c.id = p.id_dealer
       WHERE p.id_contratista = ?
         AND p.fecha BETWEEN ? AND ?
         AND p.id_payment_type IN (${types})
         ${dealer.and}
       GROUP BY p.id_usuario, p.id_dealer, p.fecha`,
      [filter.idDealerProvider, desde, hasta, ...PIECEWORK_TYPE_IDS, ...dealer.params],
    )
    return rows.map((r: any) => ({
      idUsuario: num(r.idUsuario),
      idDealer: num(r.idDealer),
      fecha: String(r.fecha),
      amount: num(r.amount),
    }))
  }

  /**
   * Para cada (empleado, día) con diferencia: nombre, si tiene Piecework en su ficha (la condición de
   * `getPieceworkDayRows`) y qué tipos ponchó ese día. Las ponchadas se miran como el cursor de
   * `GET_PIECEWORK_EMPLOYEES_BY_WO` (DDL 6220-6224): cualquier dealer, sin filtrar estado.
   */
  async pieceworkEmployeeDayInfo(keys: { idUsuario: number; fecha: string }[]): Promise<PieceworkEmployeeDayInfo[]> {
    if (!keys.length) return []
    const keySql = keys.map(() => 'SELECT ? AS u, ? AS f').join(' UNION ALL ')
    const day = `t.id_author = k.u AND t.punch_in BETWEEN k.f AND DATE_ADD(k.f, INTERVAL 1 DAY)`
    const types = PIECEWORK_TYPE_IDS.map(() => '?').join(',')
    const rows = await this.srs.query(
      `SELECT k.u AS idUsuario, k.f AS fecha, us.nombre AS employee,
              EXISTS (SELECT 1 FROM USUARIO_PAYROLL_REL l WHERE l.id_usuario = k.u AND l.id_payment_type IN (${types})) AS hasPieceworkType,
              EXISTS (SELECT 1 FROM TTK_EMPLOYEE_WORK t WHERE ${day}) AS hasPunch,
              EXISTS (SELECT 1 FROM TTK_EMPLOYEE_WORK t WHERE ${day} AND t.id_payment_type = ?) AS hasPieceworkPunch,
              (SELECT GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', ')
               FROM TTK_EMPLOYEE_WORK t JOIN GENERIC_DATA g ON g.id = t.id_payment_type
               WHERE ${day} AND t.id_payment_type <> ?) AS otherTypes
       FROM (${keySql}) k
       INNER JOIN usuarios us ON us.id_usuario = k.u`,
      [
        ...PIECEWORK_TYPE_IDS,
        PAYMENT_TYPE_IDS.PIECEWORK,
        PAYMENT_TYPE_IDS.PIECEWORK,
        ...keys.flatMap((k) => [k.idUsuario, k.fecha]),
      ],
    )
    return rows.map((r: any) => ({
      idUsuario: num(r.idUsuario),
      fecha: String(r.fecha),
      employee: String(r.employee ?? ''),
      hasPieceworkType: num(r.hasPieceworkType) === 1,
      hasPunch: num(r.hasPunch) === 1,
      hasPieceworkPunch: num(r.hasPieceworkPunch) === 1,
      otherTypes: r.otherTypes === null || r.otherTypes === undefined ? null : String(r.otherTypes),
    }))
  }

  /**
   * De `ids`, los que tienen alguno de `typeIds` en su ficha (USUARIO_PAYROLL_REL), sin estado ni fechas: la
   * condición del Piece Work Report de legacy (ReportPieceWorkDao.php:76). Window Tint Closing la usa para los
   * tinteros (plans/plan-window-tint-closing-tint-y-servicios T1); los ids ya vienen acotados a la empresa.
   */
  async employeeIdsWithPaymentTypes(ids: readonly number[], typeIds: readonly number[]): Promise<number[]> {
    if (!ids.length || !typeIds.length) return []
    const rows = await this.srs.query(
      `SELECT DISTINCT l.id_usuario AS idUsuario
       FROM USUARIO_PAYROLL_REL l
       WHERE l.id_usuario IN (${ids.map(() => '?').join(',')})
         AND l.id_payment_type IN (${typeIds.map(() => '?').join(',')})`,
      [...ids, ...typeIds],
    )
    return rows.map((r: any) => num(r.idUsuario)).sort((a: number, b: number) => a - b)
  }

  /**
   * Monthly Closing (T2 de plans/plan-monthly-closing/PLAN.md): montos sin redondear por (dealer,
   * período, tipo, concepto) de los períodos pedidos (`periodo_desde IN`, usa `idx_psd_periodo`). El
   * service redondea como legacy: por dealer, período y columna. `includeWithoutDealer` suma las
   * filas con `id_dealer` NULL (idDealer null); `employeeIds` acota a esos empleados (el Window Tint
   * Closing, T3 de plans/plan-reporte-tint/PLAN.md). Sin `employeeIds`, todos.
   */
  async amountsByDealerPeriodType(
    filter: SrsKpiFilter,
    periodDesdes: string[],
    includeWithoutDealer: boolean,
    employeeIds: number[] | null = null,
  ): Promise<{ idDealer: number | null; periodoDesde: string; idPaymentType: number; concepto: string; monto: number; tax: number }[]> {
    if (!periodDesdes.length || (employeeIds && !employeeIds.length)) return []
    const dealer = buildDealerRestrictionClause(
      filter.idUsuario,
      filter.dealerIds,
      filter.skipDealerRestriction,
      removedDealersProvider(filter),
    )
    const periods = periodDesdes.map(() => '?').join(',')
    const emp = employeeIds ? ` AND p.id_usuario IN (${employeeIds.map(() => '?').join(',')})` : ''
    const empParams = employeeIds ?? []
    const rows = await this.srs.query(
      `SELECT p.id_dealer AS idDealer, DATE_FORMAT(p.periodo_desde, '%Y-%m-%d') AS periodoDesde,
              p.id_payment_type AS idPaymentType, p.concepto AS concepto,
              SUM(p.monto) AS monto, SUM(p.monto_tax) AS tax
       FROM PAYROLL_SNAPSHOT_DAY p
       JOIN CONTRATISTA c ON c.id = p.id_dealer
       WHERE p.id_contratista = ? AND p.periodo_desde IN (${periods})${emp} ${dealer.and}
       GROUP BY p.id_dealer, p.periodo_desde, p.id_payment_type, p.concepto
       ${
         includeWithoutDealer
           ? `UNION ALL
       SELECT NULL, DATE_FORMAT(p.periodo_desde, '%Y-%m-%d'), p.id_payment_type, p.concepto,
              SUM(p.monto), SUM(p.monto_tax)
       FROM PAYROLL_SNAPSHOT_DAY p
       WHERE p.id_contratista = ? AND p.id_dealer IS NULL AND p.periodo_desde IN (${periods})${emp}
       GROUP BY p.periodo_desde, p.id_payment_type, p.concepto`
           : ''
       }`,
      [
        filter.idDealerProvider,
        ...periodDesdes,
        ...empParams,
        ...dealer.params,
        ...(includeWithoutDealer ? [filter.idDealerProvider, ...periodDesdes, ...empParams] : []),
      ],
    )
    return rows.map((r: any) => ({
      idDealer: r.idDealer === null ? null : num(r.idDealer),
      periodoDesde: String(r.periodoDesde),
      idPaymentType: num(r.idPaymentType),
      concepto: String(r.concepto),
      monto: num(r.monto),
      tax: num(r.tax),
    }))
  }

  /**
   * Monthly Closing: monto + tax sin redondear por (dealer, período, empleado), con el nombre y la
   * posición (`usuarios.id_position` → `datos_parametricos.nombre`). `dealer`: un id, 'all' (los del
   * filtro) o 'none' (las filas sin dealer). El service los lleva a centavos con el mayor resto.
   */
  async amountsByDealerEmployeeForPeriods(
    filter: SrsKpiFilter,
    periodDesdes: string[],
    dealer: number | 'all' | 'none',
    employeeIds: number[] | null = null,
  ): Promise<{ idDealer: number | null; periodoDesde: string; periodoHasta: string; idUsuario: number; employee: string; position: string; amount: number }[]> {
    if (!periodDesdes.length || (employeeIds && !employeeIds.length)) return []
    const periods = periodDesdes.map(() => '?').join(',')
    const emp = employeeIds ? ` AND p.id_usuario IN (${employeeIds.map(() => '?').join(',')})` : ''
    let dealerSql: string
    let dealerParams: unknown[]
    if (dealer === 'none') {
      dealerSql = 'AND p.id_dealer IS NULL'
      dealerParams = []
    } else {
      const ids = dealer === 'all' ? filter.dealerIds : [dealer]
      const clause = buildDealerRestrictionClause(
        filter.idUsuario,
        ids,
        filter.skipDealerRestriction,
        removedDealersProvider(filter),
      )
      dealerSql = `AND EXISTS (SELECT 1 FROM CONTRATISTA c WHERE c.id = p.id_dealer ${clause.and})`
      dealerParams = clause.params
    }
    const rows = await this.srs.query(
      `SELECT p.id_dealer AS idDealer, DATE_FORMAT(p.periodo_desde, '%Y-%m-%d') AS periodoDesde,
              DATE_FORMAT(MAX(p.periodo_hasta), '%Y-%m-%d') AS periodoHasta, p.id_usuario AS idUsuario,
              MAX(u.nombre) AS employee, MAX(pos.nombre) AS position,
              SUM(p.monto) + SUM(p.monto_tax) AS amount
       FROM PAYROLL_SNAPSHOT_DAY p
       LEFT JOIN usuarios u ON u.id_usuario = p.id_usuario
       LEFT JOIN datos_parametricos pos ON pos.id_dato_parametrico = u.id_position
       WHERE p.id_contratista = ? AND p.periodo_desde IN (${periods})${emp}
         ${dealerSql}
       GROUP BY p.id_dealer, p.periodo_desde, p.id_usuario`,
      [filter.idDealerProvider, ...periodDesdes, ...(employeeIds ?? []), ...dealerParams],
    )
    return rows.map((r: any) => ({
      idDealer: r.idDealer === null ? null : num(r.idDealer),
      periodoDesde: String(r.periodoDesde),
      periodoHasta: String(r.periodoHasta),
      idUsuario: num(r.idUsuario),
      employee: String(r.employee ?? ''),
      position: String(r.position ?? ''),
      amount: num(r.amount),
    }))
  }

  /**
   * Monthly Closing §5.4.5: hasta qué día está calculado cada período pedido. Como `lastCoveredDay`,
   * por período: su fin o el corte (hoy − 2) del momento en que se calculó, lo que sea antes. Un
   * período sin filas no aparece.
   */
  async periodCoverage(idContratista: number, periodDesdes: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>()
    if (!periodDesdes.length) return out
    const rows = await this.srs.query(
      `SELECT DATE_FORMAT(p.periodo_desde, '%Y-%m-%d') AS desde,
              DATE_FORMAT(MAX(p.periodo_hasta), '%Y-%m-%d') AS hasta,
              DATE_FORMAT(MAX(p.fecha_calculo), '%Y-%m-%d %H:%i:%s') AS at
       FROM PAYROLL_SNAPSHOT_DAY p
       WHERE p.id_contratista = ? AND p.periodo_desde IN (${periodDesdes.map(() => '?').join(',')})
       GROUP BY p.periodo_desde`,
      [idContratista, ...periodDesdes],
    )
    for (const r of rows) {
      if (!r.hasta || !r.at) continue
      out.set(String(r.desde), minDate(String(r.hasta), snapshotCutoff(new Date(`${String(r.at).replace(' ', 'T')}Z`))))
    }
    return out
  }

  /** Nombre de cada dealer como lo ve la empresa (`GET_DEALER_NAME_BY_PROVIDER`). */
  async dealerNames(idContratista: number, dealerIds: number[]): Promise<Map<number, string>> {
    if (!dealerIds.length) return new Map()
    const rows = await this.srs.query(
      `SELECT c.id AS id, GET_DEALER_NAME_BY_PROVIDER(?, c.id) AS name
       FROM CONTRATISTA c WHERE c.id IN (${dealerIds.map(() => '?').join(',')})`,
      [idContratista, ...dealerIds],
    )
    return new Map(rows.map((r: any) => [num(r.id), String(r.name ?? '')]))
  }

  /**
   * Fecha y hora (UTC) de la última corrida que escribió algo de la empresa. Los períodos de los
   * últimos 30 días se recalculan en cada corrida, así que alcanza con mirar los recientes.
   */
  /**
   * Hasta qué día llega el snapshot: el último período calculado cubre hasta su fin o hasta el
   * corte (hoy − 2) del momento en que se calculó, lo que sea antes. Null sin snapshot.
   */
  async lastCoveredDay(idContratista: number): Promise<string | null> {
    const rows = await this.srs.query(
      `SELECT DATE_FORMAT(p.periodo_hasta, '%Y-%m-%d') AS hasta,
              DATE_FORMAT(MAX(p.fecha_calculo), '%Y-%m-%d %H:%i:%s') AS at
       FROM PAYROLL_SNAPSHOT_DAY p
       WHERE p.id_contratista = ?
         AND p.periodo_desde = (SELECT MAX(x.periodo_desde) FROM PAYROLL_SNAPSHOT_DAY x WHERE x.id_contratista = ?)
       GROUP BY p.periodo_hasta
       ORDER BY p.periodo_hasta DESC
       LIMIT 1`,
      [idContratista, idContratista],
    )
    const r = rows[0]
    if (!r?.hasta || !r?.at) return null
    return minDate(String(r.hasta), snapshotCutoff(new Date(`${String(r.at).replace(' ', 'T')}Z`)))
  }

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
