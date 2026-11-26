import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildWoFilterRequest, woFilterQueryString, type WoToBeBilledFilterInput } from './srs-wo-to-be-billed-api'

/**
 * Contrato del filtro de WO to be Billed (plans/plan-wo-to-be-billed-v0, T11): la pantalla arma exactamente el pedido
 * de cada caso. Los mismos casos los pasa el backend por el `ValidationPipe` real
 * (`backend/src/srs/billing/wo-to-be-billed-filter-contract.spec.ts`): ninguna clave se descarta.
 */
type Case = { name: string; input: WoToBeBilledFilterInput; request: Record<string, unknown>; query: string }
const { cases } = JSON.parse(
  readFileSync(join(__dirname, 'billing/wo-to-be-billed-filter-contract.json'), 'utf8'),
) as { cases: Case[] }

describe('buildWoFilterRequest — contrato del filtro', () => {
  for (const c of cases) {
    it(c.name, () => {
      const request = buildWoFilterRequest(c.input)
      expect(request).toEqual(c.request)
      expect(woFilterQueryString(request)).toBe(c.query)
    })
  }

  it('un Price que no es número no viaja', () => {
    const base = cases[0].input
    expect(buildWoFilterRequest({ ...base, price: 'abc' })).not.toHaveProperty('price')
  })
})
