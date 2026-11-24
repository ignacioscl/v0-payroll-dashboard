jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}))

import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'

import type { SrsContext } from 'src/srs/auth/srs-auth-context.service'
import {
  ROL_ACCION_WO_DELETE,
  ROL_ACCION_WO_DELETE_IN_TRANSIT,
  ROL_ACCION_WO_LOCK_AFTER_COMPLETED,
} from 'src/srs/auth/srs-permission.repository'
import { WORKFLOW_COMPLETED, WORKFLOW_IN_TRANSIT } from 'src/srs/billing/dto/wo-to-be-billed.dto'
import type { RoPoRules, ScopedWorkOrder } from '../repository/work-order-rules.repository'
import {
  legacyUpper,
  MSG_DELETE_FAILED,
  MSG_FORBIDDEN,
  MSG_WO_COMPLETED,
  MSG_WO_LOCKED,
  msgRequired,
  msgWoBilled,
  WorkOrderFacadeService,
} from './work-order-facade.service'

/** WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): eliminar WO y RO# / PO#, con dobles. */

const ctx = (idRol = 3): SrsContext => ({
  idUsuario: 46,
  idUsuarioRolrel: 10,
  idRol,
  idDealerProvider: 232,
  isUserDealer: false,
  isActive: true,
})

const wo = (patch: Partial<ScopedWorkOrder> = {}): ScopedWorkOrder =>
  ({
    id: 55,
    idDealer: 594,
    idDepartment: 492,
    idWorkflow: 5,
    idAuthor: 999,
    fullNro: 'T55',
    fechaAltaDate: '2026-10-05',
    estado: 1,
    ro: null,
    po: 'P9',
    stockNumber: null,
    ...patch,
  }) as ScopedWorkOrder

const noRules: RoPoRules = { roRequired: false, poRequired: false, roSemi: false, poSemi: false, stockSemi: false }

function build(over: {
  wo?: ScopedWorkOrder | null
  perms?: number[]
  trash?: boolean
  freeze?: number
  lockAfterCompleted?: number
  billed?: boolean
  affected?: number
  rules?: Partial<RoPoRules>
  outOfScope?: boolean
} = {}) {
  const order: string[] = []
  const db = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('CHECK_DATE_FREEZE')) {
        order.push('freeze')
        return [{ res: over.freeze ?? 1 }]
      }
      throw new Error(`consulta inesperada: ${sql}`)
    }),
  }
  const workOrders = {
    markDeleted: jest.fn(async () => {
      order.push('update')
      return over.affected ?? 1
    }),
    updateRoPo: jest.fn(async (..._args: unknown[]) => {
      order.push('update')
      return over.affected ?? 1
    }),
  }
  const rules = {
    lockWorkOrder: jest.fn(async () => {
      order.push('lock')
      return true
    }),
    loadScoped: jest.fn(async () => {
      order.push('load')
      return over.wo === undefined ? wo() : over.wo
    }),
    checkUserPermission: jest.fn(async () => {
      order.push('lockAfterCompleted')
      return over.lockAfterCompleted ?? 0
    }),
    isWoBilled: jest.fn(async () => {
      order.push('billed')
      return over.billed ?? false
    }),
    roPoRules: jest.fn(async () => ({ ...noRules, ...over.rules })),
  }
  const logs = { logWorkOrder: jest.fn(async () => undefined) }
  const permissions = {
    userHasRolAccion: jest.fn(async (_c: SrsContext, id: number) => (over.perms ?? [ROL_ACCION_WO_DELETE]).includes(id)),
  }
  const screen = {
    assertScreenAccess: jest.fn(async () => undefined),
    assertDealerInScope: jest.fn(async () => {
      order.push('scope')
      if (over.outOfScope) throw new ForbiddenException('Forbidden')
    }),
  }
  const woToBeBilled = { hasTrashIcon: jest.fn(async () => over.trash ?? true) }
  const facade = new WorkOrderFacadeService(
    workOrders as any,
    rules as any,
    logs as any,
    permissions as any,
    screen as any,
    woToBeBilled as any,
    db as any,
  )
  return { facade, order, workOrders, rules, logs, permissions, screen, woToBeBilled }
}

describe('WorkOrderFacadeService.delete', () => {
  it('elimina: valida en el orden de legacy, el UPDATE cuenta filas y deja el log de legacy', async () => {
    const t = build()
    const res = await t.facade.delete(ctx(), { ids: [55], bulk: true })
    expect(res).toEqual({ deleted: [{ id: 55, fullNro: 'T55' }], failed: [] })
    expect(t.order).toEqual(['load', 'scope', 'freeze', 'billed', 'update'])
    expect(t.logs.logWorkOrder).toHaveBeenCalledWith(55, 46, 'Invoice #T55 deleted')
  })

  it('WO de otra empresa (o inexistente): solo el id, sin número', async () => {
    const t = build({ wo: null })
    const res = await t.facade.delete(ctx(), { ids: [55], bulk: true })
    expect(res.failed).toEqual([{ id: 55, reason: MSG_FORBIDDEN }])
    expect(t.workOrders.markDeleted).not.toHaveBeenCalled()
  })

  it('dealer fuera de alcance: solo el id, sin número', async () => {
    const t = build({ outOfScope: true })
    const res = await t.facade.delete(ctx(), { ids: [55], bulk: true })
    expect(res.failed).toEqual([{ id: 55, reason: MSG_FORBIDDEN }])
  })

  it('en lote pide el permiso 14; una por una pide el tacho y 14 (o 79 con la WO In Transit)', async () => {
    expect((await build({ perms: [] }).facade.delete(ctx(), { ids: [55], bulk: true })).failed[0]).toMatchObject({ reason: MSG_FORBIDDEN, fullNro: 'T55' })
    expect((await build({ trash: false }).facade.delete(ctx(), { ids: [55], bulk: false })).failed).toHaveLength(1)
    expect((await build({ trash: true }).facade.delete(ctx(), { ids: [55], bulk: false })).deleted).toHaveLength(1)
    const inTransit = build({ perms: [ROL_ACCION_WO_DELETE_IN_TRANSIT], wo: wo({ idWorkflow: WORKFLOW_IN_TRANSIT }) })
    expect((await inTransit.facade.delete(ctx(), { ids: [55], bulk: false })).deleted).toHaveLength(1)
    const notInTransit = build({ perms: [ROL_ACCION_WO_DELETE_IN_TRANSIT] })
    expect((await notInTransit.facade.delete(ctx(), { ids: [55], bulk: false })).failed).toHaveLength(1)
  })

  it('Admin General no mira el tacho del rol', async () => {
    const t = build({ trash: false })
    expect((await t.facade.delete(ctx(1), { ids: [55], bulk: false })).deleted).toHaveLength(1)
    expect(t.woToBeBilled.hasTrashIcon).not.toHaveBeenCalled()
  })

  it('WO ya eliminada: Forbidden con su número', async () => {
    const res = await build({ wo: wo({ estado: 0 }) }).facade.delete(ctx(), { ids: [55], bulk: true })
    expect(res.failed).toEqual([{ id: 55, fullNro: 'T55', reason: MSG_FORBIDDEN }])
  })

  it('Completed con «Lock WO after Completed» en 1: no se elimina; los Admin no lo miran (D16)', async () => {
    const t = build({ wo: wo({ idWorkflow: WORKFLOW_COMPLETED }), lockAfterCompleted: 1 })
    expect((await t.facade.delete(ctx(), { ids: [55], bulk: true })).failed[0].reason).toBe(MSG_WO_COMPLETED)
    expect(t.rules.checkUserPermission).toHaveBeenCalledWith(46, 594, ROL_ACCION_WO_LOCK_AFTER_COMPLETED)
    for (const idRol of [1, 2]) {
      const admin = build({ wo: wo({ idWorkflow: WORKFLOW_COMPLETED }), lockAfterCompleted: 1 })
      expect((await admin.facade.delete(ctx(idRol), { ids: [55], bulk: true })).deleted).toHaveLength(1)
      expect(admin.rules.checkUserPermission).not.toHaveBeenCalled()
    }
    // Solo bloquea si devuelve exactamente 1 (2 no bloquea).
    const two = build({ wo: wo({ idWorkflow: WORKFLOW_COMPLETED }), lockAfterCompleted: 2 })
    expect((await two.facade.delete(ctx(), { ids: [55], bulk: true })).deleted).toHaveLength(1)
  })

  it('Lock Date 0: «The WOs on this dealer has been locked»', async () => {
    const res = await build({ freeze: 0 }).facade.delete(ctx(), { ids: [55], bulk: true })
    expect(res.failed[0].reason).toBe(MSG_WO_LOCKED)
  })

  it('pagada: «WO T55 is billed!»', async () => {
    const res = await build({ billed: true }).facade.delete(ctx(), { ids: [55], bulk: true })
    expect(res.failed[0].reason).toBe(msgWoBilled('T55'))
  })

  it('el UPDATE afectó 0 filas (otro la eliminó en el medio): falla, sin log', async () => {
    const t = build({ affected: 0 })
    const res = await t.facade.delete(ctx(), { ids: [55], bulk: true })
    expect(res.failed).toEqual([{ id: 55, fullNro: 'T55', reason: MSG_FORBIDDEN }])
    expect(t.logs.logWorkOrder).not.toHaveBeenCalled()
  })

  it('ids repetidos se procesan una vez', async () => {
    const t = build()
    await t.facade.delete(ctx(), { ids: [55, 55], bulk: true })
    expect(t.workOrders.markDeleted).toHaveBeenCalledTimes(1)
  })

  it('un error de base en una WO no corta el lote: esa va a failed y las demás siguen (R6)', async () => {
    const t = build()
    t.rules.loadScoped
      .mockResolvedValueOnce(wo({ id: 1, fullNro: 'T1' }))
      .mockResolvedValueOnce(wo({ id: 2, fullNro: 'T2' }))
      .mockResolvedValueOnce(wo({ id: 3, fullNro: 'T3' }))
    t.rules.isWoBilled.mockResolvedValueOnce(false).mockRejectedValueOnce(Object.assign(new Error('deadlock'), { errno: 1213 })).mockResolvedValueOnce(false)
    const res = await t.facade.delete(ctx(), { ids: [1, 2, 3], bulk: true })
    expect(res.deleted.map((d) => d.id)).toEqual([1, 3])
    expect(res.failed).toEqual([{ id: 2, reason: MSG_DELETE_FAILED }])
  })

  it('de a una (bulk: false) acepta un solo id; el lote pide 14 aunque traiga uno (R7)', async () => {
    const t = build({ perms: [ROL_ACCION_WO_DELETE_IN_TRANSIT], wo: wo({ idWorkflow: WORKFLOW_IN_TRANSIT }) })
    await expect(t.facade.delete(ctx(), { ids: [55, 56], bulk: false })).rejects.toBeInstanceOf(BadRequestException)
    expect(t.workOrders.markDeleted).not.toHaveBeenCalled()
    expect((await t.facade.delete(ctx(), { ids: [55], bulk: true })).failed).toHaveLength(1)
  })
})

describe('WorkOrderFacadeService.updateRoPo', () => {
  it('mayúsculas, sin espacios; un solo UPDATE con las tres marcas; log con el texto de legacy', async () => {
    const t = build({ rules: { roSemi: true, stockSemi: true } })
    const res = await t.facade.updateRoPo(ctx(), 55, { field: 'ro', value: ' ab12 ' })
    expect(res).toEqual({ ro: 'AB12', po: 'P9' })
    expect(t.workOrders.updateRoPo).toHaveBeenCalledWith(55, 232, 'ro', 'AB12', { roSemi: true, poSemi: false, stockSemi: true })
    expect(t.logs.logWorkOrder).toHaveBeenCalledWith(55, 46, 'RO# edited from  to:AB12')
  })

  it('el candado de la fila es lo primero (R15)', async () => {
    const t = build()
    await t.facade.updateRoPo(ctx(), 55, { field: 'ro', value: 'X' })
    expect(t.order[0]).toBe('lock')
    expect(t.order.indexOf('load')).toBeGreaterThan(0)
  })

  it('mayúsculas como legacy: solo a–z, el largo no cambia (R14)', async () => {
    expect(legacyUpper('abcß-é1')).toBe('ABCß-é1')
    const t = build()
    const value = `${'a'.repeat(15)}ß`
    await t.facade.updateRoPo(ctx(), 55, { field: 'ro', value })
    expect(t.workOrders.updateRoPo.mock.calls[0][3]).toBe(`${'A'.repeat(15)}ß`)
    expect(String(t.workOrders.updateRoPo.mock.calls[0][3])).toHaveLength(16)
  })

  it("'' es nulo; obligatorio corta con el error en el campo", async () => {
    const t = build({ rules: { poRequired: true } })
    const err = await t.facade.updateRoPo(ctx(), 55, { field: 'po', value: '  ' }).catch((e) => e)
    expect(JSON.stringify(err.getResponse?.() ?? err)).toContain(msgRequired('po'))
    expect(t.workOrders.updateRoPo).not.toHaveBeenCalled()
    const ok = build()
    await expect(ok.facade.updateRoPo(ctx(), 55, { field: 'po', value: '' })).resolves.toEqual({ ro: null, po: null })
    expect(ok.logs.logWorkOrder).toHaveBeenCalledWith(55, 46, 'PO# edited from P9 to:')
  })

  it('sin cambio: no escribe ni anota', async () => {
    const t = build()
    await t.facade.updateRoPo(ctx(), 55, { field: 'po', value: 'p9' })
    expect(t.workOrders.updateRoPo).not.toHaveBeenCalled()
    expect(t.logs.logWorkOrder).not.toHaveBeenCalled()
  })

  it('WO de otra empresa o eliminada: 403 sin datos', async () => {
    await expect(build({ wo: null }).facade.updateRoPo(ctx(), 55, { field: 'ro', value: 'X' })).rejects.toBeInstanceOf(ForbiddenException)
    await expect(build({ wo: wo({ estado: 0 }) }).facade.updateRoPo(ctx(), 55, { field: 'ro', value: 'X' })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('Lock Date 0 corta; 2 pasa', async () => {
    await expect(build({ freeze: 0 }).facade.updateRoPo(ctx(), 55, { field: 'ro', value: 'X' })).rejects.toThrow(MSG_WO_LOCKED)
    await expect(build({ freeze: 2 }).facade.updateRoPo(ctx(), 55, { field: 'ro', value: 'X' })).resolves.toEqual({ ro: 'X', po: 'P9' })
  })

  it('el UPDATE afectó 0 filas: 409, sin log', async () => {
    const t = build({ affected: 0 })
    await expect(t.facade.updateRoPo(ctx(), 55, { field: 'ro', value: 'X' })).rejects.toBeInstanceOf(ConflictException)
    expect(t.logs.logWorkOrder).not.toHaveBeenCalled()
  })
})
