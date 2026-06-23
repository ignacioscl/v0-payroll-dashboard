import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { PermissionAction } from './entity/permission-action.entity'
import { PermissionActionController } from './controller/permission-action.controller'
import { PermissionActionService } from './service/permission-action.service'
import { PermissionActionRepository } from './repository/permission-action.repository'

@Module({
  imports: [TypeOrmModule.forFeature([PermissionAction])],
  controllers: [PermissionActionController],
  providers: [PermissionActionService, PermissionActionRepository],
  exports: [PermissionActionService, PermissionActionRepository],
})
export class PermissionActionModule {}
