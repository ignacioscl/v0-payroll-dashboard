import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { LogGenericQueryDto } from '../dto/log-generic.dto'
import { LogGeneric, LOG_GENERIC_TIPO_EXPENSE } from '../entity/log-generic.entity'
import { LogGenericRepository } from '../repository/log-generic.repository'

/** Histórico de gastos y de grupos: toda fila de Pro lleva `tipo = 7` (la que legacy filtra). */
@Injectable()
export class LogGenericService extends GlobalBaseService<LogGeneric, LogGenericQueryDto> {
  constructor(@Inject(LogGenericRepository) private readonly repository: LogGenericRepository) {
    super()
  }

  protected getRepository(): LogGenericRepository {
    return this.repository
  }

  /** Una fila de la fila del gasto; `idExpGroup` solo cuando la fila también cuenta para el grupo (adjunto del grupo). */
  logExpense(idExpense: number, idAuthor: number, description: string, idExpGroup: number | null = null) {
    return this.create({
      idAuthor,
      idExpense,
      idExpGroup,
      tipo: LOG_GENERIC_TIPO_EXPENSE,
      description: description.slice(0, 512),
    })
  }

  logGroup(idExpGroup: number, idAuthor: number, description: string) {
    return this.create({
      idAuthor,
      idExpense: null,
      idExpGroup,
      tipo: LOG_GENERIC_TIPO_EXPENSE,
      description: description.slice(0, 512),
    })
  }

  listForExpense(idExpense: number, idExpGroup: number | null) {
    return this.repository.listForExpense(idExpense, idExpGroup)
  }
}
