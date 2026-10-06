import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { FLAT_RATE_AND_PIECEWORK_TYPE_IDS } from './payment-type-ids'
import { eachDay, minDate } from './payroll-dates'
import { PayrollPeriod } from './payroll-snapshot.types'

/** Cuenta y XOR de CRC32 de un conjunto de filas fuente (de un día o de toda la empresa). */
export interface FingerprintPart {
  n: number
  x: number
}

export interface ProviderFingerprintSource {
  /** Ponchadas por día (todas las `estado`: una baja cambia la huella). */
  punchByDay: Map<string, FingerprintPart>
  /** WO por día de alta; vacío si la empresa no tiene fichas de piecework / flat rate. */
  woByDay: Map<string, FingerprintPart>
  rels: FingerprintPart
  users: FingerprintPart
  /** DEALER_REL de la empresa. */
  dealers: FingerprintPart
  config: string
}

const xor32 = (a: number, b: number): number => (a ^ b) >>> 0
const part = (r: any): FingerprintPart => ({ n: Number(r?.n ?? 0), x: Number(r?.x ?? 0) >>> 0 })

/**
 * Huella de los datos fuente del snapshot (plan §6.4): una query por componente agrupada por día,
 * compuesta por período en TS. Si la huella de un período no cambió desde el último cálculo, el
 * período no se recalcula. Tenant: todo por la empresa que recorre el job.
 */
@Injectable()
export class PayrollFingerprintRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  /** Lee todos los componentes de una empresa para los días [desde, hasta]. */
  async load(idContratista: number, desde: string, hasta: string): Promise<ProviderFingerprintSource> {
    const punch = await this.srs.query(
      `SELECT DATE_FORMAT(DATE(t.punch_in), '%Y-%m-%d') AS d, COUNT(*) AS n,
              BIT_XOR(CRC32(CONCAT_WS('|', t.id, t.id_author, t.id_dealer, t.id_payment_type, t.punch_in,
                                      t.break_start, t.break_end, t.punch_out, t.hourly_rate, t.estado))) AS x
       FROM TTK_EMPLOYEE_WORK t
       WHERE t.id_dealer_provider = ?
         AND t.punch_in >= ?
         AND t.punch_in < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY DATE(t.punch_in)`,
      [idContratista, desde, hasta],
    )

    const hasPiecework = await this.srs.query(
      `SELECT 1 AS ok
       FROM USUARIO_PAYROLL_REL upr
       INNER JOIN usuarios u ON u.id_usuario = upr.id_usuario AND u.id_contratista_owner = ?
       WHERE upr.id_payment_type IN (${FLAT_RATE_AND_PIECEWORK_TYPE_IDS.map(() => '?').join(',')})
       LIMIT 1`,
      [idContratista, ...FLAT_RATE_AND_PIECEWORK_TYPE_IDS],
    )
    const wo = hasPiecework.length
      ? await this.srs.query(
          `SELECT DATE_FORMAT(DATE(i.fecha_alta), '%Y-%m-%d') AS d, COUNT(*) AS n,
                  BIT_XOR(CRC32(CONCAT_WS('|', i.id, i.estado, i.id_department, i.id_workflow, i.date_last_chg_workflow,
                                          ier.id_usuario, isr.id_service_invoice, isr.piecework, iser.piecework))) AS x
           FROM INVOICE i
           INNER JOIN INVOICE_EMPLOYEE_REL ier ON ier.id_invoice = i.id
           LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
           LEFT JOIN INVOICE_SERVICE_EMPLOYEE_REL iser
                  ON iser.id_invoice = i.id AND iser.id_invoice_service = isr.id_service_invoice
                 AND iser.id_employee = ier.id_usuario
           WHERE i.id_dealer_provider = ?
             AND i.fecha_alta >= ?
             AND i.fecha_alta < DATE_ADD(?, INTERVAL 1 DAY)
           GROUP BY DATE(i.fecha_alta)`,
          [idContratista, desde, hasta],
        )
      : []

    const rels = await this.srs.query(
      `SELECT COUNT(*) AS n,
              BIT_XOR(CRC32(CONCAT_WS('|', upr.id, upr.id_usuario, upr.id_dealer, upr.id_payment_type,
                                      upr.date_from, upr.date_to, upr.payment, upr.estado))) AS x
       FROM USUARIO_PAYROLL_REL upr
       INNER JOIN usuarios u ON u.id_usuario = upr.id_usuario
       WHERE u.id_contratista_owner = ?`,
      [idContratista],
    )
    const users = await this.srs.query(
      `SELECT COUNT(*) AS n, BIT_XOR(CRC32(CONCAT_WS('|', u.id_usuario, u.payroll_tax, u.estado))) AS x
       FROM usuarios u
       WHERE u.id_contratista_owner = ?`,
      [idContratista],
    )
    // Las fichas de salario solo cuentan en dealers con relación activa: una baja o un alta de
    // relación cambia el resultado.
    const dealers = await this.srs.query(
      `SELECT COUNT(*) AS n,
              BIT_XOR(CRC32(CONCAT_WS('|', dr.id, dr.id_dealer_customer, dr.estado, dr.fecha_end))) AS x
       FROM DEALER_REL dr
       WHERE dr.id_dealer_provider = ?`,
      [idContratista],
    )
    const config = await this.srs.query(
      `SELECT CONCAT_WS('|', IFNULL(c.payment_method, ''), IFNULL(c.first_day_week, ''),
                        IFNULL(c.daily_report_payroll_tax, '')) AS cfg
       FROM CONTRATISTA c WHERE c.id = ?`,
      [idContratista],
    )

    return {
      punchByDay: new Map(punch.map((r: any) => [String(r.d), part(r)])),
      woByDay: new Map(wo.map((r: any) => [String(r.d), part(r)])),
      rels: part(rels[0]),
      users: part(users[0]),
      dealers: part(dealers[0]),
      config: String(config[0]?.cfg ?? ''),
    }
  }
}

/**
 * Huella de un período: ponchadas y WO de sus días hasta el corte (XOR de los días) + fichas,
 * empleados y configuración de la empresa + versión del cálculo. ≤ 160 caracteres.
 */
export function periodFingerprint(
  source: ProviderFingerprintSource,
  periodo: PayrollPeriod,
  corte: string,
  calcVersion: number,
): string {
  const punch: FingerprintPart = { n: 0, x: 0 }
  const wo: FingerprintPart = { n: 0, x: 0 }
  for (const d of eachDay(periodo.desde, minDate(periodo.hasta, corte))) {
    const p = source.punchByDay.get(d)
    if (p) {
      punch.n += p.n
      punch.x = xor32(punch.x, p.x)
    }
    const w = source.woByDay.get(d)
    if (w) {
      wo.n += w.n
      wo.x = xor32(wo.x, w.x)
    }
  }
  const fp = [
    calcVersion,
    `${punch.n}-${punch.x}`,
    `${wo.n}-${wo.x}`,
    `${source.rels.n}-${source.rels.x}`,
    `${source.users.n}-${source.users.x}`,
    `${source.dealers.n}-${source.dealers.x}`,
    source.config,
  ].join(':')
  return fp.slice(0, 160)
}
