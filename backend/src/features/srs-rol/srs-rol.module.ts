import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsContratistaModule } from '../srs-contratista/srs-contratista.module'
import { Contratista } from '../srs-contratista/entity/contratista.entity'
import { Rol } from './entity/rol.entity'
import { RolAccionRel } from './entity/rol-accion-rel.entity'
import { RolRepository } from './repository/rol.repository'
import { RolAccionRelRepository } from './repository/rol-accion-rel.repository'
import { SrsRolService } from './service/srs-rol.service'
import { RolAccionRelService } from './service/rol-accion-rel.service'
import { SrsRolController } from './controller/srs-rol.controller'
import { SrsRolFacadeService } from './service/srs-rol-facade.service'
import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { SrsRolAccionModule } from '../srs-rol-accion/srs-rol-accion.module'
import { SrsUsuarioModule } from '../srs-usuario/srs-usuario.module'
import { RolTemplateModule } from '../rol-template/rol-template.module'

@Module({
  imports: [
    SrsContratistaModule,
    SrsAuthModule,
    SrsRolAccionModule,
    forwardRef(() => SrsUsuarioModule),
    forwardRef(() => RolTemplateModule),
    TypeOrmModule.forFeature([Rol, RolAccionRel, Contratista]),
  ],
  providers: [
    RolRepository,
    RolAccionRelRepository,
    SrsRolService,
    RolAccionRelService,
    SrsRolFacadeService,
  ],
  controllers: [SrsRolController],
  exports: [SrsRolService, RolAccionRelService],
})
export class SrsRolModule {}
