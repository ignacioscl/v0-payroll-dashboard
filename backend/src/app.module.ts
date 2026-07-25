import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ServeStaticModule } from '@nestjs/serve-static'
import { TypeOrmModule } from '@nestjs/typeorm'
import { join } from 'path'

import { dataSourceOptions } from './typeorm.config'

import { CommonsModule } from './commons/commons.module'
import { AuthModule } from './features/auth/auth.module'
import { UserModule } from './features/user/user.module'

import { HttpModule } from '@nestjs/axios'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource } from 'typeorm-transactional'
import { HttpConfigService } from './commons/http/http.config.service'

import configuration from './configuration'

import { APP_INTERCEPTOR } from '@nestjs/core'
import { TrimResponseInterceptor } from './commons/interceptor/trim.interceptor'
import { LoggerSystemModule } from './commons/logs/logger.system.module'
import { CompanyModule } from './features/company/company.module'
import { AuditContextInterceptor } from './features/audit-log/interceptor/audit-context.interceptor'

import { RoleModule } from './features/role/role.module'

import { UserCompanyRelModule } from './features/user.company.rel/user.company.rel.module'
import { ParametricDataCategoryModule } from './features/parametric-data-category/parametric-data-category.module'
import { ParametricDataModule } from './features/parametric-data/parametric-data.module'
import { PermissionActionModule } from './features/permission-action/permission-action.module'
import { RolePermissionActionModule } from './features/role-permission-action/role-permission-action.module'
import { GeneralDataModule } from './features/general-data/general-data.module'
import { AuditLogModule } from './features/audit-log/audit-log.module'

// --- SRS Suite ---
import { srsDataSourceOptions, SRS_CONNECTION } from './srs/srs.datasource'
import { HealthModule } from './features/health/health.module'
import { SrsProductionModule } from './srs/production/srs-production.module'
import { SrsBillingModule } from './srs/billing/srs-billing.module'
import { SrsCollectionsModule } from './srs/collections/srs-collections.module'
import { SrsPunchModule } from './srs/punch/srs-punch.module'
import { SrsPayrollModule } from './srs/payroll/srs-payroll.module'
import { RolTemplateModule } from './features/rol-template/rol-template.module'
//ImportTemplateModule
//NO BORRAR LA LINEA DE ARRIBA
HttpModule.registerAsync({
  imports: [ConfigModule],
  useExisting: HttpConfigService,
})

@Module({
  imports: [
    HttpModule,
    LoggerSystemModule,
    ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory() {
        return dataSourceOptions
      },
      async dataSourceFactory(options) {
        if (!options) {
          throw new Error('Invalid options passed')
        }

        return addTransactionalDataSource(new DataSource(dataSourceOptions))
      },
    }),
    // Conexión nombrada a la base LEGACY de SRS (solo lectura, synchronize:false).
    TypeOrmModule.forRootAsync({
      name: SRS_CONNECTION,
      useFactory() {
        return srsDataSourceOptions
      },
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
    }),
    CommonsModule,
    UserModule,
    AuthModule,

    CompanyModule,
    RoleModule,
    UserCompanyRelModule,
    ParametricDataCategoryModule,
    ParametricDataModule,
    PermissionActionModule,
    RolePermissionActionModule,
    GeneralDataModule,
    AuditLogModule,
    HealthModule,
    SrsProductionModule,
    SrsBillingModule,
    SrsCollectionsModule,
    SrsPunchModule,
    SrsPayrollModule,
    RolTemplateModule,
    //TemplateModule
    //NO BORRAR LA LINEA DE ARRIBA
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TrimResponseInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditContextInterceptor,
    },
  ],
})
export class AppModule {}
