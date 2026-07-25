import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsRolModule } from '../srs-rol/srs-rol.module'
import { UsuarioSrs } from './entity/usuario-srs.entity'
import { UsuarioSrsRepository } from './repository/usuario-srs.repository'
import { UsuarioSrsService } from './service/usuario-srs.service'

@Module({
  imports: [forwardRef(() => SrsRolModule), TypeOrmModule.forFeature([UsuarioSrs])],
  providers: [UsuarioSrsRepository, UsuarioSrsService],
  exports: [UsuarioSrsService],
})
export class SrsUsuarioModule {}
