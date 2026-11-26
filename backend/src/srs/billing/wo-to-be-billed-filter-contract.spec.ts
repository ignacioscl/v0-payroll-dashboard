import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ArgumentMetadata, ValidationPipe } from '@nestjs/common'

import { WoToBeBilledFilterDto, WoToBeBilledListQueryDto } from './dto/wo-to-be-billed.dto'

/**
 * Contrato del filtro de WO to be Billed (plans/plan-wo-to-be-billed-v0, T4 y T11). El `ValidationPipe` global descarta
 * en silencio un campo que no esté en el DTO (`app.setup.ts`): si la pantalla mandara un filtro con otro nombre, se
 * facturaría más de lo que se ve. Los casos son los mismos que arma la pantalla
 * (`frontend/lib/billing/wo-to-be-billed-filter-contract.json`, controlado por `frontend/lib/srs-wo-to-be-billed-api.test.ts`):
 * acá cada uno pasa por el pipe real, como cuerpo (`POST`) y como query (`GET`), y **ninguna clave se pierde**.
 */
const file = join(__dirname, '../../../../frontend/lib/billing/wo-to-be-billed-filter-contract.json')
// En la imagen Docker del backend no está el frontend: el control corre en el gate local.
const frontPresent = existsSync(file)
if (!frontPresent) console.warn('SKIPPED wo-to-be-billed-filter-contract.spec.ts: the frontend is not here (backend Docker build)')
const describeIf = frontPresent ? describe : describe.skip

type Case = { name: string; request: Record<string, unknown>; query: string }

/** Las mismas opciones del pipe global (`app.setup.ts`). */
const pipe = new ValidationPipe({ transform: true, whitelist: true, stopAtFirstError: false })

const run = (value: unknown, metatype: unknown, type: 'body' | 'query') =>
  pipe.transform(value, { type, metatype, data: undefined } as ArgumentMetadata) as Promise<Record<string, unknown>>

describeIf('WO to be Billed — contrato del filtro contra el ValidationPipe real', () => {
  const cases: Case[] = frontPresent ? (JSON.parse(readFileSync(file, 'utf8')) as { cases: Case[] }).cases : []

  for (const c of cases) {
    it(`${c.name}: como cuerpo (preview / generate), ninguna clave se descarta`, async () => {
      const out = await run({ ...c.request }, WoToBeBilledFilterDto, 'body')
      for (const [key, value] of Object.entries(c.request)) {
        expect({ key, value: out[key] }).toEqual({ key, value })
      }
    })

    it(`${c.name}: como query (lista y total), ninguna clave se descarta`, async () => {
      const query = Object.fromEntries(new URLSearchParams(c.query).entries())
      const out = await run(query, WoToBeBilledListQueryDto, 'query')
      for (const [key, value] of Object.entries(c.request)) {
        expect({ key, value: out[key] }).toEqual({ key, value })
      }
    })
  }

  it('rechaza un status fuera de la lista y una fecha que no existe', async () => {
    await expect(
      run({ idDealer: 1, dateFrom: '2026-02-30', dateTo: '2026-03-01', status: [99] }, WoToBeBilledFilterDto, 'body'),
    ).rejects.toBeDefined()
  })
})
