import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { InvoiceStatementQueryDto } from '../dto/invoice-statement.dto'
import { InvoiceStatement } from '../entity/invoice-statement.entity'
import { InvoiceStatementRepository } from '../repository/invoice-statement.repository'

/** Lo que se graba de una invoice de WO (las 19 columnas del INSERT de legacy, T3). */
export type NewWoInvoiceStatement = {
  idDealer: number
  idDealerProvider: number
  idDepartment: number | null
  idInvoiceService: number | null
  idAuthor: number
  invoicePrefix: string
  invoiceNro: number
  fullNro: string
  statementType: number
  fechaDesde: string
  fechaHasta: string
  invoiceServiceSelRel: string | null
  po: string | null
}

/** `INVOICE_STATEMENT`. Lo llama el orquestador dentro de su transacción. */
@Injectable()
export class InvoiceStatementService extends GlobalBaseService<InvoiceStatement, InvoiceStatementQueryDto> {
  constructor(@Inject(InvoiceStatementRepository) private readonly repository: InvoiceStatementRepository) {
    super()
  }

  protected getRepository(): InvoiceStatementRepository {
    return this.repository
  }

  /** Inserta la invoice y devuelve su id. `discount`, `discount_detail`, schedule, notas y `tax` van nulos. */
  async insertWoStatement(data: NewWoInvoiceStatement): Promise<number> {
    const result = await this.repository.insert({
      idDealer: data.idDealer,
      idDealerProvider: data.idDealerProvider,
      idDepartment: data.idDepartment,
      idInvoiceService: data.idInvoiceService,
      idAuthor: data.idAuthor,
      idInvoiceStatementSchedule: null,
      invoiceServiceSelRel: data.invoiceServiceSelRel,
      invoicePrefix: data.invoicePrefix,
      invoiceNro: data.invoiceNro,
      fullNro: data.fullNro,
      po: data.po,
      invoiceNote: null,
      headerNote: null,
      tax: null,
      discount: null,
      discountDetail: null,
      statementType: data.statementType,
      fechaDesde: data.fechaDesde,
      fechaHasta: data.fechaHasta,
    })
    const id = Number(result.identifiers[0]?.id)
    if (!Number.isFinite(id) || id < 1) throw new Error('INSERT INVOICE_STATEMENT did not return an id')
    return id
  }
}
