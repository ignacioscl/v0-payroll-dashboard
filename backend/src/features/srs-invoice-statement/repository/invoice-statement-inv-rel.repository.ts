import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { InvoiceStatementQueryDto } from '../dto/invoice-statement.dto'
import { InvoiceStatementInvRel } from '../entity/invoice-statement-inv-rel.entity'

/** INVOICE_STATEMENT_INV_REL (las líneas). */
@Injectable()
export class InvoiceStatementInvRelRepository extends BaseRepository<InvoiceStatementInvRel, InvoiceStatementQueryDto> {
  constructor(
    @InjectRepository(InvoiceStatementInvRel)
    private readonly _: Repository<InvoiceStatementInvRel>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: InvoiceStatementQueryDto): Promise<PaginationDto<InvoiceStatementInvRel>> {
    const query = this.createQueryBuilder('t')
    if (payload.id != null) query.andWhere('t.id = :id', { id: payload.id })
    query.orderBy('t.id', 'DESC')
    return this.applyPagination(query, payload)
  }
}
