/**
 * El AppModule entero arranca contra la copia local de PROD (`srssui5_srs_20261107` en 127.0.0.1:3307), sin los
 * módulos de la plantilla (plans/plan-buenas-practicas-v0, cambio 1.1; el 7.3 le suma la carga de cada módulo vivo).
 * Solo `compile()`: resuelve toda la inyección y abre las conexiones, pero no corre onModuleInit ni
 * onApplicationBootstrap (ni crons ni la limpieza de corridas del runner de jobs): nada escribe en la base. Se salta
 * solo, con aviso, si la base no es la copia local.
 */
import 'dotenv/config'
import { PATH_METADATA } from '@nestjs/common/constants'
import { ModulesContainer } from '@nestjs/core'
import { Test, TestingModule } from '@nestjs/testing'
import { initializeTransactionalContext } from 'typeorm-transactional'

import { AppModule } from './app.module'

const LOCAL_COPY = 'srssui5_srs_20261107'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) console.warn(`SKIPPED app.module.boot-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307`)
const describeIf = ready ? describe : describe.skip

/** Lo que borró 1.1: si vuelve, este test lo marca. */
const TEMPLATE_MODULES = [
  'CommonsModule',
  'AuthModule',
  'UserModule',
  'CompanyModule',
  'RoleModule',
  'UserCompanyRelModule',
  'ParametricDataCategoryModule',
  'ParametricDataModule',
  'PermissionActionModule',
  'RolePermissionActionModule',
  'GeneralDataModule',
  'AuditLogModule',
  'UtilsModule',
  'HttpModule',
]
const TEMPLATE_PROVIDERS = ['AuditContextInterceptor', 'AuditContextService', 'CompanyInterceptor', 'HttpConfigService', 'AuthUtils']
const TEMPLATE_PATHS =
  /^\/?(users|roles|companies|auth|parametric-data|parametric-data-category|general-data|api\/user-company-rel|permission-action|role-permission-action|audit-log)(\/|$)/
const LIVE_MODULES = ['HealthModule', 'SrsBillingModule', 'SrsProductionModule', 'SrsExpensesModule', 'RolTemplateModule', 'JobsModule']

describeIf('AppModule — arranque contra la copia local (sin escribir)', () => {
  let moduleRef: TestingModule
  let moduleNames: string[]
  let providerNames: string[]
  let controllerPaths: string[]

  beforeAll(async () => {
    initializeTransactionalContext()
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const modules = [...moduleRef.get(ModulesContainer).values()]
    moduleNames = modules.map((m) => m.metatype?.name ?? '')
    providerNames = modules.flatMap((m) => [...m.providers.values()].map((p) => (p.metatype as { name?: string } | null)?.name ?? ''))
    controllerPaths = modules.flatMap((m) =>
      [...m.controllers.values()].map((c) => String(Reflect.getMetadata(PATH_METADATA, c.metatype as object) ?? '')),
    )
  }, 120000)

  afterAll(async () => {
    await moduleRef?.close()
  })

  it('arranca y monta los módulos vivos', () => {
    expect(moduleRef).toBeDefined()
    expect(LIVE_MODULES.filter((m) => !moduleNames.includes(m))).toEqual([])
    expect(controllerPaths).toContain('/health')
  })

  it('no monta ningún módulo, interceptor ni endpoint de la plantilla', () => {
    expect(moduleNames.filter((m) => TEMPLATE_MODULES.includes(m))).toEqual([])
    expect(providerNames.filter((p) => TEMPLATE_PROVIDERS.includes(p))).toEqual([])
    expect(controllerPaths.filter((p) => TEMPLATE_PATHS.test(p))).toEqual([])
  })
})
