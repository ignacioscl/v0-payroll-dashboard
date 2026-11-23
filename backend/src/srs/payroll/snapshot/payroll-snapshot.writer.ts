import { Injectable } from '@nestjs/common'
import { Transactional } from 'typeorm-transactional'

import { PayrollSnapshotDayService } from '../../../features/payroll-snapshot-day/service/payroll-snapshot-day.service'
import { SnapshotRow } from './payroll-snapshot.types'

/**
 * Reescribe un (empresa, período) de `PAYROLL_SNAPSHOT_DAY`: DELETE + INSERT en una transacción
 * por período (nunca por corrida). Si algo falla, el período queda como estaba.
 * Conexión default (la registrada en `addTransactionalDataSource`).
 *
 * `afterWrite` corre dentro de la misma transacción, después del INSERT: el job recalcula ahí las expenses Piecework de
 * ese período (T5b, plans/plan-reunion-juan-18-11 v9), así el Payroll y la expense se mueven juntos o ninguno.
 */
@Injectable()
export class PayrollSnapshotWriter {
  constructor(private readonly days: PayrollSnapshotDayService) {}

  @Transactional()
  async rewritePeriod(
    idContratista: number,
    periodoDesde: string,
    rows: SnapshotRow[],
    afterWrite?: () => Promise<unknown>,
  ): Promise<number> {
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
    if (afterWrite) await afterWrite()
    return rows.length
  }
}
