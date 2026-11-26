import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { InvoiceStatementQueryDto } from '../dto/invoice-statement.dto'
import { InvoiceStatementSelSerRel } from '../entity/invoice-statement-sel-ser-rel.entity'
import { InvoiceStatementSelSerRelRepository } from '../repository/invoice-statement-sel-ser-rel.repository'

/** `INVOICE_STATEMENT_SEL_SER_REL`: los servicios elegidos de una invoice «Selected Services». */
@Injectable()
export class InvoiceStatementSelSerRelService extends GlobalBaseService<InvoiceStatementSelSerRel, InvoiceStatementQueryDto> {
  constructor(
    @Inject(InvoiceStatementSelSerRelRepository) private readonly repository: InvoiceStatementSelSerRelRepository,
  ) {
    super()
  }

  protected getRepository(): InvoiceStatementSelSerRelRepository {
    return this.repository
  }

  /** Una fila por servicio elegido, tenga o no líneas, en el orden en que llegaron (`InvoiceStatementService.php:257-265`). */
  async insertSelected(idStatement: number, serviceIds: number[]): Promise<void> {
    if (!serviceIds.length) return
    await this.repository.insert(serviceIds.map((idInvService) => ({ idStatement, idInvService })))
  }
}
