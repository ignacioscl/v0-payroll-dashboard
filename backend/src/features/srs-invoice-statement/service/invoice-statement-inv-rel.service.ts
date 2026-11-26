import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { InvoiceStatementQueryDto } from '../dto/invoice-statement.dto'
import { InvoiceStatementInvRel } from '../entity/invoice-statement-inv-rel.entity'
import { InvoiceStatementInvRelRepository } from '../repository/invoice-statement-inv-rel.repository'

/** Filas por INSERT al grabar las líneas de una invoice. */
export const INV_REL_BATCH = 500

/** `INVOICE_STATEMENT_INV_REL`: las líneas (WO + servicio) de una invoice de WO. */
@Injectable()
export class InvoiceStatementInvRelService extends GlobalBaseService<InvoiceStatementInvRel, InvoiceStatementQueryDto> {
  constructor(@Inject(InvoiceStatementInvRelRepository) private readonly repository: InvoiceStatementInvRelRepository) {
    super()
  }

  protected getRepository(): InvoiceStatementInvRelRepository {
    return this.repository
  }

  /** Una fila por línea; `id_employee_work`, `amount`, `description` y `generic_qty` nulos, `only_timecard` 0. */
  async insertWoLines(idStatement: number, lines: Array<{ idInvoice: number; idServiceInvoice: number }>): Promise<void> {
    for (let i = 0; i < lines.length; i += INV_REL_BATCH) {
      const batch = lines.slice(i, i + INV_REL_BATCH).map((line) => ({
        idStatement,
        idInvoice: line.idInvoice,
        idInvoiceService: line.idServiceInvoice,
        idEmployeeWork: null,
        amount: null,
        description: null,
        genericQty: null,
        onlyTimecard: 0,
      }))
      await this.repository.insert(batch)
    }
  }
}
