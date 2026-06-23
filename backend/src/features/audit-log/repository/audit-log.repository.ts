import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { AuditLog } from '../entity/audit-log.entity'
import { BaseRepository } from 'src/commons/repository/base.repository'
import { AuditLogQueryDto } from '../dto/audit-log.dto'
import { PaginationDto } from 'src/commons/pagination/Pagination.dto'

@Injectable()
export class AuditLogRepository extends BaseRepository<AuditLog, AuditLogQueryDto> {
  constructor(@InjectRepository(AuditLog) private readonly _: Repository<AuditLog>) {
    super(_.target, _.manager, _.queryRunner)
  }
  public async fetch(payload: AuditLogQueryDto): Promise<PaginationDto<AuditLog>> {
    const { id, tableName, recordId } = payload

    const query = this.createQueryBuilder('al').leftJoinAndSelect('al.user', 'user').orderBy('al.createdAt', 'DESC')

    if (id) {
      query.andWhere('al.id = :id', { id })
    }

    if (tableName) {
      query.andWhere('al.tableName = :tableName', { tableName })
    }

    if (recordId) {
      query.andWhere('al.recordId = :recordId', { recordId })
    }

    return await this.applyPagination(query, payload)
  }

  /**
   * Obtiene los recordId únicos que tienen logs para una tabla específica
   * @param tableName Nombre de la tabla
   * @param recordIds Array de recordId a verificar
   * @returns Set con los recordId que tienen logs
   */
  public async getRecordIdsWithLogs(tableName: string, recordIds: number[]): Promise<Set<number>> {
    if (recordIds.length === 0) {
      return new Set<number>()
    }

    const result = await this.createQueryBuilder('al')
      .select('DISTINCT al.recordId', 'recordId')
      .where('al.tableName = :tableName', { tableName })
      .andWhere('al.recordId IN (:...recordIds)', { recordIds })
      .getRawMany()

    return new Set(result.map(row => row.recordId))
  }
}
