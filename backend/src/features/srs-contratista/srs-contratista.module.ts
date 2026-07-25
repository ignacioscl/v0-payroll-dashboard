import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { Contratista } from './entity/contratista.entity'
import { ContratistaRepository } from './repository/contratista.repository'
import { ContratistaService } from './service/contratista.service'

@Module({
  imports: [TypeOrmModule.forFeature([Contratista])],
  providers: [ContratistaRepository, ContratistaService],
  exports: [ContratistaService],
})
export class SrsContratistaModule {}
