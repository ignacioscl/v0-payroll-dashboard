import { ForbiddenException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common'
import ExcelJS from 'exceljs'
import type { Response } from 'express'
import { PassThrough } from 'stream'

import { SrsContext } from '../../auth/srs-auth-context.service'
import { SrsPermissionRepository } from '../../auth/srs-permission.repository'
import type {
  PunchDealerRankingEmployeeRow,
  PunchDealerRankingExportPrepareDto,
  PunchDealerRankingRowDto,
} from '../dto/punch-dealer-ranking.dto'
import { PunchAccessPolicyService } from '../punch-access-policy'
import { PunchExportSemaphore } from '../punch-export-semaphore'
import { PunchExportTicketStore } from '../punch-export-ticket.store'
import { PunchDealerRankingRepository } from '../repository/punch-dealer-ranking.repository'
import { PunchDealerRankingExportService } from './punch-dealer-ranking-export.service'

const CTX: SrsContext = {
  idUsuario: 10,
  idUsuarioRolrel: null,
  idRol: 5,
  idDealerProvider: 79,
  isUserDealer: false,
}

const DEALER_NAME = 'AutoNation Mercedes-Benz of Coconut Creek'

const DEALER: PunchDealerRankingRowDto = {
  idDealer: 85,
  dealerName: DEALER_NAME,
  total: 6,
  punches: 3,
  byType: { clockOutMissing: 2, breakMissing: 3, shift20hPlus: 1 },
}

const EMPLOYEE: PunchDealerRankingEmployeeRow = {
  ...DEALER,
  idEmployee: 9922,
  employeeName: 'Ana Perez',
  total: 4,
  punches: 2,
}

const BODY: PunchDealerRankingExportPrepareDto = {
  fechaDesde: '2026-08-01',
  fechaHasta: '2026-09-30',
  idDealer: '85',
  status: 'corrected',
}

type World = {
  /** Acciones de rol que tiene el usuario (65 = Time Tracking > Hours Admin.). */
  allowed: number[]
  /** Cuántos de los dealers pedidos tienen fila en DEALER_REL del provider. */
  relCount: number
  /** `CONTRATISTA.type_nav_template` del provider: 2 = español. */
  navTemplate: number
}

function setup(world: World) {
  const perms = {
    userHasRolAccion: jest.fn(async (_c: SrsContext, id: number) => world.allowed.includes(id)),
  } as unknown as SrsPermissionRepository
  const srs = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('DEALER_REL')) return [{ n: world.relCount }]
      if (sql.includes('COUNT(DISTINCT c.id)')) return [{ n: 1 }]
      if (sql.includes('type_nav_template')) return [{ type_nav_template: world.navTemplate }]
      if (sql.includes('FROM usuarios')) return [{ nombre: 'Ada Lovelace' }]
      if (sql.includes('GET_DEALER_NAME_BY_PROVIDER')) return [{ name: DEALER_NAME }]
      return []
    }),
  }
  const repository = {
    getPendingByDealer: jest.fn(async () => [{ ...DEALER, punches: null }]),
    getCorrectedByDealer: jest.fn(async () => [DEALER]),
    getPendingByEmployee: jest.fn(async () => [{ ...EMPLOYEE, punches: null }]),
    getCorrectedByEmployee: jest.fn(async () => [EMPLOYEE]),
  }
  const semaphore = new PunchExportSemaphore()
  const tickets = new PunchExportTicketStore()
  const policy = new PunchAccessPolicyService(perms, srs as never)
  const service = new PunchDealerRankingExportService(
    policy,
    semaphore,
    tickets,
    repository as unknown as PunchDealerRankingRepository,
    srs as never,
  )
  return { service, semaphore, tickets, repository }
}

function fakeResponse() {
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', (c: Buffer) => chunks.push(c))
  const finished = new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve)
    stream.on('error', reject)
  })
  const headers = new Map<string, string>()
  const res = Object.assign(stream, {
    headersSent: false,
    setHeader: (name: string, value: string) => {
      headers.set(name, value)
    },
    removeHeader: (name: string) => {
      headers.delete(name)
    },
  })
  return { res: res as unknown as Response, chunks, finished, headers }
}

async function loadWorkbook(chunks: Buffer[]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.concat(chunks))
  return wb
}

function rowValues(sheet: ExcelJS.Worksheet, row: number): unknown[] {
  return (sheet.getRow(row).values as unknown[]).slice(1)
}

function infoRows(wb: ExcelJS.Workbook): [unknown, unknown][] {
  const out: [unknown, unknown][] = []
  wb.getWorksheet('Report Info')!.eachRow((row, n) => {
    if (n > 1) out.push([row.getCell(1).value, row.getCell(2).value])
  })
  return out
}

describe('PunchDealerRankingExportService', () => {
  it('prepare sin Time Tracking > Hours Admin. (65) da 403 y libera el semáforo', async () => {
    const { service, semaphore } = setup({ allowed: [], relCount: 1, navTemplate: 1 })
    await expect(service.prepare(CTX, BODY)).rejects.toBeInstanceOf(ForbiddenException)
    expect(semaphore.tryAcquire()).toBe(true)
  })

  it('prepare con un dealer sin fila en DEALER_REL del provider da 403 y libera el semáforo', async () => {
    const { service, semaphore } = setup({ allowed: [65], relCount: 0, navTemplate: 1 })
    await expect(service.prepare(CTX, BODY)).rejects.toThrow(
      'One or more dealers are outside your scope.',
    )
    expect(semaphore.tryAcquire()).toBe(true)
  })

  it('con otro export corriendo (el de Punch Report comparte el cupo) da 429', async () => {
    const { service, semaphore } = setup({ allowed: [65], relCount: 1, navTemplate: 1 })
    expect(semaphore.tryAcquire()).toBe(true)
    const err = await service.prepare(CTX, BODY).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpException)
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
  })

  it('el ticket del prepare es del ranking: la ruta de Punch Report no lo ve', async () => {
    const { service, tickets } = setup({ allowed: [65], relCount: 1, navTemplate: 1 })
    const { ticket } = await service.prepare(CTX, BODY)
    expect(() => tickets.getStatus(ticket, CTX.idUsuario)).toThrow(NotFoundException)
    expect(() => tickets.consumeForDownload(ticket, CTX.idUsuario)).toThrow(NotFoundException)
    expect(service.getStatus(CTX, ticket).status).toBe('pending')
  })

  it('la descarga revalida el gate: sin el permiso al momento del click da 403 y el ticket queda en error', async () => {
    const world = { allowed: [65], relCount: 1, navTemplate: 1 }
    const { service, semaphore } = setup(world)
    const { ticket } = await service.prepare(CTX, BODY)

    world.allowed = []
    const { res, headers } = fakeResponse()
    await expect(service.download(CTX, ticket, res)).rejects.toBeInstanceOf(ForbiddenException)
    expect(service.getStatus(CTX, ticket).status).toBe('error')
    expect(headers.size).toBe(0)
    expect(semaphore.tryAcquire()).toBe(true)
  })

  it('Corrected desde antes del 27/08/2026, provider en español: tres hojas y el aviso con 08/27/2026', async () => {
    const { service, semaphore, repository } = setup({ allowed: [65], relCount: 1, navTemplate: 2 })
    const { ticket } = await service.prepare(CTX, BODY)
    const { res, chunks, finished, headers } = fakeResponse()
    await service.download(CTX, ticket, res)
    await finished

    expect(repository.getCorrectedByDealer).toHaveBeenCalledTimes(1)
    expect(repository.getCorrectedByEmployee).toHaveBeenCalledTimes(1)
    expect(repository.getPendingByDealer).not.toHaveBeenCalled()
    expect(repository.getPendingByEmployee).not.toHaveBeenCalled()
    expect(headers.get('Content-Disposition')).toMatch(
      /filename="dealers_ranking_\d{2}-\d{2}-\d{4}_\d{2}-\d{2}_(AM|PM)\.xlsx"/,
    )
    expect(service.getStatus(CTX, ticket).status).toBe('done')
    expect(semaphore.tryAcquire()).toBe(true)

    const wb = await loadWorkbook(chunks)
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Report Info', 'Dealers', 'Employees'])

    const notice =
      'Las correcciones se registran desde el 08/27/2026. Antes de esa fecha la historia puede estar incompleta.'
    const info = infoRows(wb)
    expect(info[0]).toEqual(['Reporte', 'Sucursales con más errores corregidos'])
    expect(info).toContainEqual(['Generado por', 'Ada Lovelace'])
    expect(info).toContainEqual(['Período', '08/01/2026 hasta 09/30/2026'])
    expect(info).toContainEqual(['Sucursales', DEALER_NAME])
    expect(info).toContainEqual(['Estado', 'Corregidos'])
    expect(info).toContainEqual(['Tipos de error', 'Todos'])
    expect(info).toContainEqual(['Búsqueda', 'Todos'])
    expect(info[info.length - 1]).toEqual(['Aviso', notice])

    const dealers = wb.getWorksheet('Dealers')!
    expect(String(dealers.getCell('A1').value)).toContain('Sucursales con más errores corregidos')
    expect(dealers.getCell('A2').value).toBe(notice)
    expect(rowValues(dealers, 3)).toEqual([
      '#',
      'Sucursal',
      'Correcciones',
      'Ponchadas',
      'Sin salida',
      'Sin descanso',
      'Turno 20h+',
    ])
    // Números como número, no como texto.
    expect(rowValues(dealers, 4)).toEqual([1, DEALER_NAME, 6, 3, 2, 3, 1])

    const employees = wb.getWorksheet('Employees')!
    expect(employees.getCell('A2').value).toBe(notice)
    expect(rowValues(employees, 3)).toEqual([
      '#',
      'Empleado',
      'Sucursal',
      'Correcciones',
      'Ponchadas',
      'Sin salida',
      'Sin descanso',
      'Turno 20h+',
    ])
    expect(rowValues(employees, 4)).toEqual([1, 'Ana Perez', DEALER_NAME, 4, 2, 2, 3, 1])
  })

  it('Pending con un tipo excluido, en inglés: sin aviso y sin la columna del tipo excluido', async () => {
    const { service, repository } = setup({ allowed: [65], relCount: 1, navTemplate: 1 })
    const { ticket } = await service.prepare(CTX, {
      ...BODY,
      fechaDesde: '2026-04-01',
      status: 'pending',
      errorTypes: '1,3',
      search: '  Perez ',
    })
    const { res, chunks, finished } = fakeResponse()
    await service.download(CTX, ticket, res)
    await finished

    expect(repository.getPendingByDealer).toHaveBeenCalledTimes(1)
    expect(repository.getPendingByEmployee).toHaveBeenCalledTimes(1)
    expect(repository.getCorrectedByDealer).not.toHaveBeenCalled()

    const wb = await loadWorkbook(chunks)
    const info = infoRows(wb)
    expect(info[0]).toEqual(['Report', 'Dealers with most errors'])
    expect(info).toContainEqual(['Status', 'Pending'])
    expect(info).toContainEqual(['Error types', 'Without clock out, Shift 20h+'])
    expect(info).toContainEqual(['Search', 'Perez'])
    expect(info.map(([field]) => field)).not.toContain('Notice')

    const dealers = wb.getWorksheet('Dealers')!
    expect(rowValues(dealers, 2)).toEqual(['#', 'Dealer', 'Errors', 'Without clock out', 'Shift 20h+'])
    expect(rowValues(dealers, 3)).toEqual([1, DEALER_NAME, 6, 2, 1])

    const employees = wb.getWorksheet('Employees')!
    expect(rowValues(employees, 2)).toEqual([
      '#',
      'Employee',
      'Dealer',
      'Errors',
      'Without clock out',
      'Shift 20h+',
    ])
  })
})
