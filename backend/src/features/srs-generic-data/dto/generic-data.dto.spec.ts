import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'

import { CatalogQueryDto, CreateCatalogItemDto, UpdateCatalogItemDto } from './generic-data.dto'

async function fieldsOf<T extends object>(cls: new () => T, input: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, input), { whitelist: true })
  return errors.map((e) => e.property)
}

describe('Settings › Categories / Companies DTOs — lo que rechazan', () => {
  it('CreateCatalogItemDto: nombre obligatorio, recortado, hasta 128', async () => {
    expect(await fieldsOf(CreateCatalogItemDto, { name: '   ' })).toContain('name')
    expect(await fieldsOf(CreateCatalogItemDto, { name: 'x'.repeat(129) })).toContain('name')
    expect(await fieldsOf(CreateCatalogItemDto, { name: ' Home Depot ' })).toEqual([])
    expect(plainToInstance(CreateCatalogItemDto, { name: ' Home Depot ' }).name).toBe('Home Depot')
  })

  it('UpdateCatalogItemDto: active entiende "false" / "0" como apagado (sin Boolean("false"))', async () => {
    expect(plainToInstance(UpdateCatalogItemDto, { active: 'false' }).active).toBe(false)
    expect(plainToInstance(UpdateCatalogItemDto, { active: '0' }).active).toBe(false)
    expect(plainToInstance(UpdateCatalogItemDto, { active: true }).active).toBe(true)
    expect(await fieldsOf(UpdateCatalogItemDto, { active: 'maybe' })).toContain('active')
    expect(await fieldsOf(UpdateCatalogItemDto, { name: '' })).toContain('name')
    expect(await fieldsOf(UpdateCatalogItemDto, {})).toEqual([])
  })

  it('CatalogQueryDto: página base 1, activeOnly 0|1', async () => {
    expect(await fieldsOf(CatalogQueryDto, { page: '0' })).toContain('page')
    expect(await fieldsOf(CatalogQueryDto, { activeOnly: 'yes' })).toContain('activeOnly')
    expect(await fieldsOf(CatalogQueryDto, { page: '2', pageSize: '50', activeOnly: '1', term: 'ho' })).toEqual([])
  })
})
