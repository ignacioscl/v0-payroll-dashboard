import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ParametricDataController } from './controller/parametric-data.controller'
import { ParametricData } from './entity/parametric-data.entity'
import { ParametricDataRepository } from './repository/parametric-data.repository'
import { ParametricDataService } from './service/parametric-data.service'

@Module({
  imports: [TypeOrmModule.forFeature([ParametricData])],
  providers: [ParametricDataRepository, ParametricDataService],
  controllers: [ParametricDataController],
  exports: [ParametricDataService],
})
export class ParametricDataModule {}
