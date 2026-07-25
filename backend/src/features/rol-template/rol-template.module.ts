import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { SrsRolModule } from '../srs-rol/srs-rol.module'
import { SrsRolAccionModule } from '../srs-rol-accion/srs-rol-accion.module'
import { SrsUsuarioModule } from '../srs-usuario/srs-usuario.module'
import { SrsContratistaModule } from '../srs-contratista/srs-contratista.module'
import { RolTemplate } from './entity/rol-template.entity'
import { RolAccionRelTemplate } from './entity/rol-accion-rel-template.entity'
import { RolActivityLog } from './entity/rol-activity-log.entity'
import { RolTemplateRepository } from './repository/rol-template.repository'
import { RolAccionRelTemplateRepository } from './repository/rol-accion-rel-template.repository'
import { RolActivityLogRepository } from './repository/rol-activity-log.repository'
import { RolTemplateService } from './service/rol-template.service'
import { RolAccionRelTemplateService } from './service/rol-accion-rel-template.service'
import { RolActivityLogService } from './service/rol-activity-log.service'
import { RoleTemplateFacadeService } from './service/role-template-facade.service'
import { RolTemplateController } from './controller/rol-template.controller'

@Module({
  imports: [
    SrsAuthModule,
    forwardRef(() => SrsRolModule),
    SrsRolAccionModule,
    SrsUsuarioModule,
    SrsContratistaModule,
    TypeOrmModule.forFeature([RolTemplate, RolAccionRelTemplate, RolActivityLog]),
  ],
  providers: [
    RolTemplateRepository,
    RolAccionRelTemplateRepository,
    RolActivityLogRepository,
    RolTemplateService,
    RolAccionRelTemplateService,
    RolActivityLogService,
    RoleTemplateFacadeService,
  ],
  controllers: [RolTemplateController],
  exports: [RolTemplateService, RoleTemplateFacadeService, RolActivityLogService],
})
export class RolTemplateModule {}
