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

  /**
   * Una línea en el Log de una invoice (WO to be Billed, plans/plan-wo-to-be-billed-v0 T3). `desc_json` va nulo: el Log
   * de la invoice en Pro lo lee como la foto de una generic (`invoice-statement-log-dialog.tsx`).
   */
  logInvoiceStatement(idInvoiceStatement: number, idAutor: number, descCambio: string) {
    return this.create({
      idInvoiceStatement,
      idAutor,
      descCambio,
      descJson: null,
      origen: LOG_CHANGE_ORIGEN_PRO,
    })
  }

  /** Una línea en el Log de una WO (eliminar, RO# / PO#; WO to be Billed T5 y T6), con los textos de legacy. */
  logWorkOrder(idInvoice: number, idAutor: number, descCambio: string) {
    return this.create({
      idInvoice,
      idAutor,
      descCambio,
      descJson: null,
      origen: LOG_CHANGE_ORIGEN_PRO,
    })
  }

  listForRule(idExpRepetitive: number, take = 200) {
    return this.repository.listForRule(idExpRepetitive, take)
  }

  /** El último que tocó cada WO y cuándo (LOG_CHANGE + LOG_WO_WORKFLOW_CHANGE). */
  lastWorkOrderChanges(idContratista: number, invoiceIds: readonly number[]) {
    return this.repository.lastWorkOrderChanges(idContratista, invoiceIds)
  }
}
