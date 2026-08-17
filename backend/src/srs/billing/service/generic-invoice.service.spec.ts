import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'

import { GenericInvoiceService } from './generic-invoice.service'

const ctx = {
  idUsuario: 10,
  idUsuarioRolrel: null,
  idRol: 5,
  idDealerProvider: 79,
  isUserDealer: false,
}

function buildService(overrides?: {
  gates?: { hasGenericInvoice: boolean; typeEfectivo: number | null }
  dealerRel?: boolean
  restriction?: boolean
  freeze?: number
  create?: () => Promise<{ id: number; invoiceNro: number; fullNro: string }>
  deleteAffected?: number
  hasRol?: (id: number) => boolean
}) {
  const hasRol = overrides?.hasRol ?? ((id: number) => id === 15 || id === 16)
  const repository = {
    loadCompanyGates: jest.fn().mockResolvedValue(
      overrides?.gates ?? { hasGenericInvoice: true, typeEfectivo: 2 },
    ),
    dealerRelExists: jest.fn().mockResolvedValue(overrides?.dealerRel ?? true),
    restrictionDealerAllows: jest.fn().mockResolvedValue(overrides?.restriction ?? true),
    checkDateFreeze: jest.fn().mockResolvedValue(overrides?.freeze ?? 1),
    upsertCatalogItem: jest.fn().mockResolvedValue(undefined),
    upsertCatalogHeaderNote: jest.fn().mockResolvedValue(undefined),
    createStatement: jest.fn().mockImplementation(
      overrides?.create ??
        (async () => ({ id: 1, invoiceNro: 10, fullNro: 'AW10' })),
    ),
    listCatalog: jest.fn().mockResolvedValue([]),
    softDeleteCatalogItem: jest.fn().mockResolvedValue(overrides?.deleteAffected ?? 1),
  }
  const permissions = {
    userHasRolAccion: jest.fn(async (_c: unknown, id: number) => hasRol(id)),
    assertRolAccion: jest.fn(async (_c: unknown, id: number) => {
      if (!hasRol(id)) throw new ForbiddenException('Forbidden')
    }),
  }
  const service = new GenericInvoiceService(repository as any, permissions as any)
  return { service, repository, permissions }
}

const happyDto = {
  idDealer: 100,
  dateFrom: '2026-08-01',
  dateTo: '2026-08-07',
  items: [
    { description: 'Detail', unitAmount: 50, qty: 2 },
    { description: 'Wax', unitAmount: -10 },
  ],
}

describe('GenericInvoiceService.create', () => {
  it('403 without Create Invoice', async () => {
    const { service } = buildService({ hasRol: (id) => id === 15 })
    await expect(service.create(ctx as any, happyDto as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('403 without has_generic_invoice', async () => {
    const { service } = buildService({
      gates: { hasGenericInvoice: false, typeEfectivo: 2 },
    })
    await expect(service.create(ctx as any, happyDto as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('403 when parent company type is Company (1)', async () => {
    const { service } = buildService({
      gates: { hasGenericInvoice: true, typeEfectivo: 1 },
    })
    await expect(service.create(ctx as any, happyDto as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('403 when dealer belongs to another provider', async () => {
    const { service } = buildService({ dealerRel: false })
    await expect(service.create(ctx as any, happyDto as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('400 when dateTo < dateFrom', async () => {
    const { service } = buildService()
    await expect(
      service.create(ctx as any, { ...happyDto, dateTo: '2026-07-01' } as any),
    ).rejects.toThrow('End date cannot be earlier than start date.')
  })

  it('400 on duplicate descriptions (case-insensitive)', async () => {
    const { service } = buildService()
    await expect(
      service.create(ctx as any, {
        ...happyDto,
        items: [
          { description: 'Wax', unitAmount: 1 },
          { description: 'wax', unitAmount: 2 },
        ],
      } as any),
    ).rejects.toThrow('Item already exists')
  })

  it('400 when billing freeze returns 0', async () => {
    const { service } = buildService({ freeze: 0 })
    await expect(service.create(ctx as any, happyDto as any)).rejects.toThrow(
      'The billing has been blocked',
    )
  })

  it('allows freeze result 2 (perm 138 bypass)', async () => {
    const { service, repository } = buildService({ freeze: 2 })
    await service.create(ctx as any, happyDto as any)
    expect(repository.createStatement).toHaveBeenCalled()
  })

  it('retries once on ER_DUP_ENTRY', async () => {
    const dup = new QueryFailedError('INSERT', [], { errno: 1062, code: 'ER_DUP_ENTRY' } as any)
    let calls = 0
    const { service, repository } = buildService({
      create: async () => {
        calls += 1
        if (calls === 1) throw dup
        return { id: 2, invoiceNro: 11, fullNro: 'AW11' }
      },
    })
    const out = await service.create(ctx as any, happyDto as any)
    expect(out.fullNro).toBe('AW11')
    expect(repository.createStatement).toHaveBeenCalledTimes(2)
  })

  it('does not abort create when catalog upsert fails', async () => {
    const { service, repository } = buildService()
    repository.upsertCatalogItem.mockRejectedValue(new Error('catalog down'))
    const out = await service.create(ctx as any, happyDto as any)
    expect(out.id).toBe(1)
    expect(repository.createStatement).toHaveBeenCalled()
  })
})

describe('GenericInvoiceService.deleteCatalogItem', () => {
  it('403 without permission 145', async () => {
    const { service } = buildService({ hasRol: (id) => id === 15 || id === 16 })
    await expect(service.deleteCatalogItem(ctx as any, 9)).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('404 when no owned row was updated', async () => {
    const { service } = buildService({
      hasRol: () => true,
      deleteAffected: 0,
    })
    await expect(service.deleteCatalogItem(ctx as any, 9)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

describe('GenericInvoiceService.config', () => {
  it('canCreate is false for Company type even with flag and perms', async () => {
    const { service } = buildService({
      gates: { hasGenericInvoice: true, typeEfectivo: 1 },
      hasRol: () => true,
    })
    const cfg = await service.config(ctx as any)
    expect(cfg.hasGenericInvoice).toBe(true)
    expect(cfg.canCreate).toBe(false)
  })
})
