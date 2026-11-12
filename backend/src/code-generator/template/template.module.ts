import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { SrsAuthModule } from 'src/srs/auth/srs-auth.module'
import { TemplateController } from './controller/template'
import { Template } from './entity/template'
import { TemplateRepository } from './repository/template'
import { TemplateService } from './service/template'

@Module({
  // SrsAuthModule: SrsJwtGuard del controlador (JwtService + SrsAuthContextService).
  imports: [SrsAuthModule, TypeOrmModule.forFeature([Template])],
  providers: [TemplateRepository, TemplateService],
  controllers: [TemplateController],
  exports: [TemplateService],
})
export class TemplateModule {}
