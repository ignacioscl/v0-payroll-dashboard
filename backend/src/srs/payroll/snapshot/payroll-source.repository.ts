import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { PAYMENT_TYPE_IDS } from './payment-type-ids'
import {
  PayrollPeriod,
  PayrollProviderConfig,
  PieceworkDaySourceRow,
  PunchSourceRow,
  SalarySourceRow,
} from './payroll-snapshot.types'

const num = (v: unknown): number => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v))

/**
 * Lecturas fuente del snapshot de payroll. SQL crudo: es el nivel «por ponchada» del TTK
 * Payroll Report de legacy (`TTKEmployeeReportDao::getFrom` + `load()` líneas 546-590),
 * reusando las funciones almacenadas en vez de reimplementarlas.
 *
 * Tenant: todas las queries filtran por la empresa (`id_dealer_provider` /
 * `id_contratista_owner`) que el job recorre; ninguna toma el provider de un request.
 * Tipo de pago: siempre `tew.id_payment_type` (regla ttk-payment-type-column).
 */
@Injectable()
export class PayrollSourceRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  /** Empresas con ponchadas desde `desde`, con su configuración de payroll. */
  async listProviders(desde: string): Promise<PayrollProviderConfig[]> {
    const rows = await this.srs.query(
      `SELECT c.id AS idContratista,
              c.payment_method AS paymentMethod,
              IFNULL(c.first_day_week, 0) AS firstDayWeek,
              IFNULL(c.daily_report_payroll_tax, 0) AS payrollTaxPct
       FROM CONTRATISTA c
       WHERE EXISTS (
         SELECT 1 FROM TTK_EMPLOYEE_WORK t
         WHERE t.id_dealer_provider = c.id AND t.punch_in >= ?
       )
       ORDER BY c.id`,
      [desde],
    )
    return rows.map(mapProvider)
  }

  async getProvider(idContratista: number): Promise<PayrollProviderConfig | null> {
    const rows = await this.srs.query(
      `SELECT c.id AS idContratista,
              c.payment_method AS paymentMethod,
              IFNULL(c.first_day_week, 0) AS firstDayWeek,
              IFNULL(c.daily_report_payroll_tax, 0) AS payrollTaxPct
       FROM CONTRATISTA c
       WHERE c.id = ?`,
      [idContratista],
    )
    return rows.length ? mapProvider(rows[0]) : null
  }

  /**
   * Períodos de la empresa que tocan algún día de [desde, hasta], con los límites de
   * `TTK_DATE_GROUP_REPORT`. NO llamar con una empresa sin `payment_method`: la función
   * termina con error 1321 (ningún IF hace RETURN). Por eso el chequeo previo.
   */
  async getPeriods(provider: PayrollProviderConfig, desde: string, hasta: string): Promise<PayrollPeriod[]> {
    if (provider.paymentMethod === null) return []
    const rows = await this.srs.query(
      `SELECT DATE_FORMAT(p.desde, '%Y-%m-%d') AS desde, DATE_FORMAT(p.hasta, '%Y-%m-%d') AS hasta
       FROM (
         SELECT DISTINCT TTK_DATE_GROUP_REPORT(x.d, ?, 1) AS desde,
                         TTK_DATE_GROUP_REPORT(x.d, ?, 2) AS hasta
         FROM (
           SELECT DATE_ADD(?, INTERVAL seq DAY) AS d
           FROM seq_0_to_3660
           WHERE DATE_ADD(?, INTERVAL seq DAY) <= ?
         ) x
       ) p
       WHERE p.desde IS NOT NULL
       ORDER BY p.desde`,
      [provider.idContratista, provider.idContratista, desde, desde, hasta],
    )
    return rows.map((r: any) => ({ desde: String(r.desde), hasta: String(r.hasta) }))
  }

  /**
   * Una fila por ponchada del rango, con las horas y el piecework que legacy calcula por
   * ponchada. Mismos filtros que `getFrom`: activa, de la empresa, usuario activo, sin las
   * ponchadas de tipo Salary / Commission (y, por el `<>`, sin las que no tienen tipo).
   */
  async getPunchRows(idContratista: number, desde: string, hasta: string): Promise<PunchSourceRow[]> {
    const rows = await this.srs.query(
      `SELECT tew.id AS id,
              tew.id_author AS idAuthor,
              tew.id_dealer AS idDealer,
              DATE_FORMAT(tew.punch_in, '%Y-%m-%d') AS fecha,
              DATE_FORMAT(tew.punch_in, '%Y-%m-%d %H:%i:%s') AS punchIn,
              tew.id_payment_type AS idPaymentType,
              tew.hourly_rate AS hourlyRate,
              u.payroll_tax AS payrollTax,
              TTK_CALCULATE_TIME_DAY(tew.id_payment_type, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 0) AS horasHourly,
              TTK_CALCULATE_TIME_DAY(tew.id_payment_type, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, 1) AS horas,
              TTK_CALCULATE_TIME_DAY_JSON(tew.id_payment_type, tew.punch_out, tew.punch_in, tew.break_end, tew.break_start, CONCAT('{"payment":', ?, '}')) AS horasShopH,
              CASE WHEN tew.id_payment_type IN (?, ?)
                   THEN GET_PIECEWORK_BY_EMPL_DATERANGE_PROV(tew.id_author, tew.punch_in, tew.punch_in, tew.id_dealer_provider, tew.id_payment_type, 0, tew.id_dealer)
                   ELSE 0 END AS piecework,
              CASE WHEN tew.id_payment_type = ?
                   THEN GET_PIECEWORK_BY_EMPL_DATERANGE_PROV(tew.id_author, tew.punch_in, tew.punch_in, tew.id_dealer_provider, tew.id_payment_type, 0, tew.id_dealer)
                   ELSE 0 END AS flatRate
       FROM TTK_EMPLOYEE_WORK tew
       INNER JOIN usuarios u ON u.id_usuario = tew.id_author AND u.estado = 1
       WHERE tew.id_dealer_provider = ?
         AND tew.estado = 1
         AND tew.punch_in >= ?
         AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
         AND tew.id_payment_type <> ?
         AND tew.id_payment_type <> ?
       ORDER BY tew.id_author, tew.id_dealer, tew.punch_in, tew.id`,
      [
        PAYMENT_TYPE_IDS.SHOP_H,
        PAYMENT_TYPE_IDS.PIECEWORK,
        PAYMENT_TYPE_IDS.PIECEWORK_BY_PERCENT,
        PAYMENT_TYPE_IDS.FLAT_RATE,
        idContratista,
        desde,
        hasta,
        PAYMENT_TYPE_IDS.SALARY,
        PAYMENT_TYPE_IDS.COMMISSION,
      ],
    )
    return rows.map(
      (r: any): PunchSourceRow => ({
        id: num(r.id),
        idAuthor: num(r.idAuthor),
        idDealer: num(r.idDealer),
        fecha: String(r.fecha),
        punchIn: String(r.punchIn),
        idPaymentType: num(r.idPaymentType),
        hourlyRate: numOrNull(r.hourlyRate),
        payrollTax: numOrNull(r.payrollTax),
        horasHourly: num(r.horasHourly),
        horas: num(r.horas),
        horasShopH: num(r.horasShopH),
        piecework: num(r.piecework),
        flatRate: num(r.flatRate),
      }),
    )
  }

  /**
   * Piecework de los días de WO en los que el empleado no ponchó en ese dealer: el UNION de
   * `getFrom` (DAO:334-353) con `filter_wo_done = 0` (WO por fecha de alta). Una fila por
   * (empleado con tipo de pago Piecework en su ficha, dealer del departamento de la WO, día).
   */
  async getPieceworkDayRows(idContratista: number, desde: string, hasta: string): Promise<PieceworkDaySourceRow[]> {
    const rows = await this.srs.query(
      `SELECT x.idUsuario, x.idDealer, x.fecha, x.payrollTax,
              GET_PIECEWORK_BY_EMPL_DATERANGE_PROV(x.idUsuario, x.fecha, x.fecha, ?, ?, 0, x.idDealer) AS piecework
       FROM (
         SELECT ier.id_usuario AS idUsuario,
                d.id_dealer AS idDealer,
                DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS fecha,
                MAX(u.payroll_tax) AS payrollTax
         FROM INVOICE i
         INNER JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
         INNER JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
         INNER JOIN INVOICE_EMPLOYEE_REL ier
                 ON ier.id_invoice = i.id
                AND EXISTS (
                  SELECT lupr.id FROM USUARIO_PAYROLL_REL lupr
                  WHERE lupr.id_usuario = ier.id_usuario AND lupr.id_payment_type IN (?, ?)
                )
         INNER JOIN DEPARTMENT d ON d.id = i.id_department
         INNER JOIN usuarios u ON u.id_usuario = ier.id_usuario AND u.estado = 1
         WHERE i.id_dealer_provider = ?
           AND i.fecha_alta >= ?
           AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)
           AND NOT EXISTS (
             SELECT tew.id FROM TTK_EMPLOYEE_WORK tew
             WHERE tew.punch_in BETWEEN DATE(i.fecha_alta) AND DATE_ADD(DATE(i.fecha_alta), INTERVAL 1 DAY)
               AND tew.id_author = ier.id_usuario
               AND tew.id_dealer = d.id_dealer
           )
         GROUP BY d.id_dealer, ier.id_usuario, DATE(i.fecha_alta)
       ) x`,
      [
        idContratista,
        PAYMENT_TYPE_IDS.PIECEWORK,
        PAYMENT_TYPE_IDS.PIECEWORK,
        PAYMENT_TYPE_IDS.PIECEWORK_BY_PERCENT,
        idContratista,
        desde,
        hasta,
      ],
    )
    return rows.map(
      (r: any): PieceworkDaySourceRow => ({
        idUsuario: num(r.idUsuario),
        idDealer: num(r.idDealer),
        fecha: String(r.fecha),
        payrollTax: numOrNull(r.payrollTax),
        piecework: num(r.piecework),
      }),
    )
  }

  /**
   * Fichas de salario y comisión vigentes el PRIMER día del período (la condición de legacy,
   * DAO:364-367, solo mira `fecha_desde`). A diferencia de legacy, entran también las fichas sin
   * dealer (`id_dealer NULL`): van al snapshot como «Without dealer» (decisión G).
   *
   * Las fichas con dealer entran solo si ese dealer tiene relación activa con la empresa
   * (`DEALER_REL` con `estado = 1` y `fecha_end` vacía): es la lista de dealers que manda la
   * pantalla legacy (`idDealerIn`, DAO:374/385). Una ficha en un dealer dado de baja no aparece en
   * legacy (la marca el aviso de List Users) y acá tampoco. Caso real: Auto Wax, salario de $2.000
   * en West Palm Beach Hyundai (631), sin relación activa.
   */
  async getSalaryRows(idContratista: number, periodoDesde: string): Promise<SalarySourceRow[]> {
    const rows = await this.srs.query(
      `SELECT upr.id_usuario AS idUsuario,
              upr.id_dealer AS idDealer,
              upr.id_payment_type AS idPaymentType,
              upr.payment AS payment,
              u.payroll_tax AS payrollTax
       FROM USUARIO_PAYROLL_REL upr
       INNER JOIN usuarios u
               ON u.id_usuario = upr.id_usuario
              AND u.id_contratista_owner = ?
              AND u.estado = 1
              AND upr.estado = 1
       WHERE upr.id_payment_type IN (?, ?)
         AND ((? BETWEEN upr.date_from AND upr.date_to)
           OR (upr.date_from <= ? AND upr.date_to IS NULL)
           OR (upr.date_from >= ? AND upr.date_to <= ?))
         AND (upr.id_dealer IS NULL OR EXISTS (
               SELECT 1 FROM DEALER_REL dr
               WHERE dr.id_dealer_provider = ? AND dr.id_dealer_customer = upr.id_dealer
                 AND dr.estado = 1 AND dr.fecha_end IS NULL))`,
      [
        idContratista,
        PAYMENT_TYPE_IDS.SALARY,
        PAYMENT_TYPE_IDS.COMMISSION,
        periodoDesde,
        periodoDesde,
        periodoDesde,
        periodoDesde,
        idContratista,
      ],
    )
    return rows.map(
      (r: any): SalarySourceRow => ({
        idUsuario: num(r.idUsuario),
        idDealer: numOrNull(r.idDealer),
        idPaymentType: num(r.idPaymentType),
        payment: num(r.payment),
        payrollTax: numOrNull(r.payrollTax),
      }),
    )
  }
}

function mapProvider(r: any): PayrollProviderConfig {
  return {
    idContratista: num(r.idContratista),
    paymentMethod: numOrNull(r.paymentMethod),
    firstDayWeek: num(r.firstDayWeek),
    payrollTaxPct: num(r.payrollTaxPct),
  }
}
