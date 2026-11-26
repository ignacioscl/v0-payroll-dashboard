import { ForbiddenException } from '@nestjs/common'

import type { SrsContext } from '../../auth/srs-auth-context.service'
import { ROL_ACCION_INVOICE_CREATE, ROL_ACCION_INVOICES_MODULE_ACCESS } from '../../auth/srs-permission.repository'
import { InvoiceService } from './invoice.service'

/**
 * R4 de plans/plan-wo-to-be-billed-v0/CODE-review.md: el lookup de servicios con `includeInactive` («Show deleted
 * services» de WO to be Billed) pide lo mismo que esa pantalla; el de Invoices, sin inactivos, sigue igual.
 */
const ctx: SrsContext = { idUsuario: 46, idUsuarioRolrel: null, idRol: 2, idDealerProvider: 232, isUserDealer: false, isActive: true }

function build(over: { rel?: boolean; external?: boolean; perms?: number[] } = {}) {
  const repository = {
    lookupServices: jest.fn(async () => [{ id: 1, label: 'Wash', sublabel: '', inactive: true }]),
    dealerRelExists: jest.fn(async () => over.rel ?? true),
  }
  const permissions = {
    assertRolAccion: jest.fn(async (_c: SrsContext, id: number) => {
      if (!(over.perms ?? [ROL_ACCION_INVOICES_MODULE_ACCESS, ROL_ACCION_INVOICE_CREATE]).includes(id)) throw new ForbiddenException('Forbidden')
    }),
    assertInternalSession: jest.fn(async () => {
      if (over.external) throw new ForbiddenException('Forbidden')
    }),
  }
  return { service: new InvoiceService(repository as any, permissions as any), repository, permissions }
}

const query = (includeInactive: boolean) => ({ idDealer: '594', includeInactive }) as any

describe('InvoiceService.lookupServices — includeInactive', () => {
  it('sin inactivos: solo «Modulde Access», como siempre', async () => {
    const t = build({ perms: [ROL_ACCION_INVOICES_MODULE_ACCESS], rel: false, external: true })
    await expect(t.service.lookupServices(ctx, query(false))).resolves.toBeDefined()
    expect(t.repository.dealerRelExists).not.toHaveBeenCalled()
    expect(t.permissions.assertInternalSession).not.toHaveBeenCalled()
  })

  it('con inactivos: Create Invoice, sesión interna y relación activa con el dealer', async () => {
    await expect(build().service.lookupServices(ctx, query(true))).resolves.toBeDefined()
    await expect(build({ perms: [ROL_ACCION_INVOICES_MODULE_ACCESS] }).service.lookupServices(ctx, query(true))).rejects.toBeInstanceOf(ForbiddenException)
    await expect(build({ external: true }).service.lookupServices(ctx, query(true))).rejects.toBeInstanceOf(ForbiddenException)
    const noRel = build({ rel: false })
    await expect(noRel.service.lookupServices(ctx, query(true))).rejects.toBeInstanceOf(ForbiddenException)
    expect(noRel.repository.lookupServices).not.toHaveBeenCalled()
  })
})
