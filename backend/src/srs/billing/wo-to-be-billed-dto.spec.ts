import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common'

import { DeleteWorkOrdersDto, UpdateWorkOrderRoPoDto, WORK_ORDER_DELETE_MAX } from 'src/features/srs-invoice/dto/work-order.dto'
import { GenerateIndividualInvoiceDto } from 'src/features/srs-invoice-statement/dto/invoice-statement.dto'
import { WO_TO_BE_BILLED_MAX_PAGE_SIZE, WoToBeBilledFilterDto, WoToBeBilledListQueryDto } from './dto/wo-to-be-billed.dto'

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): los DTO contra el `ValidationPipe` real, con las mismas opciones
 * que el global de `main.ts` (como `generic-invoice.service.spec.ts`). El contrato del filtro con el front está aparte
 * (`wo-to-be-billed-filter-contract.spec.ts`).
 */
const pipe = new ValidationPipe({ transform: true, whitelist: true })

async function run<T>(metatype: new () => T, value: object, type: ArgumentMetadata['type'] = 'body'): Promise<T | 400> {
  try {
    return (await pipe.transform(value, { type, metatype })) as T
  } catch (err) {
    if (err instanceof BadRequestException) return 400
    throw err
  }
}

const filter = (patch: object = {}) => ({ idDealer: 594, dateFrom: '2026-10-01', dateTo: '2026-11-12', ...patch })

describe('DeleteWorkOrdersDto', () => {
  it('ids enteros positivos, de 1 al tope, y bulk booleano', async () => {
    expect(await run(DeleteWorkOrdersDto, { ids: [1, 2], bulk: true })).toEqual({ ids: [1, 2], bulk: true })
    expect(await run(DeleteWorkOrdersDto, { ids: [], bulk: true })).toBe(400)
    expect(await run(DeleteWorkOrdersDto, { ids: [0], bulk: true })).toBe(400)
    expect(await run(DeleteWorkOrdersDto, { ids: [1.5], bulk: true })).toBe(400)
    expect(await run(DeleteWorkOrdersDto, { ids: ['1'], bulk: true })).toBe(400)
    expect(await run(DeleteWorkOrdersDto, { ids: [1] })).toBe(400)
    const tooMany = Array.from({ length: WORK_ORDER_DELETE_MAX + 1 }, (_, i) => i + 1)
    expect(await run(DeleteWorkOrdersDto, { ids: tooMany, bulk: true })).toBe(400)
  })
})

describe('UpdateWorkOrderRoPoDto', () => {
  it('campo ro o po; valor recortado, hasta 16; vacío llega (lo decide el servicio)', async () => {
    expect(await run(UpdateWorkOrderRoPoDto, { field: 'ro', value: '  r1 ' })).toEqual({ field: 'ro', value: 'r1' })
    expect(await run(UpdateWorkOrderRoPoDto, { field: 'po', value: '' })).toEqual({ field: 'po', value: '' })
    expect(await run(UpdateWorkOrderRoPoDto, { field: 'stock', value: 'x' })).toBe(400)
    expect(await run(UpdateWorkOrderRoPoDto, { field: 'ro', value: 'x'.repeat(17) })).toBe(400)
    expect(await run(UpdateWorkOrderRoPoDto, { field: 'ro', value: ` ${'x'.repeat(16)} ` })).toEqual({ field: 'ro', value: 'x'.repeat(16) })
    expect(await run(UpdateWorkOrderRoPoDto, { field: 'ro', value: 5 })).toBe(400)
    expect(await run(UpdateWorkOrderRoPoDto, { field: 'ro' })).toBe(400)
  })
})

describe('GenerateIndividualInvoiceDto', () => {
  it('includeZero opcional y booleano', async () => {
    expect(await run(GenerateIndividualInvoiceDto, {})).toEqual({})
    expect(await run(GenerateIndividualInvoiceDto, { includeZero: true })).toEqual({ includeZero: true })
    expect(await run(GenerateIndividualInvoiceDto, { includeZero: 'false' })).toEqual({ includeZero: false })
    expect(await run(GenerateIndividualInvoiceDto, { includeZero: 'yes' })).toBe(400)
  })
})

describe('WoToBeBilledFilterDto / ListQuery', () => {
  it('dealer y rango obligatorios', async () => {
    expect(await run(WoToBeBilledFilterDto, filter({ idDealer: undefined }))).toBe(400)
    expect(await run(WoToBeBilledFilterDto, filter({ dateFrom: undefined }))).toBe(400)
    expect(await run(WoToBeBilledFilterDto, filter({ dateTo: '2026-02-30' }))).toBe(400)
  })

  it("Approved '0' se conserva; Price con hasta 2 decimales y no negativo", async () => {
    expect(await run(WoToBeBilledFilterDto, filter({ approved: '0' }))).toMatchObject({ approved: '0' })
    expect(await run(WoToBeBilledFilterDto, filter({ approved: '2' }))).toBe(400)
    expect(await run(WoToBeBilledFilterDto, filter({ price: 85.5 }))).toMatchObject({ price: 85.5 })
    expect(await run(WoToBeBilledFilterDto, filter({ price: 1.234 }))).toBe(400)
    expect(await run(WoToBeBilledFilterDto, filter({ price: -1 }))).toBe(400)
  })

  it('Invoice Type solo 1 a 4; una clave que no existe se descarta', async () => {
    expect(await run(WoToBeBilledFilterDto, filter({ invoiceType: 5 }))).toBe(400)
    const out = (await run(WoToBeBilledFilterDto, filter({ invoiceType: 3, idDealerProvider: 1 }))) as unknown as Record<string, unknown>
    expect(out.invoiceType).toBe(3)
    expect(out).not.toHaveProperty('idDealerProvider') // la empresa sale de la sesión, nunca del pedido
  })

  it('como query: listas en csv y tope de página', async () => {
    const q = (await run(WoToBeBilledListQueryDto, filter({ status: '5,7', services: '10', page: '2', pageSize: '50' }), 'query')) as WoToBeBilledListQueryDto
    expect(q).toMatchObject({ status: [5, 7], services: [10], page: 2, pageSize: 50 })
    expect(await run(WoToBeBilledListQueryDto, filter({ pageSize: String(WO_TO_BE_BILLED_MAX_PAGE_SIZE + 1) }), 'query')).toBe(400)
  })
})
