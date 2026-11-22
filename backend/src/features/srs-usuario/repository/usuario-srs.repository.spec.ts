import { Repository } from 'typeorm'

import { UsuarioSrs } from '../entity/usuario-srs.entity'
import { UsuarioSrsRepository } from './usuario-srs.repository'

/**
 * Combo «Vendor» de la expense Piecework (plans/plan-reunion-juan-18-11, temas 3 y 4): `activeVendors` se acota a la
 * empresa que se le pasa (`id_contratista_owner`, la de la sesión) y trae solo los vendors activos. La consulta real
 * contra la copia está en expense-piecework-integration.spec.ts.
 */
function repoWithSpy(rows: unknown[] = []) {
  const query = jest.fn().mockResolvedValue(rows)
  const base = { target: UsuarioSrs, manager: { query }, queryRunner: undefined } as unknown as Repository<UsuarioSrs>
  return { repo: new UsuarioSrsRepository(base), query }
}

describe('UsuarioSrsRepository.activeVendors', () => {
  it('filtra por la empresa, is_vendor = 1 y activos, con la empresa como parámetro', async () => {
    const { repo, query } = repoWithSpy()
    await repo.activeVendors(79)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toContain('u.id_contratista_owner = ?')
    expect(sql).toContain('u.is_vendor = 1')
    expect(sql).toContain('u.estado = 1')
    expect(params).toEqual([79])
  })

  it('devuelve id numérico y nombre', async () => {
    const { repo } = repoWithSpy([{ id: '6985', name: 'Francol Services LLC' }])
    await expect(repo.activeVendors(79)).resolves.toEqual([{ id: 6985, name: 'Francol Services LLC' }])
  })
})
