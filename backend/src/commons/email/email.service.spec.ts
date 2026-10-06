import { Logger } from '@nestjs/common'

import { EmailConfig, loadEmailConfig } from './email.config'
import { EmailHealthIndicator } from './email-health.indicator'
import { EmailService } from './email.service'
import { EMAIL_TEMPLATES_DIR, EmailTemplateRenderer } from './email.templates'
import { EMAIL_MAX_ATTACHMENTS_BYTES, EmailMode, EmailRequestError, SendEmailRequest } from './email.types'

const PASS = 'clave-super-secreta-123'
const SMTP = {
  EMAIL_HOST: 'mail.smtp.test',
  EMAIL_PORT: '587',
  EMAIL_USER: 'srs-user',
  EMAIL_PASS: PASS,
  EMAIL_FROM: 'no-reply@srs.test',
}
const ENVS: Record<EmailMode, NodeJS.ProcessEnv> = {
  live: { NODE_ENV: 'production', ...SMTP },
  redirect: { NODE_ENV: 'development', ...SMTP, EMAIL_DEV_REDIRECT_TO: 'dev@srs.test' },
  suppressed: { NODE_ENV: 'development' },
  disabled: { NODE_ENV: 'production' },
}
const MODES: EmailMode[] = ['live', 'redirect', 'suppressed', 'disabled']

function setup(mode: EmailMode) {
  const config: EmailConfig = loadEmailConfig(ENVS[mode], EMAIL_TEMPLATES_DIR)
  expect(config.mode).toBe(mode)
  const transporter = {
    sendMail: jest.fn().mockResolvedValue({ messageId: '<abc@srs.test>' }),
    verify: jest.fn().mockResolvedValue(true),
  }
  const hasTransport = mode === 'live' || mode === 'redirect'
  const service = new EmailService(
    config,
    hasTransport ? transporter : null,
    new EmailTemplateRenderer(EMAIL_TEMPLATES_DIR, false),
  )
  return { service, transporter, config }
}

const BODY = 'cuerpo-secreto-del-mail'
const req = (over: Partial<SendEmailRequest> = {}): SendEmailRequest => ({
  purpose: 'job-alert',
  audience: 'internal',
  to: 'a@x.test',
  subject: '[SRS jobs] x failed',
  text: BODY,
  ...over,
})

let logs: { level: string; msg: string }[]
beforeEach(() => {
  logs = []
  for (const level of ['log', 'warn', 'error'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation((msg: unknown, ..._rest: unknown[]) => {
      logs.push({ level, msg: String(msg) })
    })
  }
})
afterEach(() => jest.restoreAllMocks())

describe('EmailService.send', () => {
  it('(1) suppressed → no llama al transporte; una línea con purpose/to/subject y sin el cuerpo', async () => {
    const { service, transporter } = setup('suppressed')
    const r = await service.send(req())
    expect(r).toMatchObject({ status: 'suppressed', mode: 'suppressed', to: ['a@x.test'], reason: 'dev without SMTP config' })
    expect(transporter.sendMail).not.toHaveBeenCalled()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('log')
    expect(logs[0].msg).toContain('purpose=job-alert')
    expect(logs[0].msg).toContain('to=a@x.test')
    expect(logs[0].msg).toContain('subject="[SRS jobs] x failed"')
    expect(logs[0].msg).toContain('status=suppressed')
    expect(logs[0].msg).not.toContain(BODY)
  })

  it('(2) redirect → un envío a la casilla de dev, sin cc/bcc, asunto [DEV → …], X-SRS-Original-To', async () => {
    const { service, transporter } = setup('redirect')
    const r = await service.send(req({ to: ['a@x.test', 'b@y.test'], cc: 'c@z.test', bcc: 'd@w.test' }))
    expect(transporter.sendMail).toHaveBeenCalledTimes(1)
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toEqual(['dev@srs.test'])
    expect(mail.cc).toBeUndefined()
    expect(mail.bcc).toBeUndefined()
    expect(mail.subject).toBe('[DEV → a@x.test, b@y.test, c@z.test, d@w.test] [SRS jobs] x failed')
    expect(mail.headers['X-SRS-Original-To']).toBe('to: a@x.test, b@y.test; cc: c@z.test; bcc: d@w.test')
    expect(mail.headers['X-SRS-Purpose']).toBe('job-alert')
    expect(r).toMatchObject({
      status: 'sent',
      mode: 'redirect',
      to: ['dev@srs.test'],
      redirectedFrom: ['a@x.test', 'b@y.test', 'c@z.test', 'd@w.test'],
      messageId: '<abc@srs.test>',
    })
  })

  it('(3) live → destinatarios intactos, from SRS SUITE, X-SRS-Purpose, solo texto', async () => {
    const { service, transporter } = setup('live')
    const r = await service.send(req({ cc: { address: 'c@z.test', name: 'Ce' } }))
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.from).toEqual({ name: 'SRS SUITE', address: 'no-reply@srs.test' })
    expect(mail.to).toEqual([{ name: '', address: 'a@x.test' }])
    expect(mail.cc).toEqual([{ name: 'Ce', address: 'c@z.test' }])
    expect(mail.subject).toBe('[SRS jobs] x failed')
    expect(mail.headers).toEqual({ 'X-SRS-Purpose': 'job-alert' })
    expect(mail.text).toBe(BODY)
    expect(mail.html).toBeUndefined()
    expect(r).toMatchObject({ status: 'sent', mode: 'live', to: ['a@x.test'], messageId: '<abc@srs.test>' })
    expect(r.redirectedFrom).toBeUndefined()
  })

  it('(3b) live con plantilla → html con layout y texto de la .txt.hbs', async () => {
    const { service, transporter } = setup('live')
    await service.send(req({ text: undefined, template: { name: 'test', context: { hostname: 'h', mode: 'live' } } }))
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.html).toContain('This email was sent automatically, please do not reply')
    expect(mail.text).toContain('[SRS jobs] x failed')
  })

  it('(4) el transporte rechaza → failed sin tirar, una línea error', async () => {
    const { service, transporter } = setup('live')
    transporter.sendMail.mockRejectedValue(Object.assign(new Error('Connection timeout'), { code: 'ETIMEDOUT' }))
    const r = await service.send(req())
    expect(r.status).toBe('failed')
    expect(r.error).toBe('ETIMEDOUT: Connection timeout')
    expect(logs.filter((l) => l.level === 'error')).toHaveLength(1)
  })

  it.each(MODES)('(5) sin destinatario válido → EmailRequestError (%s)', async (mode) => {
    const { service, transporter } = setup(mode)
    for (const to of [[], undefined, ['  '], 'no-es-mail']) {
      await expect(service.send(req({ to: to as any }))).rejects.toBeInstanceOf(EmailRequestError)
    }
    expect(transporter.sendMail).not.toHaveBeenCalled()
  })

  it.each(MODES)('(6)(7)(8)(9)(12)(13) errores del que llama tiran en %s', async (mode) => {
    const { service, transporter } = setup(mode)
    const bad: Partial<SendEmailRequest>[] = [
      { sender: 'billing' as any }, // (6)
      { text: undefined, template: { name: 'no-existe', context: {} } }, // (7)
      { purpose: '' }, // (8)
      { purpose: 'Job Alert' }, // (8)
      { audience: undefined as any }, // (8)
      { html: '<p>x</p>', text: undefined }, // (9)
      { template: { name: 'test', context: {} }, html: '<p>x</p>' },
      { text: undefined }, // sin cuerpo
      { attachments: [{ filename: 'a.bin', contentType: 'application/octet-stream', content: Buffer.alloc(EMAIL_MAX_ATTACHMENTS_BYTES + 1) }] }, // (12)
      { audience: 'client' }, // (13)
    ]
    for (const over of bad) {
      await expect(service.send(req(over))).rejects.toBeInstanceOf(EmailRequestError)
    }
    expect(transporter.sendMail).not.toHaveBeenCalled()
  })

  it('(10) la clave no aparece en el log ni en result.error aunque el transporte la incluya', async () => {
    const { service, transporter } = setup('live')
    transporter.sendMail.mockRejectedValue(new Error(`535 Authentication failed for srs-user:${PASS}`))
    const r = await service.send(req())
    expect(r.error).not.toContain(PASS)
    expect(r.error).toContain('***')
    for (const l of logs) expect(l.msg).not.toContain(PASS)
  })

  it('(11) normaliza: trim, minúsculas y sin duplicados', async () => {
    const { service, transporter } = setup('live')
    const r = await service.send(req({ to: [' A@X.test ', 'a@x.test'], cc: ['a@x.test'] }))
    expect(r.to).toEqual(['a@x.test'])
    const mail = transporter.sendMail.mock.calls[0][0]
    expect(mail.to).toEqual([{ name: '', address: 'a@x.test' }])
    expect(mail.cc).toBeUndefined()
  })

  it('(12b) adjuntos bajo el tope pasan', async () => {
    const { service, transporter } = setup('live')
    await service.send(req({ attachments: [{ filename: 'a.csv', contentType: 'text/csv', content: 'a,b' }] }))
    expect(transporter.sendMail.mock.calls[0][0].attachments).toEqual([
      { filename: 'a.csv', contentType: 'text/csv', content: 'a,b' },
    ])
  })

  it('(14) disabled → failed con "email disabled: …", sin tirar ni transporte', async () => {
    const { service } = setup('disabled')
    const r = await service.send(req())
    expect(r).toMatchObject({ status: 'failed', mode: 'disabled' })
    expect(r.error).toBe('email disabled: EMAIL_HOST vacío: email apagado')
    expect(logs[0].level).toBe('error')
  })

  it('redirect en PROD: sale a la casilla y la línea es error', async () => {
    const config = loadEmailConfig({ NODE_ENV: 'production', ...SMTP, EMAIL_DEV_REDIRECT_TO: 'dev@srs.test' }, EMAIL_TEMPLATES_DIR)
    const transporter = { sendMail: jest.fn().mockResolvedValue({ messageId: 'x' }), verify: jest.fn() }
    const service = new EmailService(config, transporter, new EmailTemplateRenderer(EMAIL_TEMPLATES_DIR, false))
    const r = await service.send(req())
    expect(r).toMatchObject({ status: 'sent', mode: 'redirect', to: ['dev@srs.test'] })
    expect(logs[0].level).toBe('error')
  })
})

describe('EmailService.verify, arranque y salud', () => {
  it('verify sin transporte → ok false con el modo', async () => {
    const { service } = setup('suppressed')
    expect(await service.verify()).toEqual({ ok: false, mode: 'suppressed', error: 'email suppressed: dev without SMTP config' })
  })

  it('verify live → handshake; si falla, error redactado', async () => {
    const { service, transporter } = setup('live')
    expect(await service.verify()).toEqual({ ok: true, mode: 'live' })
    transporter.verify.mockRejectedValue(new Error(`Invalid login ${PASS}`))
    const r = await service.verify()
    expect(r.ok).toBe(false)
    expect(r.error).not.toContain(PASS)
  })

  it('arranque en PROD sin SMTP: error, sin clave, sin tirar', () => {
    const { service } = setup('disabled')
    expect(() => service.onModuleInit()).not.toThrow()
    expect(logs.some((l) => l.level === 'error' && l.msg.includes('mode=disabled'))).toBe(true)
  })

  it('arranque sin plantillas (no se copiaron a dist) → error, sin tirar', () => {
    const config = loadEmailConfig(ENVS.suppressed, '/no/existe')
    const service = new EmailService(config, null, new EmailTemplateRenderer('/no/existe', false))
    expect(() => service.onModuleInit()).not.toThrow()
    expect(logs.some((l) => l.level === 'error' && l.msg.includes('no hay plantillas en /no/existe'))).toBe(true)
  })

  it('arranque live: modo, host, usuario enmascarado y from; nunca la clave', () => {
    const { service } = setup('live')
    service.onModuleInit()
    const line = logs[0].msg
    expect(line).toContain('mode=live')
    expect(line).toContain('host=mail.smtp.test:587')
    expect(line).toContain('user=sr***')
    expect(line).toContain('from="SRS SUITE <no-reply@srs.test>"')
    for (const l of logs) expect(l.msg).not.toContain(PASS)
  })

  it.each([
    ['live', true],
    ['disabled', false],
  ] as const)('salud en PROD %s → up=%s', async (mode, up) => {
    const { config } = setup(mode)
    const indicator = new EmailHealthIndicator(config)
    if (up) expect(await indicator.isHealthy()).toEqual({ email: { status: 'up', mode: 'live' } })
    else await expect(indicator.isHealthy()).rejects.toThrow('email: mode=disabled in production')
  })

  it('salud en dev suppressed → up', async () => {
    const { config } = setup('suppressed')
    expect(await new EmailHealthIndicator(config).isHealthy()).toEqual({ email: { status: 'up', mode: 'suppressed' } })
  })
})
