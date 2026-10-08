import { inspect } from 'util'

import { loadEmailConfig } from './email.config'
import { buildTransportOptions } from './email.transport'

const DIR = '/tmp/templates'
const PASS = 'clave-super-secreta-123'
const SMTP = {
  EMAIL_HOST: 'mail.smtp.test',
  EMAIL_PORT: '587',
  EMAIL_USER: 'srs-user',
  EMAIL_PASS: PASS,
  EMAIL_FROM: 'no-reply@srs.test',
}
const REDIRECT = { EMAIL_DEV_REDIRECT_TO: 'dev@srs.test' }

describe('loadEmailConfig — modos (plan §8.4)', () => {
  it.each([
    ['production, SMTP completo, sin redirect', 'live', { NODE_ENV: 'production', ...SMTP }],
    ['production, SMTP completo, con redirect', 'redirect', { NODE_ENV: 'production', ...SMTP, ...REDIRECT }],
    ['production, sin SMTP', 'disabled', { NODE_ENV: 'production' }],
    ['production, SMTP incompleto (sin clave)', 'disabled', { NODE_ENV: 'production', ...SMTP, EMAIL_PASS: '' }],
    ['production, redirect inválido', 'disabled', { NODE_ENV: 'production', ...SMTP, EMAIL_DEV_REDIRECT_TO: 'nada' }],
    ['test, SMTP completo y redirect', 'suppressed', { NODE_ENV: 'test', ...SMTP, ...REDIRECT }],
    ['development, SMTP completo y redirect', 'redirect', { NODE_ENV: 'development', ...SMTP, ...REDIRECT }],
    ['NODE_ENV vacío, SMTP completo y redirect', 'redirect', { ...SMTP, ...REDIRECT }],
    ['"Production" (no exacto) sin redirect', 'suppressed', { NODE_ENV: 'Production', ...SMTP }],
    ['development, SMTP completo, sin redirect', 'suppressed', { NODE_ENV: 'development', ...SMTP }],
    ['development, sin SMTP, con redirect', 'suppressed', { NODE_ENV: 'development', ...REDIRECT }],
    ['development, sin SMTP ni redirect', 'suppressed', { NODE_ENV: 'development' }],
  ])('%s → %s', (_label, mode, env) => {
    expect(loadEmailConfig(env as NodeJS.ProcessEnv, DIR).mode).toBe(mode)
  })

  it('production con redirect deja un problema (se loguea como error)', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, ...REDIRECT }, DIR)
    expect(cfg.redirectTo).toBe('dev@srs.test')
    expect(cfg.problems.join(' ')).toContain('EMAIL_DEV_REDIRECT_TO está definida en producción')
  })

  it('production sin SMTP: problema, sin tirar', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production' }, DIR)
    expect(cfg.smtp).toBeNull()
    expect(cfg.problems).toEqual(['EMAIL_HOST vacío: email apagado'])
  })

  it('dev con redirect y sin SMTP: avisa qué falta', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'development', ...REDIRECT }, DIR)
    expect(cfg.problems).toEqual(['EMAIL_DEV_REDIRECT_TO pide EMAIL_HOST/USER/PASS/FROM'])
    expect(cfg.suppressedReason).toBe('EMAIL_DEV_REDIRECT_TO needs EMAIL_HOST/USER/PASS/FROM')
  })

  it('dev con SMTP y sin redirect: motivo de la supresión', () => {
    expect(loadEmailConfig({ NODE_ENV: 'development', ...SMTP }, DIR).suppressedReason).toBe(
      'dev without EMAIL_DEV_REDIRECT_TO',
    )
  })

  it('dev normal (sin nada): sin problemas', () => {
    expect(loadEmailConfig({ NODE_ENV: 'development' }, DIR).problems).toEqual([])
  })
})

describe('loadEmailConfig — validaciones (plan §8.5)', () => {
  it('EMAIL_PORT inválido → problema y sin SMTP', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_PORT: '58x7' }, DIR)
    expect(cfg.mode).toBe('disabled')
    expect(cfg.problems.join(' ')).toContain('EMAIL_PORT inválido ("58x7")')
  })

  it('EMAIL_PORT vacío → 587 con STARTTLS', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_PORT: '' }, DIR)
    expect(cfg.smtp).toMatchObject({ port: 587, secure: false, requireTLS: true })
  })

  it('puerto 465 → TLS implícito', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_PORT: '465' }, DIR)
    expect(cfg.smtp).toMatchObject({ port: 465, secure: true, requireTLS: false })
  })

  it('host con esquema → inválido', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_HOST: 'smtp://mail.smtp.test' }, DIR)
    expect(cfg.mode).toBe('disabled')
    expect(cfg.problems.join(' ')).toContain('EMAIL_HOST inválido')
  })

  it('host sin user/pass → nunca un SMTP a medias', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production', EMAIL_HOST: 'mail.smtp.test', EMAIL_FROM: SMTP.EMAIL_FROM }, DIR)
    expect(cfg.mode).toBe('disabled')
    expect(cfg.smtp).toBeNull()
    expect(cfg.problems.join(' ')).toContain('EMAIL_HOST está pero falta EMAIL_USER/EMAIL_PASS')
  })

  it('EMAIL_FROM inválido → disabled', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_FROM: 'SRS <no-reply@srs.test>' }, DIR)
    expect(cfg.mode).toBe('disabled')
    expect(cfg.senders.srs).toBeUndefined()
    expect(cfg.problems.join(' ')).toContain('EMAIL_FROM inválido')
  })

  it('EMAIL_DEV_REDIRECT_TO inválido en dev → suppressed con problema', () => {
    const cfg = loadEmailConfig({ NODE_ENV: 'development', ...SMTP, EMAIL_DEV_REDIRECT_TO: 'yo' }, DIR)
    expect(cfg.mode).toBe('suppressed')
    expect(cfg.problems.join(' ')).toContain('EMAIL_DEV_REDIRECT_TO inválida')
  })

  it('EMAIL_FROM_NAME vacío → SRS SUITE; con valor, ese', () => {
    expect(loadEmailConfig({ NODE_ENV: 'production', ...SMTP }, DIR).senders.srs).toEqual({
      address: 'no-reply@srs.test',
      name: 'SRS SUITE',
    })
    expect(
      loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_FROM_NAME: ' Otro Nombre ' }, DIR).senders.srs?.name,
    ).toBe('Otro Nombre')
  })
})

describe('loadEmailConfig — secretos y transporte', () => {
  const cfg = loadEmailConfig({ NODE_ENV: 'production', ...SMTP }, DIR)

  it('la clave no sale al serializar ni al inspeccionar, pero está para el transporte', () => {
    expect(JSON.stringify(cfg)).not.toContain(PASS)
    expect(inspect(cfg, { depth: 5 })).not.toContain(PASS)
    expect(Object.keys(cfg.smtp!)).not.toContain('pass')
    expect(cfg.smtp!.pass).toBe(PASS)
  })

  it('ningún problema contiene la clave', () => {
    const bad = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_HOST: 'x y', EMAIL_PORT: 'z' }, DIR)
    expect(bad.problems.join(' ')).not.toContain(PASS)
  })

  it('opciones del transporte: STARTTLS obligatorio, certificado verificado, timeouts cortos, sin pool', () => {
    const opts = buildTransportOptions(cfg.smtp!)
    expect(opts.requireTLS).toBe(true)
    expect(opts.secure).toBe(false)
    expect((opts.tls as { rejectUnauthorized?: boolean }).rejectUnauthorized).not.toBe(false)
    expect(opts).not.toHaveProperty('name')
    expect(opts).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      pool: false,
      disableUrlAccess: true,
    })
  })
})
