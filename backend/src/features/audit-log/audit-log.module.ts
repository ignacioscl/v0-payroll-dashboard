import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { AuditLogController } from './controller/audit-log.controller'
import { AuditLog } from './entity/audit-log.entity'
import { AuditLogRepository } from './repository/audit-log.repository'
import { AuditLogService } from './service/audit-log.service'
import { AuditService } from './service/audit.service'
import { AuditContextService } from './service/audit-context.service'
import { AuditSubscriber } from './subscriber/audit.subscriber'
import { AuditContextInterceptor } from './interceptor/audit-context.interceptor'
import { UserModule } from '../user/user.module'

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), forwardRef(() => UserModule)],
  providers: [
    AuditLogRepository,
    AuditLogService,
    AuditService,
    AuditContextService,
    AuditSubscriber,
    AuditContextInterceptor,
  ],
  controllers: [AuditLogController],
  exports: [
    AuditLogRepository,
    AuditLogService,
    AuditService,
    AuditContextService,
    AuditSubscriber,
    AuditContextInterceptor,
  ],
})
export class AuditLogModule {}
