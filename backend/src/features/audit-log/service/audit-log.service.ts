import { Inject, Injectable } from '@nestjs/common'

import { GlobalBaseService } from 'src/commons/service/global.base.service'
import { AuditLogQueryDto } from '../dto/audit-log.dto'
import { AuditLog } from '../entity/audit-log.entity'
import { AuditLogRepository } from '../repository/audit-log.repository'

@Injectable()
export class AuditLogService extends GlobalBaseService<AuditLog, AuditLogQueryDto> {
  constructor(@Inject(AuditLogRepository) private readonly repository: AuditLogRepository) {
    super()
  }

  protected getRepository(): AuditLogRepository {
    return this.repository
  }
}
