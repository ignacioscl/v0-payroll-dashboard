import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { LogChangeQueryDto } from '../dto/log-change.dto'
import { LogChange, LOG_CHANGE_ORIGEN_PRO } from '../entity/log-change.entity'
import { LogChangeRepository } from '../repository/log-change.repository'

/** Histórico de reglas recurrentes (`id_exp_repetitive`), con `origen = 'pro'`. */
@Injectable()
export class LogChangeService extends GlobalBaseService<LogChange, LogChangeQueryDto> {
  constructor(@Inject(LogChangeRepository) private readonly repository: LogChangeRepository) {
    super()
  }

  protected getRepository(): LogChangeRepository {
    return this.repository
  }

  logRule(idExpRepetitive: number, idAutor: number, descCambio: string, descJson: unknown) {
    return this.create({
      idExpRepetitive,
      idAutor,
      descCambio,
      descJson: descJson === undefined ? null : JSON.stringify(descJson),
      origen: LOG_CHANGE_ORIGEN_PRO,
    })
  }

  listForRule(idExpRepetitive: number, take = 200) {
    return this.repository.listForRule(idExpRepetitive, take)
  }
}
