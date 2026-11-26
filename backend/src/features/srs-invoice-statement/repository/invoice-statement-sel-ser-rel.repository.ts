import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { InvoiceStatementQueryDto } from '../dto/invoice-statement.dto'
import { InvoiceStatementSelSerRel } from '../entity/invoice-statement-sel-ser-rel.entity'

/** INVOICE_STATEMENT_SEL_SER_REL (servicios elegidos de «Selected Services»). */
@Injectable()
export class InvoiceStatementSelSerRelRepository extends BaseRepository<InvoiceStatementSelSerRel, InvoiceStatementQueryDto> {
  constructor(
    @InjectRepository(InvoiceStatementSelSerRel)
    private readonly _: Repository<InvoiceStatementSelSerRel>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: InvoiceStatementQueryDto): Promise<PaginationDto<InvoiceStatementSelSerRel>> {
    const query = this.createQueryBuilder('t')
    if (payload.id != null) query.andWhere('t.id = :id', { id: payload.id })
    query.orderBy('t.id', 'DESC')
    return this.applyPagination(query, payload)
  }
}
