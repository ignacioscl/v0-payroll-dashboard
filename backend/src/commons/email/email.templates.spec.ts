import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { EMAIL_TEMPLATES_DIR, EmailTemplateRenderer } from './email.templates'
import { EmailRequestError } from './email.types'

describe('plantillas del módulo (src/commons/email/templates)', () => {
  const renderer = new EmailTemplateRenderer(EMAIL_TEMPLATES_DIR, false)
  const names = renderer.names()

  it('hay al menos la plantilla del smoke test', () => {
    expect(names).toContain('test')
  })

  it.each(names)('%s: tiene su .txt.hbs y compila con contexto vacío', (name) => {
    const out = renderer.render(name, {})
    expect(typeof out.html).toBe('string')
    expect(typeof out.text).toBe('string')
  })

  it('ninguna plantilla está rota (lo mismo que mira el arranque)', () => {
    expect(renderer.precompileAll()).toEqual([])
  })

  it('test: layout SRS, asunto y pie en HTML y en texto; escapa el contexto en HTML', () => {
    const subject = '[SRS jobs] email smoke test (host-1, suppressed)'
    const out = renderer.render('test', { subject, hostname: '<b>host-1</b>', mode: 'suppressed', sentAt: 'x' })
    expect(out.html).toContain('This email was sent automatically, please do not reply')
    expect(out.html).toContain('SRS Suite')
    expect(out.html).toContain('#35404f')
    expect(out.html).toContain(`<title>${subject}</title>`)
    expect(out.html).toContain('&lt;b&gt;host-1&lt;/b&gt;')
    expect(out.text).toContain(subject)
    expect(out.text).toContain('This email was sent automatically')
    expect(out.text).toContain('Host: <b>host-1</b>')
    expect(out.text).not.toContain('<table')
  })
})

describe('EmailTemplateRenderer — errores y recarga', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'email-tpl-'))
    mkdirSync(join(dir, 'partials'))
    writeFileSync(join(dir, 'partials', 'layout.hbs'), '<main>{{> @partial-block }}</main>')
    writeFileSync(join(dir, 'a.hbs'), '{{#> layout}}<h1>{{x}}</h1>{{/layout}}')
    writeFileSync(join(dir, 'a.txt.hbs'), 'A {{x}}')
    writeFileSync(join(dir, 'solo-html.hbs'), '<p>x</p>')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('plantilla inexistente → EmailRequestError', () => {
    expect(() => new EmailTemplateRenderer(dir, false).render('nada', {})).toThrow(EmailRequestError)
  })

  it('sin .txt.hbs → EmailRequestError; precompileAll la reporta sin tirar', () => {
    const r = new EmailTemplateRenderer(dir, false)
    expect(() => r.render('solo-html', {})).toThrow(/txt\.hbs/)
    expect(r.precompileAll()).toEqual([expect.objectContaining({ name: 'solo-html' })])
  })

  it('nombre con .. o partials/ → EmailRequestError', () => {
    const r = new EmailTemplateRenderer(dir, false)
    expect(() => r.render('../a', {})).toThrow(EmailRequestError)
    expect(() => r.render('partials/layout', {})).toThrow(EmailRequestError)
  })

  it('texto sin escape HTML', () => {
    expect(new EmailTemplateRenderer(dir, false).render('a', { x: 'a & b' }).text).toBe('A a & b')
  })

  it('con recarga (dev) un .hbs editado se ve; sin recarga queda en caché', () => {
    const dev = new EmailTemplateRenderer(dir, true)
    const prod = new EmailTemplateRenderer(dir, false)
    expect(dev.render('a', { x: 1 }).html).toBe('<main><h1>1</h1></main>')
    expect(prod.render('a', { x: 1 }).html).toBe('<main><h1>1</h1></main>')
    writeFileSync(join(dir, 'a.hbs'), '{{#> layout}}<h2>{{x}}</h2>{{/layout}}')
    expect(dev.render('a', { x: 1 }).html).toBe('<main><h2>1</h2></main>')
    expect(prod.render('a', { x: 1 }).html).toBe('<main><h1>1</h1></main>')
  })
})
