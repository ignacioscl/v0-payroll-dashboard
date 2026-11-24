import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from 'src/commons/repository/base.repository'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'
import { InvoiceStatementQueryDto } from '../dto/invoice-statement.dto'
import { InvoiceStatement } from '../entity/invoice-statement.entity'

/** INVOICE_STATEMENT (la invoice). */
@Injectable()
export class InvoiceStatementRepository extends BaseRepository<InvoiceStatement, InvoiceStatementQueryDto> {
  constructor(
    @InjectRepository(InvoiceStatement)
    private readonly _: Repository<InvoiceStatement>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: InvoiceStatementQueryDto): Promise<PaginationDto<InvoiceStatement>> {
    const query = this.createQueryBuilder('t')
    if (payload.id != null) query.andWhere('t.id = :id', { id: payload.id })
    query.orderBy('t.id', 'DESC')
    return this.applyPagination(query, payload)
  }
}
