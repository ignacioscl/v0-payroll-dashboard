import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import { PaymentType } from '../entity/ttk-employee-work.srsentity'
import { PayrollKpiDto } from '../dto/payroll-kpi.dto'

const PAYMENT_TYPE_LABEL: Record<number, string> = {
  [PaymentType.HOURLY]: 'hourly',
  [PaymentType.PIECEWORK]: 'piecework',
  [PaymentType.SALARY]: 'salary',
  [PaymentType.FLAT_RATE]: 'flatRate',
  [PaymentType.DAILY_PAY]: 'dailyPay',
  [PaymentType.HOLIDAY]: 'holiday',
  [PaymentType.SICK_DAY]: 'sickDay',
}

/**
 * DAO de KPIs de payroll (TTK_EMPLOYEE_WORK + funciones SQL del sistema) contra
 * la base legacy SRS (read-only). Toda query filtrada por `idDealerProvider`.
 * No recalcula montos a mano: usa TTK_CALCULATE_PAYMENT_JSON del propio sistema.
 */
@Injectable()
export class PayrollKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getPayrollKpis(
    idDealerProvider: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<PayrollKpiDto> {
    // 5.1 Total payroll (suma del pago real de cada ponchada) + headcount + rate
    const payroll = await this.srs.query(
      `SELECT IFNULL(SUM(TTK_CALCULATE_PAYMENT_JSON(tew.id, NULL)), 0) AS totalPayroll,
              COUNT(DISTINCT tew.id_author)                            AS activeEmployees,
              ROUND(AVG(NULLIF(tew.hourly_rate, 0)), 2)                AS avgHourlyRate
       FROM TTK_EMPLOYEE_WORK tew
       WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
         AND tew.fecha BETWEEN ? AND ?`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    // Producción del mismo período (para labor cost % y cost per WO)
    const production = await this.srs.query(
      `SELECT COUNT(DISTINCT i.id)                                AS woCompleted,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)      AS productionValue
       FROM INVOICE i
       JOIN (SELECT lw.id_work_order, MAX(lw.fecha) done_at
             FROM LOG_WO_WORKFLOW_CHANGE lw WHERE lw.id_workflow = ${WorkflowStatus.DONE}
             GROUP BY lw.id_work_order) done ON done.id_work_order = i.id
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         AND done.done_at BETWEEN ? AND ?`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )

    const totalPayroll = Number(payroll[0]?.totalPayroll ?? 0)
    const activeEmployees = Number(payroll[0]?.activeEmployees ?? 0)
    const avgHourlyRate = Number(payroll[0]?.avgHourlyRate ?? 0)
    const woCompleted = Number(production[0]?.woCompleted ?? 0)
    const productionValue = Number(production[0]?.productionValue ?? 0)

    // NOTA: overtimeCost/overtimePct requieren el split REG/OT semanal por empleado
    // (TTK_EMPLOYEE_HOURS_OT + payment_method de CONTRATISTA). Pendiente de implementar
    // como agregación dedicada; por ahora se exponen en 0 para no informar un valor falso.
    const overtimeCost = 0
    const overtimePct = 0

    return {
      totalPayroll,
      overtimeCost,
      overtimePct,
      avgCostPerWo: woCompleted > 0 ? Math.round((totalPayroll / woCompleted) * 100) / 100 : 0,
      laborCostPct: productionValue > 0 ? Math.round((totalPayroll / productionValue) * 1000) / 10 : 0,
      activeEmployees,
      avgHourlyRate,
    }
  }

  /** 5.2 Payroll por tipo de pago (torta). */
  async getPayrollByType(
    idDealerProvider: number,
    fechaDesde: string,
    fechaHasta: string,
  ): Promise<{ type: string; value: number }[]> {
    const rows = await this.srs.query(
      `SELECT tew.type_payment                                  AS typePayment,
              IFNULL(SUM(TTK_CALCULATE_PAYMENT_JSON(tew.id, NULL)), 0) AS value
       FROM TTK_EMPLOYEE_WORK tew
       WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
         AND tew.fecha BETWEEN ? AND ?
       GROUP BY tew.type_payment`,
      [idDealerProvider, fechaDesde, fechaHasta],
    )
    return rows.map((r: any) => ({
      type: PAYMENT_TYPE_LABEL[Number(r.typePayment)] ?? `type_${r.typePayment}`,
      value: Number(r.value),
    }))
  }
}
