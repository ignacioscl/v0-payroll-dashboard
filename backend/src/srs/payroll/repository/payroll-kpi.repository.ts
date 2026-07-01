import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { SRS_CONNECTION } from '../../srs.datasource'
import { WorkflowStatus } from '../../production/entity/workflow.srsentity'
import { PaymentType } from '../entity/ttk-employee-work.srsentity'
import { PayrollKpiDto } from '../dto/payroll-kpi.dto'
import { SrsKpiFilter } from '../../shared/kpi/srs-kpi-filter'
import { buildDealerFilterSql } from '../../shared/kpi/srs-kpi-dealer-filter'

const PAYMENT_TYPE_LABEL: Record<number, string> = {
  [PaymentType.HOURLY]: 'hourly',
  [PaymentType.PIECEWORK]: 'piecework',
  [PaymentType.SALARY]: 'salary',
  [PaymentType.FLAT_RATE]: 'flatRate',
  [PaymentType.DAILY_PAY]: 'dailyPay',
  [PaymentType.HOLIDAY]: 'holiday',
  [PaymentType.SICK_DAY]: 'sickDay',
}

@Injectable()
export class PayrollKpiRepository {
  constructor(@InjectDataSource(SRS_CONNECTION) private readonly srs: DataSource) {}

  async getPayrollKpis(filter: SrsKpiFilter): Promise<PayrollKpiDto> {
    const { idDealerProvider, idUsuario, dealerIds, fechaDesde, fechaHasta, skipDealerRestriction } =
      filter
    const ttk = buildDealerFilterSql('ttk', idUsuario, dealerIds, skipDealerRestriction)
    const inv = buildDealerFilterSql('invoice', idUsuario, dealerIds, skipDealerRestriction)

    const payroll = await this.srs.query(
      `SELECT IFNULL(SUM(TTK_CALCULATE_PAYMENT_JSON(tew.id, NULL)), 0) AS totalPayroll,
              COUNT(DISTINCT tew.id_author)                            AS activeEmployees,
              ROUND(AVG(NULLIF(tew.hourly_rate, 0)), 2)                AS avgHourlyRate
       FROM TTK_EMPLOYEE_WORK tew
       ${ttk.join}
       WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
         ${ttk.and}
         AND tew.fecha BETWEEN ? AND ?`,
      [idDealerProvider, ...ttk.params, fechaDesde, fechaHasta],
    )

    const production = await this.srs.query(
      `SELECT COUNT(DISTINCT i.id)                                AS woCompleted,
              IFNULL(SUM(isr.price * IFNULL(isr.qty, 1)), 0)      AS productionValue
       FROM INVOICE i
       ${inv.join}
       LEFT JOIN INVOICE_SERVICE_REL isr ON isr.id_invoice = i.id
       WHERE i.estado = 1 AND i.id_workflow = ${WorkflowStatus.DONE}
         AND i.id_dealer_provider = ?
         ${inv.and}
         AND DATE(i.date_last_chg_workflow) BETWEEN ? AND ?`,
      [idDealerProvider, ...inv.params, fechaDesde, fechaHasta],
    )

    const totalPayroll = Number(payroll[0]?.totalPayroll ?? 0)
    const activeEmployees = Number(payroll[0]?.activeEmployees ?? 0)
    const avgHourlyRate = Number(payroll[0]?.avgHourlyRate ?? 0)
    const woCompleted = Number(production[0]?.woCompleted ?? 0)
    const productionValue = Number(production[0]?.productionValue ?? 0)

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

  async getPayrollByType(filter: SrsKpiFilter): Promise<{ type: string; value: number }[]> {
    const ttk = buildDealerFilterSql('ttk', filter.idUsuario, filter.dealerIds, filter.skipDealerRestriction)
    const rows = await this.srs.query(
      `SELECT tew.type_payment                                  AS typePayment,
              IFNULL(SUM(TTK_CALCULATE_PAYMENT_JSON(tew.id, NULL)), 0) AS value
       FROM TTK_EMPLOYEE_WORK tew
       ${ttk.join}
       WHERE tew.estado = 1 AND tew.id_dealer_provider = ?
         ${ttk.and}
         AND tew.fecha BETWEEN ? AND ?
       GROUP BY tew.type_payment`,
      [
        filter.idDealerProvider,
        ...ttk.params,
        filter.fechaDesde,
        filter.fechaHasta,
      ],
    )
    return rows.map((r: any) => ({
      type: PAYMENT_TYPE_LABEL[Number(r.typePayment)] ?? `type_${r.typePayment}`,
      value: Number(r.value),
    }))
  }
}
