import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from '../../../commons/repository/base.repository'
import { PaginationDto } from '../../../commons/pagination/Pagination.dto'
import { OpenInvoiceSnapshotQueryDto } from '../dto/open-invoice-snapshot.dto'
import { OpenInvoiceSnapshot } from '../entity/open-invoice-snapshot.entity'

export type OpenInvoiceSnapshotInsert = Omit<OpenInvoiceSnapshot, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

/** The columns of the list: everything but `rows_json` and `payments_json` (the heavy ones). */
const HEADER_COLUMNS = [
  'o.id',
  'o.idDealerProvider',
  'o.idUsuario',
  'o.generatedAt',
  'o.asOf',
  'o.dealerIds',
  'o.includeRemoved',
  'o.total',
  'o.rowCount',
  'o.dealerTotalsJson',
] as const

@Injectable()
export class OpenInvoiceSnapshotRepository extends BaseRepository<OpenInvoiceSnapshot, OpenInvoiceSnapshotQueryDto> {
  constructor(
    @InjectRepository(OpenInvoiceSnapshot)
    private readonly _: Repository<OpenInvoiceSnapshot>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: OpenInvoiceSnapshotQueryDto): Promise<PaginationDto<OpenInvoiceSnapshot>> {
    const query = this.createQueryBuilder('o')
    if (payload.id != null) query.andWhere('o.id = :id', { id: payload.id })
    if (payload.idDealerProvider != null) query.andWhere('o.idDealerProvider = :p', { p: payload.idDealerProvider })
    return this.applyPagination(query, {})
  }

  /** Inserts one snapshot and returns its id. */
  async insertOne(row: OpenInvoiceSnapshotInsert): Promise<number> {
    const res = await this.createQueryBuilder().insert().into(OpenInvoiceSnapshot).values(row).updateEntity(false).execute()
    const id = Number(res.identifiers?.[0]?.id ?? res.raw?.insertId)
    if (!Number.isInteger(id) || id <= 0) throw new Error('OPEN_INVOICE_SNAPSHOT: insert without id')
    return id
  }

  /** A page of the company's snapshots, newest first, without their rows. */
  async listByProvider(
    idDealerProvider: number,
    page: number,
    pageSize: number,
  ): Promise<{ rows: OpenInvoiceSnapshot[]; total: number }> {
    const [rows, total] = await this.createQueryBuilder('o')
      .select([...HEADER_COLUMNS])
      .where('o.idDealerProvider = :p', { p: idDealerProvider })
      .orderBy('o.generatedAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount()
    return { rows, total }
  }

  /**
   * Every snapshot header of the company, newest first, without their rows: for users with assigned
   * dealers, whose list is filtered in the service before paging (§3.6, step 3).
   */
  async listHeadersByProvider(idDealerProvider: number): Promise<OpenInvoiceSnapshot[]> {
    return this.createQueryBuilder('o')
      .select([...HEADER_COLUMNS])
      .where('o.idDealerProvider = :p', { p: idDealerProvider })
      .orderBy('o.generatedAt', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .getMany()
  }

  /** One whole snapshot, only of this company. */
  async findOneByProvider(id: number, idDealerProvider: number): Promise<OpenInvoiceSnapshot | null> {
    return this.createQueryBuilder('o')
      .where('o.id = :id AND o.idDealerProvider = :p', { id, p: idDealerProvider })
      .getOne()
  }
}
