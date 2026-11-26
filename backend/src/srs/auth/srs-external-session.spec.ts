import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import type { SqlRunner } from '../shared/mysql-result'
import { isExternalSession } from './srs-external-session'

/**
 * D7 de plans/plan-wo-to-be-billed-v0: la tabla de casos de «¿la sesión es externa?» (`__fixtures__/external-session-cases.json`)
 * contra la copia de Nest, con una base simulada que devuelve lo de cada caso. La misma tabla corre contra la copia de
 * PHP (`public/php/tests/external-session-cases.php`); el último test la corre en el contenedor de PHP si está.
 */
type Rel = { id: number; idRol: number; tipo: number | null; idDealer: number | null }
type Case = {
  name: string
  userRol: number | null
  hasAdminCompanyRel: boolean
  signedRel: number
  rels: Rel[]
  owner: { idOwner: number | null; ownerEmpresaType: number | null }
  companyTypes: Record<string, number | null>
  external: boolean
}

const fixture = join(__dirname, '__fixtures__/external-session-cases.json')
const { cases } = JSON.parse(readFileSync(fixture, 'utf8')) as { cases: Case[] }

/** Una base que contesta las tres consultas de la regla con los datos del caso. */
function fakeDb(c: Case): SqlRunner {
  return {
    async query(sql: string, params: unknown[] = []) {
      if (sql.includes('FROM USUARIO_ROL_REL rr')) {
        const signed = sql.includes('rr.id = ?') ? Number(params[1]) : null
        return c.rels.filter((r) => signed == null || r.id === signed)
      }
      if (sql.includes('FROM usuarios u')) return [c.owner]
      if (sql.includes('FROM CONTRATISTA c')) {
        return (params as number[])
          .filter((id) => String(id) in c.companyTypes)
          .map((id) => ({ id, typeEfectivo: c.companyTypes[String(id)] }))
      }
      throw new Error(`consulta inesperada: ${sql}`)
    },
  }
}

/** El rol de la sesión como lo arma `SrsAuthContextService`: 1 Admin General; 2 Admin Company. */
function idRolOf(c: Case): number {
  if (c.userRol === 1) return 1
  if (c.userRol === 2 || c.hasAdminCompanyRel) return 2
  return c.userRol ?? 0
}

describe('isExternalSession — tabla de casos (Nest)', () => {
  for (const c of cases) {
    it(`${c.name} → ${c.external ? 'externa' : 'interna'}`, async () => {
      const ctx = { idUsuario: 1, idUsuarioRolrel: c.signedRel > 0 ? c.signedRel : null, idRol: idRolOf(c) }
      await expect(isExternalSession(ctx, fakeDb(c))).resolves.toBe(c.external)
    })
  }
})

/** La misma tabla contra la copia de PHP, en el contenedor local de PHP (si no está, se saltea con aviso). */
const phpScript = '/var/www/srs.com/public/php/tests/external-session-cases.php'
const legacyHere = existsSync(join(__dirname, '../../../../../public/php/tests/external-session-cases.php'))
let phpRuns = false
if (legacyHere) {
  try {
    execSync('docker exec php-dev-apache php -v', { stdio: 'ignore', timeout: 10_000 })
    phpRuns = true
  } catch {
    phpRuns = false
  }
}
if (!phpRuns) console.warn('SKIPPED la tabla de casos contra PHP: no hay contenedor php-dev-apache (o no está legacy al lado).')
const itPhp = phpRuns ? it : it.skip

describe('isExternalSession — la misma tabla contra PHP', () => {
  itPhp('PayrollPermissionService::isExternalSession da lo mismo en cada caso', () => {
    const out = execSync(`docker exec -i php-dev-apache php ${phpScript}`, {
      input: readFileSync(fixture),
      timeout: 30_000,
    }).toString()
    const results = JSON.parse(out) as Array<{ name: string; external: boolean }>
    expect(results.map((r) => [r.name, r.external])).toEqual(cases.map((c) => [c.name, c.external]))
  })
})
