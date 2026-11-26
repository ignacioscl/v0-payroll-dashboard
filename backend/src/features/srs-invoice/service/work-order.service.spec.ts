import { DataSource, UpdateQueryBuilder } from 'typeorm'

import { WORK_ORDER_WRITABLE_COLUMNS, WorkOrder } from '../entity/work-order.entity'
import { WorkOrderService } from './work-order.service'

/**
 * WO to be Billed (plans/plan-wo-to-be-billed-v0, T11, «Columnas del permiso de base»): los `UPDATE` sobre `INVOICE`
 * tocan solo las columnas del `GRANT` de la migration 035. La copia local tiene todos los permisos: sin esta prueba,
 * un `UPDATE` de otra columna pasa todo y falla recién en PROD. Arma el SQL real de TypeORM sin conectarse.
 */
describe('WorkOrderService — solo las columnas del GRANT de la 035', () => {
  let ds: DataSource
  const executed: string[] = []

  beforeAll(async () => {
    ds = new DataSource({ type: 'mysql', database: 'sin_conexion', entities: [WorkOrder] })
    await (ds as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas()
    jest.spyOn(UpdateQueryBuilder.prototype, 'execute').mockImplementation(async function (this: UpdateQueryBuilder<WorkOrder>) {
      executed.push(this.getQuery())
      return { affected: 1, raw: {}, generatedMaps: [] }
    })
  })

  afterAll(() => jest.restoreAllMocks())
  beforeEach(() => executed.splice(0))

  const service = () =>
    new WorkOrderService({ createQueryBuilder: () => ds.createQueryBuilder() } as never)

  /** Las columnas del `SET` de cada `UPDATE INVOICE` ejecutado. */
  const setColumns = (sql: string): string[] => {
    expect(sql).toMatch(/^UPDATE `INVOICE` SET /)
    const set = sql.slice(sql.indexOf(' SET ') + 5, sql.indexOf(' WHERE '))
    return [...set.matchAll(/`(\w+)` = /g)].map((m) => m[1])
  }

  it('eliminar escribe solo `estado`, condicional a la empresa y a que siga activa', async () => {
    await service().markDeleted(55, 232)
    expect(executed).toHaveLength(1)
    expect(setColumns(executed[0])).toEqual(['estado'])
    expect(executed[0]).toContain('WHERE `id` = :id AND `id_dealer_provider` = :prov AND `estado` = 1')
  })

  it.each(['ro', 'po'] as const)('%s#: el campo y las tres marcas, en un solo UPDATE, nada más', async (field) => {
    await service().updateRoPo(55, 232, field, 'X1', { roSemi: true, poSemi: true, stockSemi: true })
    expect(executed).toHaveLength(1)
    const cols = setColumns(executed[0])
    expect(cols.sort()).toEqual([field, 'ro_semi_req', 'po_semi_req', 'stock_semi_req'].sort())
    for (const c of cols) expect(WORK_ORDER_WRITABLE_COLUMNS).toContain(c)
    expect(executed[0]).toContain('WHERE `id` = :id AND `id_dealer_provider` = :prov AND `estado` = 1')
  })
})
