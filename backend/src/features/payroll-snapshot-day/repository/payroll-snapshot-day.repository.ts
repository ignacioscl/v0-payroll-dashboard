import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { BaseRepository } from '../../../commons/repository/base.repository'
import { PaginationDto } from '../../../commons/pagination/Pagination.dto'
import { PayrollSnapshotDayQueryDto } from '../dto/payroll-snapshot-day.dto'
import { PayrollSnapshotDay } from '../entity/payroll-snapshot-day.entity'

export type PayrollSnapshotDayInsert = Omit<PayrollSnapshotDay, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>

@Injectable()
export class PayrollSnapshotDayRepository extends BaseRepository<PayrollSnapshotDay, PayrollSnapshotDayQueryDto> {
  constructor(
    @InjectRepository(PayrollSnapshotDay)
    private readonly _: Repository<PayrollSnapshotDay>,
  ) {
    super(_.target, _.manager, _.queryRunner)
  }

  public async fetch(payload: PayrollSnapshotDayQueryDto): Promise<PaginationDto<PayrollSnapshotDay>> {
    const query = this.createQueryBuilder('p')
    if (payload.id != null) query.andWhere('p.id = :id', { id: payload.id })
    if (payload.idContratista != null) query.andWhere('p.idContratista = :c', { c: payload.idContratista })
    if (payload.periodoDesde) query.andWhere('p.periodoDesde = :d', { d: payload.periodoDesde })
    return this.applyPagination(query, {})
  }

  /** Borra todas las filas de un (empresa, período). Usa `idx_psd_periodo`. */
  async deletePeriod(idContratista: number, periodoDesde: string): Promise<number> {
    const res = await this.createQueryBuilder()
      .delete()
      .from(PayrollSnapshotDay)
      .where('id_contratista = :c AND periodo_desde = :d', { c: idContratista, d: periodoDesde })
      .execute()
    return res.affected ?? 0
  }

  async insertRows(rows: PayrollSnapshotDayInsert[]): Promise<void> {
    if (!rows.length) return
    await this.createQueryBuilder().insert().into(PayrollSnapshotDay).values(rows).updateEntity(false).execute()
  }
}
