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

/** Una fila por servicio de una WO con el piecework de un empleado (workOrderServicePiecework). */
export interface WorkOrderServicePiecework {
  idInvoice: number
  nro: string
  vin: string
  idDealer: number
  workDate: string
  idService: number
  service: string
  piecework: number
}

/** T5b: una WO (y un servicio) hoy, con los insumos del cálculo del piecework del vendor. */
export interface WorkOrderPieceworkState {
  idInvoice: number
  nro: string
  vin: string
  /** INVOICE.estado: 1 activa, 0 eliminada. */
  woEstado: number
  idDealer: number
  workDate: string
  /** 1 si el vendor está en la WO (INVOICE_EMPLOYEE_REL). */
  hasVendor: number
  /** Empleados distintos de la WO: el divisor de la función. */
  employeeCount: number
  /** null: la WO no tiene ningún servicio. */
  idService: number | null
  service: string
  servicePrice: string | null
  servicePiecework: string | null
  employeePiecework: string | null
  piecework: number
}

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

  /**
   * Empresas con ponchadas desde `desde`, o con WO desde `desde` de algún empleado con tipo de pago
   * Piecework en su ficha (la misma condición de `getPieceworkDayRows`): una empresa que solo paga
   * piecework por WO no poncha nunca (Alliance, plan-piecework-payroll-vs-wo §1).
   */
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
       OR EXISTS (
         SELECT 1
         FROM INVOICE i
         INNER JOIN INVOICE_EMPLOYEE_REL ier ON ier.id_invoice = i.id
         INNER JOIN USUARIO_PAYROLL_REL lupr
                 ON lupr.id_usuario = ier.id_usuario AND lupr.id_payment_type IN (?, ?)
         WHERE i.id_dealer_provider = c.id AND i.fecha_alta >= ?
       )
       ORDER BY c.id`,
      [desde, PAYMENT_TYPE_IDS.PIECEWORK, PAYMENT_TYPE_IDS.PIECEWORK_BY_PERCENT, desde],
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
   * ponchada. Mismos filtros que `getFrom`: activa, de la empresa, sin las ponchadas de tipo
   * Salary / Commission (y, por el `<>`, sin las que no tienen tipo). Las ponchadas de un
   * empleado borrado (`usuarios.estado = 0`) entran: lo trabajado cuenta en su período aunque
   * el empleado se borre después (plan-payroll-empleados-borrados).
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
       INNER JOIN usuarios u ON u.id_usuario = tew.id_author
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
         INNER JOIN usuarios u ON u.id_usuario = ier.id_usuario
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
   * Window Tint Closing (reunión con Juan 18/11, tema 6 y D10): la parte del piecework que el snapshot le contó a
   * cada empleado de `employeeIds` por los servicios SIN `serviceFragment` en el nombre, por (empleado, dealer, día)
   * de [desde, hasta]. Sigue los dos caminos con que el snapshot cuenta piecework, con la misma función por WO y
   * servicio (`GET_PIECEWORK_EMPLOYEES_BY_WO`, la que suma `GET_PIECEWORK_BY_EMPL_DATERANGE_PROV`):
   *  - una fila por ponchada Piecework o Flat Rate (getPunchRows: la función se calcula por ponchada);
   *  - una fila por día de WO sin ponchada en ese dealer (getPieceworkDayRows, mismas condiciones).
   * El cierre resta esto del Payroll de cada tintero: así queda solo lo de los servicios con «tint».
   */
  async nonTintPieceworkRows(
    idContratista: number,
    employeeIds: readonly number[],
    desde: string,
    hasta: string,
    serviceFragment: string,
  ): Promise<PieceworkDaySourceRow[]> {
    if (!employeeIds.length) return []
    const ids = employeeIds.map(() => '?').join(',')
    const notLike = `%${serviceFragment.toLowerCase()}%`
    // Piecework de los servicios sin el texto, del empleado, en las WO del departamento del dealer, del día: el cuerpo
    // de GET_PIECEWORK_BY_EMPL_DATERANGE_PROV (filter_wo_completed = 0) con el filtro por nombre de servicio.
    const nonTint = (user: string, dealer: string, day: string) =>
      `(SELECT IFNULL(SUM(IFNULL(GET_PIECEWORK_EMPLOYEES_BY_WO(i.id, _is.id, iser.piecework, 0, i.date_last_chg_workflow, i.fecha_alta, ier.id_usuario, 1), 0)), 0)
        FROM INVOICE i
        INNER JOIN DEPARTMENT dp ON dp.id = i.id_department AND dp.id_dealer = ${dealer}
        INNER JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
        INNER JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
        INNER JOIN INVOICE_EMPLOYEE_REL ier ON ier.id_invoice = i.id
        LEFT JOIN INVOICE_SERVICE_EMPLOYEE_REL iser
               ON iser.id_invoice = i.id AND iser.id_invoice_service = _is.id AND iser.id_employee = ier.id_usuario
        WHERE i.estado = 1
          AND i.id_dealer_provider = ?
          AND ier.id_usuario = ${user}
          AND i.fecha_alta >= DATE(${day}) AND i.fecha_alta <= DATE_ADD(DATE(${day}), INTERVAL 1 DAY)
          AND LOWER(IFNULL(_is.nombre, '')) NOT LIKE ?)`
    const [punchRows, dayRows] = await Promise.all([
      this.srs.query(
        `SELECT tew.id_author AS idUsuario, tew.id_dealer AS idDealer,
                DATE_FORMAT(tew.punch_in, '%Y-%m-%d') AS fecha, u.payroll_tax AS payrollTax,
                ${nonTint('tew.id_author', 'tew.id_dealer', 'tew.punch_in')} AS piecework
         FROM TTK_EMPLOYEE_WORK tew
         INNER JOIN usuarios u ON u.id_usuario = tew.id_author
         WHERE tew.id_dealer_provider = ?
           AND tew.estado = 1
           AND tew.punch_in >= ?
           AND tew.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
           AND tew.id_payment_type IN (?, ?)
           AND tew.id_author IN (${ids})`,
        [
          idContratista,
          notLike,
          idContratista,
          desde,
          hasta,
          PAYMENT_TYPE_IDS.PIECEWORK,
          PAYMENT_TYPE_IDS.FLAT_RATE,
          ...employeeIds,
        ],
      ),
      this.srs.query(
        `SELECT x.idUsuario, x.idDealer, x.fecha, x.payrollTax,
                ${nonTint('x.idUsuario', 'x.idDealer', 'x.fecha')} AS piecework
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
           INNER JOIN usuarios u ON u.id_usuario = ier.id_usuario
           WHERE i.id_dealer_provider = ?
             AND i.fecha_alta >= ?
             AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)
             AND ier.id_usuario IN (${ids})
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
          notLike,
          PAYMENT_TYPE_IDS.PIECEWORK,
          PAYMENT_TYPE_IDS.PIECEWORK_BY_PERCENT,
          idContratista,
          desde,
          hasta,
          ...employeeIds,
        ],
      ),
    ])
    return [...punchRows, ...dayRows]
      .map(
        (r: any): PieceworkDaySourceRow => ({
          idUsuario: num(r.idUsuario),
          idDealer: num(r.idDealer),
          fecha: String(r.fecha),
          payrollTax: numOrNull(r.payrollTax),
          piecework: num(r.piecework),
        }),
      )
      .filter((r) => r.piecework !== 0)
  }

  /**
   * Expense Piecework (reunión con Juan 18/11, tema 4): el piecework de un empleado por WO y servicio, de las WO
   * creadas en [desde, hasta] (`fecha_alta`, como el snapshot con `filter_wo_done = 0`). Una fila por servicio de la WO
   * con la misma función y los mismos joins con que el snapshot suma ese piecework
   * (`GET_PIECEWORK_BY_EMPL_DATERANGE_PROV` → `GET_PIECEWORK_EMPLOYEES_BY_WO(..., 0, ..., force_flat_rate = 1)`): el
   * dealer es el del departamento de la WO y el día, `DATE(fecha_alta)`. Las filas en $0 no vienen.
   */
  async workOrderServicePiecework(
    idContratista: number,
    idEmployee: number,
    desde: string,
    hasta: string,
    invoiceIds: readonly number[] | null = null,
  ): Promise<WorkOrderServicePiecework[]> {
    if (invoiceIds && !invoiceIds.length) return []
    const byIds = invoiceIds ? ` AND i.id IN (${invoiceIds.map(() => '?').join(',')})` : ''
    const rows = await this.srs.query(
      `SELECT i.id AS idInvoice, i.full_nro AS nro, UPPER(TRIM(IFNULL(car.vin, ''))) AS vin,
              dp.id_dealer AS idDealer, DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS workDate,
              _is.id AS idService, IFNULL(_is.nombre, '') AS service,
              IFNULL(GET_PIECEWORK_EMPLOYEES_BY_WO(i.id, _is.id, iser.piecework, 0, i.date_last_chg_workflow, i.fecha_alta, ier.id_usuario, 1), 0) AS piecework
       FROM INVOICE i
       INNER JOIN DEPARTMENT dp ON dp.id = i.id_department
       INNER JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       INNER JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
       INNER JOIN INVOICE_EMPLOYEE_REL ier ON ier.id_invoice = i.id AND ier.id_usuario = ?
       LEFT JOIN INVOICE_SERVICE_EMPLOYEE_REL iser
              ON iser.id_invoice = i.id AND iser.id_invoice_service = _is.id AND iser.id_employee = ier.id_usuario
       LEFT JOIN CAR car ON car.id = i.id_car
       WHERE i.estado = 1
         AND i.id_dealer_provider = ?
         AND i.fecha_alta >= ?
         AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)${byIds}
       ORDER BY i.fecha_alta, i.id, _is.id`,
      [idEmployee, idContratista, desde, hasta, ...(invoiceIds ?? [])],
    )
    return rows
      .map(
        (r: any): WorkOrderServicePiecework => ({
          idInvoice: num(r.idInvoice),
          nro: String(r.nro ?? ''),
          vin: String(r.vin ?? ''),
          idDealer: num(r.idDealer),
          workDate: String(r.workDate),
          idService: num(r.idService),
          service: String(r.service ?? ''),
          piecework: num(r.piecework),
        }),
      )
      .filter((r: WorkOrderServicePiecework) => r.piecework !== 0)
  }

  /**
   * T5b (plans/plan-reunion-juan-18-11 v9): cómo está hoy cada WO de una expense Piecework, **sin filtrar por fecha de
   * alta ni por estado** (la fecha y el estado pueden haber cambiado). Una fila por servicio de la WO (o una sola, con
   * `idService` null, si la WO no tiene servicios), con lo que entra en el cálculo (los insumos de
   * `GET_PIECEWORK_EMPLOYEES_BY_WO`, migration 007) y el piecework de la misma función y con los mismos argumentos que
   * `workOrderServicePiecework`. Que la WO esté eliminada o ya no tenga al vendor lo decide el que llama
   * (`currentAmount`); acá el piecework sale tal cual.
   */
  async workOrderPieceworkState(
    idContratista: number,
    idEmployee: number,
    invoiceIds: readonly number[],
  ): Promise<WorkOrderPieceworkState[]> {
    if (!invoiceIds.length) return []
    const rows = await this.srs.query(
      `SELECT i.id AS idInvoice, i.full_nro AS nro, UPPER(TRIM(IFNULL(car.vin, ''))) AS vin, i.estado AS woEstado,
              dp.id_dealer AS idDealer, DATE_FORMAT(i.fecha_alta, '%Y-%m-%d') AS workDate,
              EXISTS (SELECT 1 FROM INVOICE_EMPLOYEE_REL v WHERE v.id_invoice = i.id AND v.id_usuario = ?) AS hasVendor,
              (SELECT COUNT(DISTINCT c.id_usuario) FROM INVOICE_EMPLOYEE_REL c WHERE c.id_invoice = i.id) AS employeeCount,
              _is.id AS idService, IFNULL(_is.nombre, '') AS service, isr.price AS servicePrice,
              isr.piecework AS servicePiecework, iser.piecework AS employeePiecework,
              IF(_is.id IS NULL, 0,
                 IFNULL(GET_PIECEWORK_EMPLOYEES_BY_WO(i.id, _is.id, iser.piecework, 0, i.date_last_chg_workflow, i.fecha_alta, ?, 1), 0)
              ) AS piecework
       FROM INVOICE i
       INNER JOIN DEPARTMENT dp ON dp.id = i.id_department
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       LEFT JOIN INVOICE_SERVICE _is ON _is.id = isr.id_service_invoice
       LEFT JOIN INVOICE_SERVICE_EMPLOYEE_REL iser
              ON iser.id_invoice = i.id AND iser.id_invoice_service = _is.id AND iser.id_employee = ?
       LEFT JOIN CAR car ON car.id = i.id_car
       WHERE i.id_dealer_provider = ? AND i.id IN (${invoiceIds.map(() => '?').join(',')})
       ORDER BY i.id, _is.id`,
      [idEmployee, idEmployee, idEmployee, idContratista, ...invoiceIds],
    )
    return rows.map(
      (r: any): WorkOrderPieceworkState => ({
        idInvoice: num(r.idInvoice),
        nro: String(r.nro ?? ''),
        vin: String(r.vin ?? ''),
        woEstado: num(r.woEstado),
        idDealer: num(r.idDealer),
        workDate: String(r.workDate),
        hasVendor: num(r.hasVendor) ? 1 : 0,
        employeeCount: num(r.employeeCount),
        idService: r.idService === null || r.idService === undefined ? null : num(r.idService),
        service: String(r.service ?? ''),
        servicePrice: r.servicePrice === null || r.servicePrice === undefined ? null : String(r.servicePrice),
        servicePiecework: r.servicePiecework === null || r.servicePiecework === undefined ? null : String(r.servicePiecework),
        employeePiecework: r.employeePiecework === null || r.employeePiecework === undefined ? null : String(r.employeePiecework),
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
