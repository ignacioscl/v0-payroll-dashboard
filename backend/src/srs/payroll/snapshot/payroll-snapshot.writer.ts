import { Injectable } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { PayrollSnapshotDayService } from '../../../features/payroll-snapshot-day/service/payroll-snapshot-day.service'
import { SnapshotRow } from './payroll-snapshot.types'

/**
 * Reescribe un (empresa, período) de `PAYROLL_SNAPSHOT_DAY`: DELETE + INSERT en una transacción
 * por período (nunca por corrida). Si algo falla, el período queda como estaba.
 * Conexión default (la registrada en `addTransactionalDataSource`).
 */
@Injectable()
export class PayrollSnapshotWriter {
  constructor(private readonly days: PayrollSnapshotDayService) {}

  @Transactional()
  async rewritePeriod(idContratista: number, periodoDesde: string, rows: SnapshotRow[]): Promise<number> {
    await this.days.deletePeriod(idContratista, periodoDesde)
    await this.days.insertRows(
      rows.map((r) => ({
        idContratista: r.idContratista,
        idDealer: r.idDealer,
        idUsuario: r.idUsuario,
        idPaymentType: r.idPaymentType,
        concepto: r.concepto,
        fecha: r.fecha,
        idPonchada: r.idPonchada,
        horas: r.horas,
        monto: r.monto,
        montoTax: r.montoTax,
        tarifa: r.tarifa,
        periodoDesde: r.periodoDesde,
        periodoHasta: r.periodoHasta,
        diasPeriodo: r.diasPeriodo,
        paymentMethod: r.paymentMethod,
        fechaCalculo: r.fechaCalculo,
        calcVersion: r.calcVersion,
      })),
    )
    return rows.length
  }
}
