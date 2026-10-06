import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from '../../../commons/service/global.base.service'
import { PayrollPeriodStateQueryDto } from '../dto/payroll-period-state.dto'
import { PayrollPeriodState } from '../entity/payroll-period-state.jobsentity'
import { PayrollPeriodStateRepository } from '../repository/payroll-period-state.repository'

export type PayrollPeriodStateInput = Omit<PayrollPeriodState, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

@Injectable()
export class PayrollPeriodStateService extends GlobalBaseService<PayrollPeriodState, PayrollPeriodStateQueryDto> {
  constructor(
    @Inject(PayrollPeriodStateRepository) private readonly repository: PayrollPeriodStateRepository,
  ) {
    super()
  }

  protected getRepository(): PayrollPeriodStateRepository {
    return this.repository
  }

  async get(idContratista: number, periodoDesde: string): Promise<PayrollPeriodState | null> {
    return this.repository.findOne({ where: { idContratista, periodoDesde } })
  }

  /** Todos los estados de una empresa, por `periodo_desde` (una lectura por empresa y corrida). */
  async mapByProvider(idContratista: number): Promise<Map<string, PayrollPeriodState>> {
    const rows = await this.repository.find({ where: { idContratista } })
    return new Map(rows.map((r) => [String(r.periodoDesde), r]))
  }

  /**
   * Guarda el estado del período. Clave natural (id_contratista, periodo_desde): si existe se
   * actualiza esa fila, si no se inserta (sin upsert: regla sql-no-insert-upsert).
   */
  async save(state: PayrollPeriodStateInput): Promise<PayrollPeriodState> {
    const current = await this.get(state.idContratista, state.periodoDesde)
    if (current) {
      Object.assign(current, state)
      return this.repository.save(current)
    }
    return this.repository.save(this.repository.create(state))
  }
}
