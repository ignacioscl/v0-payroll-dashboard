import { Repository } from 'typeorm'

import { UsuarioSrs } from '../entity/usuario-srs.entity'
import { UsuarioSrsRepository } from './usuario-srs.repository'

/**
 * P7 de plans/plan-monthly-closing-vendors: `vendorIds` se acota a la empresa que se le pasa (`id_contratista_owner`),
 * que el closing toma de la sesión. La consulta real contra la copia está en monthly-closing-integration.spec.ts.
 */
function repoWithSpy(rows: unknown[] = []) {
  const query = jest.fn().mockResolvedValue(rows)
  const base = { target: UsuarioSrs, manager: { query }, queryRunner: undefined } as unknown as Repository<UsuarioSrs>
  return { repo: new UsuarioSrsRepository(base), query }
}

describe('UsuarioSrsRepository.vendorIds', () => {
  it('filtra por la empresa y por is_vendor = 1, con la empresa como parámetro', async () => {
    const { repo, query } = repoWithSpy()
    await repo.vendorIds(79)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('u.id_contratista_owner = ?')
    expect(sql).toContain('u.is_vendor = 1')
    // Sin estado ni is_inactive: un vendor borrado con piecework en el período también se saca.
    expect(sql).not.toMatch(/estado|is_inactive/)
    expect(params).toEqual([79])
  })

  it('devuelve números ordenados', async () => {
    const { repo } = repoWithSpy([{ id: '8463' }, { id: 6985 }])
    await expect(repo.vendorIds(79)).resolves.toEqual([6985, 8463])
  })
})
