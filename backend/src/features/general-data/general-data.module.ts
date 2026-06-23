import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { GeneralDataController } from './controller/general-data.controller'
import { GeneralData } from './entity/general-data.entity'
import { GeneralDataRepository } from './repository/general-data.repository'
import { GeneralDataService } from './service/general-data.service'

@Module({
  imports: [
    TypeOrmModule.forFeature([GeneralData]),
  ],
  providers: [GeneralDataRepository, GeneralDataService],
  controllers: [GeneralDataController],
  exports: [GeneralDataService],
})
export class GeneralDataModule {}
