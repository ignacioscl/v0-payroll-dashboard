import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { ContratistaController } from './controller/contratista.controller'
import { Contratista } from './entity/contratista.entity'
import { ContratistaRepository } from './repository/contratista.repository'
import { ContratistaService } from './service/contratista.service'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([Contratista])],
  controllers: [ContratistaController],
  providers: [ContratistaRepository, ContratistaService],
  exports: [ContratistaService],
})
export class SrsContratistaModule {}
