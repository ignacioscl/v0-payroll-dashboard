import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { RolePermissionActionController } from './controller/role-permission-action.controller'
import { RolePermissionAction } from './entity/role-permission-action.entity'
import { RolePermissionActionRepository } from './repository/role-permission-action.repository'
import { RolePermissionActionService } from './service/role-permission-action.service'

@Module({
  imports: [TypeOrmModule.forFeature([RolePermissionAction])],
  providers: [RolePermissionActionRepository, RolePermissionActionService],
  controllers: [RolePermissionActionController],
  exports: [RolePermissionActionService],
})
export class RolePermissionActionModule {}
