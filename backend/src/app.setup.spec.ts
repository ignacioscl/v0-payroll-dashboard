/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * La app armada como en producción (`configureApp`, plans/plan-buenas-practicas-v0, 2.13.1), con un
 * controlador de prueba y sin base. Pedidos reales con `fetch` contra `listen(0)`.
 */
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Body, Controller, Get, HttpStatus, INestApplication, Module, Post } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { IsString } from 'class-validator'
import { QueryFailedError } from 'typeorm'

jest.mock('@sentry/node', () => {
  const actual = jest.requireActual('@sentry/node')
  return {
    ...actual,
    init: jest.fn(),
    captureException: jest.fn(),
    withScope: jest.fn((cb: (scope: unknown) => void) => cb({ setTag: jest.fn(), setExtra: jest.fn() })),
  }
})
import * as Sentry from '@sentry/node'

import { configureApp, scrubSentryEvent } from './app.setup'
import { LoggerSystem } from './commons/logs/logger.system'
import { appendErrorLine } from './commons/logs/error-log-file'
import { I18nError } from './commons/errors/i18n.error'
import { DB_POOL_BUSY, poolBusyError } from './srs/srs-pool-acquire-timeout'

class ProbeDto {
  @IsString()
  name!: string
}

const SECRET_SQL = "SELECT * FROM USUARIO WHERE pass = 'x'"

@Controller('probe')
class ProbeController {
  @Get('ok') ok() {
    return { ok: true }
  }
  @Get('plain') plain() {
    throw new Error('internal detail /srv/app')
  }
  @Get('query') query() {
    throw new QueryFailedError(SECRET_SQL, [], new Error('ER_BAD_FIELD_ERROR'))
  }
  @Post('validate') validate(@Body() _dto: ProbeDto) {
    return { ok: true }
  }
  @Get('i18n') i18n() {
    throw new I18nError('error.not_allowed', HttpStatus.BAD_REQUEST)
  }
  @Get('busy') busy() {
    throw poolBusyError()
  }
  @Post('echo') echo(@Body() body: Record<string, unknown>) {
    return { size: JSON.stringify(body).length }
  }
  @Get('slow') async slow() {
    await new Promise((r) => setTimeout(r, 500))
    return { done: true }
  }
}

@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ sentryDSN: undefined })] })],
  controllers: [ProbeController],
  providers: [LoggerSystem],
})
class ProbeModule {}

let dir: string
let logPath: string

async function boot(): Promise<{ app: INestApplication; url: string }> {
  const app = await NestFactory.create(ProbeModule, { logger: false })
  await configureApp(app)
  app.useLogger(false)
  await app.listen(0, '127.0.0.1')
  return { app, url: await app.getUrl() }
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'srs-errors-'))
  logPath = join(dir, 'errors.log')
  process.env.ERROR_LOG_PATH = logPath
})
afterAll(() => {
  delete process.env.ERROR_LOG_PATH
  rmSync(dir, { recursive: true, force: true })
})

describe('configureApp', () => {
  let app: INestApplication
  let url: string
  const env = process.env.NODE_ENV

  beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    ;({ app, url } = await boot())
  })
  afterAll(async () => {
    process.env.NODE_ENV = env
    await app.close()
  })
  beforeEach(() => {
    rmSync(logPath, { force: true })
    jest.mocked(Sentry.captureException).mockClear()
  })

  it('manda los encabezados de seguridad y no X-Powered-By', async () => {
    const res = await fetch(`${url}/api/probe/ok`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(res.headers.get('x-frame-options')).toBe('DENY')
    expect(res.headers.get('strict-transport-security')).toContain('max-age=')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('referrer-policy')).toBeTruthy()
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('no contesta CORS', async () => {
    const res = await fetch(`${url}/api/probe/ok`, { headers: { Origin: 'https://otro.example' } })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('un error interno sale 500 sin message, sin body ni el SQL, y deja una línea sin datos del pedido', async () => {
    for (const path of ['plain', 'query']) {
      const res = await fetch(`${url}/api/probe/${path}?token=abc`, {
        headers: { Authorization: 'Bearer secret-jwt', Cookie: 'srs_session=zzz' },
      })
      const text = await res.text()
      const json = JSON.parse(text)
      expect(res.status).toBe(500)
      expect(json.message).toBeUndefined()
      expect(json.body).toBeUndefined()
      expect(json.code).toBeUndefined()
      expect(text).not.toContain('USUARIO')
      expect(text).not.toContain('/srv/app')
    }
    const lines = readFileSync(logPath, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0])
    expect(first).toMatchObject({ method: 'GET', route: '/api/probe/plain', status: 500, message: 'internal detail /srv/app' })
    const all = lines.join('\n')
    expect(all).not.toContain('secret-jwt')
    expect(all).not.toContain('srs_session')
    expect(all).not.toContain('token=abc')
    expect(Sentry.captureException).toHaveBeenCalledTimes(2)
  })

  it('los errores de negocio conservan su mensaje y no van al archivo ni a Sentry', async () => {
    const v = await fetch(`${url}/api/probe/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 3, password: 'p4ss' }),
    })
    const vj = await v.json()
    expect(v.status).toBe(400)
    expect(vj.message).toBe('Validation Error')
    expect(vj.validationErrors).toEqual([expect.objectContaining({ field: 'name' })])
    expect(JSON.stringify(vj)).not.toContain('p4ss')

    const i = await fetch(`${url}/api/probe/i18n`)
    expect(i.status).toBe(400)
    expect((await i.json()).i18nKey).toBe('error.not_allowed')

    expect(existsSync(logPath)).toBe(false)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('el pool ocupado sale 503 con su mensaje y su code (y queda en el archivo)', async () => {
    const res = await fetch(`${url}/api/probe/busy`)
    const json = await res.json()
    expect(res.status).toBe(503)
    expect(json.code).toBe(DB_POOL_BUSY)
    expect(json.message).toBeTruthy()
    expect(readFileSync(logPath, 'utf-8').trim().split('\n')).toHaveLength(1)
  })

  // Como root (el build de Docker) chmod no impide escribir: la prueba no tiene sentido ahí.
  ;(process.getuid?.() === 0 ? it.skip : it)('sin permiso de escritura en el archivo, la respuesta es la misma', async () => {
    const locked = join(dir, 'locked')
    rmSync(locked, { recursive: true, force: true })
    mkdirSync(locked)
    chmodSync(locked, 0o500)
    process.env.ERROR_LOG_PATH = join(locked, 'errors.log')
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const res = await fetch(`${url}/api/probe/plain`)
      expect(res.status).toBe(500)
      expect((await res.json()).message).toBeUndefined()
      expect(stderr).toHaveBeenCalled()
    } finally {
      stderr.mockRestore()
      chmodSync(locked, 0o700)
      process.env.ERROR_LOG_PATH = logPath
    }
  })

  it('body JSON: 1,1 MB → 413; 900 KB → llega al controlador', async () => {
    const post = (bytes: number) =>
      fetch(`${url}/api/probe/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 'a'.repeat(bytes) }),
      })
    expect((await post(1.1 * 1024 * 1024)).status).toBe(413)
    const ok = await post(900 * 1024)
    expect(ok.status).toBe(201)
  })

  it('Swagger abre fuera de producción', async () => {
    const res = await fetch(`${url}/api`)
    expect(res.status).toBe(200)
  })
})

describe('Swagger en producción', () => {
  it('GET /api da 404', async () => {
    const env = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const { app, url } = await boot()
    try {
      const res = await fetch(`${url}/api`)
      expect(res.status).toBe(404)
    } finally {
      process.env.NODE_ENV = env
      await app.close()
    }
  })
})

describe('cierre limpio', () => {
  it('app.close() espera el pedido en curso', async () => {
    const { app, url } = await boot()
    const pending = fetch(`${url}/api/probe/slow`)
    await new Promise((r) => setTimeout(r, 100))
    await app.close()
    const res = await pending
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ done: true })
  })
})

describe('Sentry', () => {
  it('se inicia sin breadcrumbs y borra los datos del pedido', async () => {
    const env = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    const { app } = await boot()
    await app.close()
    process.env.NODE_ENV = env
    const opts = jest.mocked(Sentry.init).mock.calls.at(-1)![0] as any
    expect(opts.beforeBreadcrumb()).toBeNull()
    expect(opts.sendDefaultPii).toBe(false)
    const ev = scrubSentryEvent({
      request: { headers: { a: 'b' }, cookies: { c: 'd' }, data: 'body', url: '/x' },
      breadcrumbs: [{ message: 'x' }],
    } as any)
    expect(ev.request).toEqual({ url: '/x' })
    expect(ev.breadcrumbs).toBeUndefined()
  })
})

describe('archivo de errores', () => {
  it('rota al pasar el tope y guarda hasta keepFiles', () => {
    const p = join(dir, 'rot.log')
    writeFileSync(p, 'x'.repeat(50))
    appendErrorLine({ status: 500, message: 'a' }, { path: p, maxBytes: 10, keepFiles: 2 })
    expect(readFileSync(`${p}.1`, 'utf-8')).toBe('x'.repeat(50))
    expect(JSON.parse(readFileSync(p, 'utf-8')).message).toBe('a')
    writeFileSync(p, 'y'.repeat(50))
    appendErrorLine({ status: 500, message: 'b' }, { path: p, maxBytes: 10, keepFiles: 2 })
    writeFileSync(p, 'z'.repeat(50))
    appendErrorLine({ status: 500, message: 'c' }, { path: p, maxBytes: 10, keepFiles: 2 })
    expect(readFileSync(`${p}.1`, 'utf-8')).toBe('z'.repeat(50))
    expect(readFileSync(`${p}.2`, 'utf-8')).toBe('y'.repeat(50))
    expect(existsSync(`${p}.3`)).toBe(false)
  })
})
