import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { LogGeneric } from './entity/log-generic.entity'
import { LogGenericRepository } from './repository/log-generic.repository'
import { LogGenericService } from './service/log-generic.service'

/** LOG_GENERIC (legacy): histórico de gastos (tipo 7) y, con la 020, de grupos. */
@Module({
  imports: [TypeOrmModule.forFeature([LogGeneric])],
  providers: [LogGenericRepository, LogGenericService],
  exports: [LogGenericService],
})
export class SrsLogGenericModule {}
