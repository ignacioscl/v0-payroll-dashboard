import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { LogChange } from './entity/log-change.entity'
import { LogChangeRepository } from './repository/log-change.repository'
import { LogChangeService } from './service/log-change.service'

/** LOG_CHANGE (legacy): histórico de las reglas recurrentes desde Pro (`origen = 'pro'`). */
@Module({
  imports: [TypeOrmModule.forFeature([LogChange])],
  providers: [LogChangeRepository, LogChangeService],
  exports: [LogChangeService],
})
export class SrsLogChangeModule {}
