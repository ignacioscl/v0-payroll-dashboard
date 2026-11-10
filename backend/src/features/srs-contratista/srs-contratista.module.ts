import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { ContratistaController } from './controller/contratista.controller'
import { Contratista } from './entity/contratista.entity'
import { CompanyModuleGuard } from './guard/company-module.guard'
import { ContratistaRepository } from './repository/contratista.repository'
import { ContratistaService } from './service/contratista.service'

@Module({
  imports: [SrsAuthModule, TypeOrmModule.forFeature([Contratista])],
  controllers: [ContratistaController],
  providers: [ContratistaRepository, ContratistaService, CompanyModuleGuard],
  exports: [ContratistaService, CompanyModuleGuard],
})
export class SrsContratistaModule {}
