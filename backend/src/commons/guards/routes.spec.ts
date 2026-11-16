/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Toda ruta del Nest pide login salvo las declaradas públicas una por una (plans/plan-buenas-practicas-v0, 3.5; regla
 * `.cursor/rules/nest-security-baseline.mdc`). Sin base: carga cada `*.controller.ts` y lee la metadata de Nest.
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Controller, Get, INestApplication, Module, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants'
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum'
import { APP_GUARD, NestFactory } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

import { IS_PUBLIC_KEY, Public } from '../decorator/public.decorator'
import { SrsAuthModule } from '../../srs/auth/srs-auth.module'
import { SrsJwtGuard } from '../../srs/auth/srs-jwt.guard'
import { SrsAuthContextService } from '../../srs/auth/srs-auth-context.service'

const SRC = join(__dirname, '..', '..')
const EXPECTED_PUBLIC = ['GET /health', 'GET /health/jobs']

function controllerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'code-generator' ? [] : controllerFiles(full)
    return e.name.endsWith('.controller.ts') ? [full] : []
  })
}

function controllers(): any[] {
  return controllerFiles(SRC).flatMap((f) =>
    Object.values(jest.requireActual<Record<string, unknown>>(f)).filter((v: any) => typeof v === 'function' && Reflect.hasMetadata(PATH_METADATA, v)),
  )
}

function join2(base: string, path: string): string {
  return `/${[base, path].map((p) => p.replace(/^\/|\/$/g, '')).filter(Boolean).join('/')}`
}

function routesOf(ctrl: any): { key: string; handler: any; name: string }[] {
  const bases: string[] = [].concat(Reflect.getMetadata(PATH_METADATA, ctrl))
  const out: { key: string; handler: any; name: string }[] = []
  for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
    const handler = ctrl.prototype[name]
    if (name === 'constructor' || typeof handler !== 'function' || !Reflect.hasMetadata(PATH_METADATA, handler)) continue
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)]
    for (const base of bases) {
      for (const path of [].concat(Reflect.getMetadata(PATH_METADATA, handler))) out.push({ key: `${method} ${join2(base, path)}`, handler, name })
    }
  }
  return out
}

describe('rutas del Nest', () => {
  const all = controllers()

  it('encuentra los controladores', () => {
    expect(all.length).toBeGreaterThan(20)
  })

  it('las únicas rutas públicas son GET /health y GET /health/jobs', () => {
    const pub = all.flatMap(routesOf).filter((r) => Reflect.getMetadata(IS_PUBLIC_KEY, r.handler)).map((r) => r.key)
    expect([...new Set(pub)].sort()).toEqual(EXPECTED_PUBLIC)
  })

  it('ninguna clase lleva @Public() (abriría las rutas que se sumen después)', () => {
    expect(all.filter((c) => Reflect.getMetadata(IS_PUBLIC_KEY, c)).map((c) => c.name)).toEqual([])
  })

  it('todo @Param tiene pipe o DTO', () => {
    const bad: string[] = []
    for (const ctrl of all) {
      for (const { name } of routesOf(ctrl)) {
        const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, ctrl, name) ?? {}
        const types: any[] = Reflect.getMetadata('design:paramtypes', ctrl.prototype, name) ?? []
        for (const [k, a] of Object.entries<any>(args)) {
          if (Number(k.split(':')[0]) !== RouteParamtypes.PARAM) continue
          const type = types[a.index]
          const isDto = typeof type === 'function' && ![String, Number, Object, Boolean].includes(type)
          if (!(a.pipes?.length > 0) && !isDto) bad.push(`${ctrl.name}.${name} @Param('${a.data ?? ''}')`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('SrsAuthModule registra SrsJwtGuard como APP_GUARD', () => {
    const providers: any[] = Reflect.getMetadata('providers', SrsAuthModule) ?? []
    expect(providers).toContainEqual({ provide: APP_GUARD, useClass: SrsJwtGuard })
  })
})

describe('guard global', () => {
  @Controller('probe')
  class ProbeController {
    @Get('closed') closed() {
      return { ok: true }
    }
    @Public()
    @Get('open')
    open() {
      return { ok: true }
    }
  }

  @Module({
    controllers: [ProbeController],
    providers: [
      { provide: JwtService, useValue: new JwtService({}) },
      { provide: ConfigService, useValue: { get: () => 'secret-de-prueba' } },
      { provide: SrsAuthContextService, useValue: { resolveContext: jest.fn() } },
      { provide: APP_GUARD, useClass: SrsJwtGuard },
    ],
  })
  class ProbeModule {}

  let app: INestApplication
  let url: string
  beforeAll(async () => {
    app = await NestFactory.create(ProbeModule, { logger: false })
    await app.listen(0, '127.0.0.1')
    url = await app.getUrl()
  })
  afterAll(() => app.close())

  it('sin token: 401', async () => {
    expect((await fetch(`${url}/probe/closed`)).status).toBe(401)
  })

  it('con @Public(): 200 sin token', async () => {
    expect((await fetch(`${url}/probe/open`)).status).toBe(200)
  })
})
