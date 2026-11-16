/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Logo de la empresa (plans/plan-buenas-practicas-v0, 3.6): el tipo sale del contenido, más de 1 MB se corta al
 * recibir, sin SVG nuevos y el SVG viejo se sirve encerrado. Pedidos reales con fetch, servicio falso, sin base.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { INestApplication, Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { ContratistaController, LOGO_SIZE_MESSAGE, LOGO_TYPE_MESSAGE, MAX_LOGO_BYTES } from './contratista.controller'
import { ContratistaService } from '../service/contratista.service'

const LOGO_DIR = join(process.cwd(), 'public', 'branding')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])

const service = {
  getBranding: jest.fn(async () => ({ logoFile: null as string | null, logoIsV0: false })),
  setV0Logo: jest.fn(async (_ctx: unknown, fileName: string) => ({ logoFile: fileName, logoIsV0: true })),
  clearV0Logo: jest.fn(),
  updateBranding: jest.fn(),
}

@Module({ controllers: [ContratistaController], providers: [{ provide: ContratistaService, useValue: service }] })
class LogoModule {}

let app: INestApplication
let url: string
const written: string[] = []

beforeAll(async () => {
  app = await NestFactory.create(LogoModule, { logger: false })
  app.use((req: any, _res: unknown, next: () => void) => {
    req.srsContext = { idDealerProvider: 999999 }
    next()
  })
  await app.listen(0, '127.0.0.1')
  url = await app.getUrl()
})
afterAll(async () => {
  await app.close()
  for (const f of written) rmSync(join(LOGO_DIR, f), { force: true })
})
beforeEach(() => jest.clearAllMocks())

function upload(bytes: Buffer, name: string, type: string) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), name)
  return fetch(`${url}/srs/contratista/branding/logo`, { method: 'POST', body: form })
}

describe('subir el logo', () => {
  it('un PNG con nombre .webp pasa por su contenido y se guarda .png', async () => {
    const res = await upload(PNG, 'logo.webp', 'image/webp')
    expect(res.status).toBe(201)
    const body = await res.json()
    written.push(body.logoFile)
    expect(body.logoFile).toMatch(/^999999-\d+\.png$/)
  })

  it('un HTML que dice ser PNG → 400 con el texto de D1', async () => {
    const res = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'x.png', 'image/png')
    expect(res.status).toBe(400)
    expect((await res.json()).message).toBe(LOGO_TYPE_MESSAGE)
    expect(service.setV0Logo).not.toHaveBeenCalled()
  })

  it('un SVG → 400', async () => {
    const res = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'x.svg', 'image/svg+xml')
    expect(res.status).toBe(400)
  })

  it('más de 1 MB → 413 sin llegar al servicio', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES + 100 * 1024)])
    const res = await upload(big, 'big.png', 'image/png')
    expect(res.status).toBe(413)
    expect((await res.json()).message).toBe(LOGO_SIZE_MESSAGE)
    expect(service.getBranding).not.toHaveBeenCalled()
  })
})

describe('servir el logo', () => {
  it('un SVG viejo sale con sandbox y nosniff', async () => {
    mkdirSync(LOGO_DIR, { recursive: true })
    const file = '999999-old.svg'
    writeFileSync(join(LOGO_DIR, file), '<svg xmlns="http://www.w3.org/2000/svg"/>')
    written.push(file)
    service.getBranding.mockResolvedValueOnce({ logoFile: file, logoIsV0: true })
    const res = await fetch(`${url}/srs/contratista/branding/logo`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
