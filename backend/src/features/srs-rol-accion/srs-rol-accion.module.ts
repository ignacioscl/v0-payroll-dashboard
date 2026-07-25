import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RolAccion } from './entity/rol-accion.entity'
import { RolAccionRepository } from './repository/rol-accion.repository'
import { RolAccionService } from './service/rol-accion.service'

@Module({
  imports: [TypeOrmModule.forFeature([RolAccion])],
  providers: [RolAccionRepository, RolAccionService],
  exports: [RolAccionService],
})
export class SrsRolAccionModule {}
