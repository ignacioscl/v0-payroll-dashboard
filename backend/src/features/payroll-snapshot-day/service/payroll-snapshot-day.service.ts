import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from '../../../commons/service/global.base.service'
import { PayrollSnapshotDayQueryDto } from '../dto/payroll-snapshot-day.dto'
import { PayrollSnapshotDay } from '../entity/payroll-snapshot-day.entity'
import {
  PayrollSnapshotDayInsert,
  PayrollSnapshotDayRepository,
} from '../repository/payroll-snapshot-day.repository'

const INSERT_CHUNK = 1000

@Injectable()
export class PayrollSnapshotDayService extends GlobalBaseService<PayrollSnapshotDay, PayrollSnapshotDayQueryDto> {
  constructor(
    @Inject(PayrollSnapshotDayRepository) private readonly repository: PayrollSnapshotDayRepository,
  ) {
    super()
  }

  protected getRepository(): PayrollSnapshotDayRepository {
    return this.repository
  }

  deletePeriod(idContratista: number, periodoDesde: string): Promise<number> {
    return this.repository.deletePeriod(idContratista, periodoDesde)
  }

  /** Inserta en lotes de 1.000 filas. Corre dentro de la transacción de quien lo llama. */
  async insertRows(rows: PayrollSnapshotDayInsert[]): Promise<void> {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await this.repository.insertRows(rows.slice(i, i + INSERT_CHUNK))
    }
  }
}
