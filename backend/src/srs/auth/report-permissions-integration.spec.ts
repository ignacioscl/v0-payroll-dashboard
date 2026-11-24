/**
 * Un permiso por reporte (tema 10 de plans/plan-reunion-juan-18-11) contra la copia local (`srssui5_srs_20261112` en
 * 127.0.0.1:3307), con el permiso de verdad (`SrsPermissionRepository` contra ROL_ACCION_REL) y el módulo de verdad
 * (`CONTRATISTA.has_window_tint_closing`). Necesita la migration 033 y el usuario NO admin del e2e (`e2e.reports`, de
 * `plans/plan-reunion-juan-18-11/usuario-e2e-reportes.php`); sin ellos se salta, con aviso.
 *
 * Le saca a su rol los seis permisos de reportes, le da solo Monthly Closing (151) y al final lo deja como estaba.
 * Ninguna consulta llega a los datos del reporte: el mes inválido corta con 400 después del permiso y del módulo.
 */
import 'dotenv/config'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { addTransactionalDataSource, initializeTransactionalContext } from 'typeorm-transactional'

import configuration from 'src/configuration'
import { dataSourceOptions } from 'src/typeorm.config'
import { SRS_CONNECTION, srsDataSourceOptions } from 'src/srs/srs.datasource'
import { SrsContext } from './srs-auth-context.service'
import { ROL_ACCION_REPORT_MONTHLY_CLOSING } from './srs-permission.repository'
import { SrsMonthlyClosingModule } from '../monthly-closing/monthly-closing.module'
import { MonthlyClosingService } from '../monthly-closing/service/monthly-closing.service'
import { BillingKpiService } from '../billing/service/billing-kpi.service'
import { OpenInvoicesService } from '../billing/service/open-invoices.service'

const LOCAL_COPY = 'srssui5_srs_20261112'
const ready = process.env.DB_DATABASE === LOCAL_COPY && process.env.DB_PORT === '3307'
if (!ready) console.warn(`SKIPPED report-permissions-integration.spec.ts: la base no es la copia local ${LOCAL_COPY} en 127.0.0.1:3307`)
const describeIf = ready ? describe : describe.skip

const AUTO_WAX = 79 // único con el módulo «Closing reports»
const GC = 188 // sin el módulo
const E2E_LOGIN = 'e2e.reports'
const REPORT_IDS = [148, 149, 150, 151, 152, 153]
const KPI = { fechaDesde: '2026-10-01', fechaHasta: '2026-10-31', idDealer: '76' } as never

describeIf('Un permiso por reporte — contra la copia local', () => {
  let moduleRef: TestingModule
  let srs: DataSource
  let closing: MonthlyClosingService
  let billing: BillingKpiService
  let openInvoices: OpenInvoicesService
  let user: { id: number; rol: number } | null = null
  let before: number[] = []

  const ctxOf = (idUsuario: number, idRol: number, idDealerProvider: number): SrsContext => ({
    idUsuario,
    idUsuarioRolrel: null,
    idRol,
    idDealerProvider,
    isUserDealer: false,
    isActive: true,
  })
  const badMonth = (scope: 'all' | 'tint') => ({ month: 'bad', idDealer: '76', scope }) as never
  const openInvoicesQuery = { asOf: '2026-09-27', idDealer: '76' } as never

  beforeAll(async () => {
    initializeTransactionalContext()
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ load: [configuration], isGlobal: true }),
        TypeOrmModule.forRootAsync({
          useFactory: () => dataSourceOptions,
          dataSourceFactory: async (options) => addTransactionalDataSource(new DataSource(options ?? dataSourceOptions)),
        }),
        TypeOrmModule.forRootAsync({ name: SRS_CONNECTION, useFactory: () => srsDataSourceOptions }),
        SrsMonthlyClosingModule,
      ],
    }).compile()
    srs = moduleRef.get(`${SRS_CONNECTION}DataSource`) as DataSource
    closing = moduleRef.get(MonthlyClosingService)
    billing = moduleRef.get(BillingKpiService, { strict: false })
    openInvoices = moduleRef.get(OpenInvoicesService, { strict: false })

    const migrated: { n: number }[] = await srs.query('SELECT COUNT(*) AS n FROM ROL_ACCION WHERE id BETWEEN 148 AND 153')
    const rows: { id: number; rol: number }[] = await srs.query(
      `SELECT u.id_usuario AS id, urr.id_rol AS rol FROM usuarios u
         JOIN USUARIO_ROL_REL urr ON urr.id_usuario = u.id_usuario
        WHERE u.login = ? AND u.id_contratista_owner = ? AND urr.id_rol NOT IN (1, 2)`,
      [E2E_LOGIN, AUTO_WAX],
    )
    if (Number(migrated[0]?.n) !== 6 || rows.length !== 1) {
      console.warn('SKIPPED report-permissions-integration.spec.ts: falta la migration 033 o el usuario e2e.reports')
      return
    }
    user = { id: Number(rows[0].id), rol: Number(rows[0].rol) }
    const had: { id: number }[] = await srs.query(
      `SELECT id_rol_accion AS id FROM ROL_ACCION_REL WHERE id_rol = ? AND id_rol_accion IN (${REPORT_IDS.join(',')})`,
      [user.rol],
    )
    before = had.map((r) => Number(r.id))
    await srs.query(`DELETE FROM ROL_ACCION_REL WHERE id_rol = ? AND id_rol_accion IN (${REPORT_IDS.join(',')})`, [user.rol])
  }, 60000)

  afterAll(async () => {
    if (user) {
      await srs.query(`DELETE FROM ROL_ACCION_REL WHERE id_rol = ? AND id_rol_accion IN (${REPORT_IDS.join(',')})`, [user.rol])
      for (const id of before) {
        await srs.query('INSERT INTO ROL_ACCION_REL (id_rol, id_rol_accion) VALUES (?, ?)', [user.rol, id])
      }
    }
    await moduleRef?.close()
  })

  it('sin ninguno de los seis: 403 en Business KPIs, Income by Dealer, los dos cierres y Open Invoices', async () => {
    if (!user) return
    const me = ctxOf(user.id, user.rol, AUTO_WAX)
    await expect(billing.getBillingKpis(me, KPI)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(billing.getIncomeByDealer(me, KPI)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(closing.getSummary(me, badMonth('all'))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(closing.getSummary(me, badMonth('tint'))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(openInvoices.getReport(me, openInvoicesQuery)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('con solo Monthly Closing (151): pasa Monthly Closing y nada más', async () => {
    if (!user) return
    await srs.query('INSERT INTO ROL_ACCION_REL (id_rol, id_rol_accion) VALUES (?, ?)', [
      user.rol,
      ROL_ACCION_REPORT_MONTHLY_CLOSING,
    ])
    const me = ctxOf(user.id, user.rol, AUTO_WAX)
    await expect(closing.getSummary(me, badMonth('all'))).rejects.toBeInstanceOf(BadRequestException)
    await expect(closing.getSummary(me, badMonth('tint'))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(openInvoices.getReport(me, openInvoicesQuery)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(billing.getBillingKpis(me, KPI)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('el admin pasa el permiso pero no el módulo: Auto Wax entra, GC Installations no', async () => {
    if (!user) return
    const autoWaxAdmin = ctxOf(76, 2, AUTO_WAX)
    const gcAdmin = ctxOf(1, 2, GC)
    await expect(closing.getSummary(autoWaxAdmin, badMonth('all'))).rejects.toBeInstanceOf(BadRequestException)
    await expect(closing.getSummary(autoWaxAdmin, badMonth('tint'))).rejects.toBeInstanceOf(BadRequestException)
    await expect(openInvoices.assertAccess(autoWaxAdmin)).resolves.toBeUndefined()
    await expect(closing.getSummary(gcAdmin, badMonth('all'))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(closing.getSummary(gcAdmin, badMonth('tint'))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(openInvoices.assertAccess(gcAdmin)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
