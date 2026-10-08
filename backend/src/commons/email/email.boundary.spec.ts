import { readdirSync, readFileSync } from 'fs'
import { join, relative, sep } from 'path'

/**
 * Una sola puerta (regla nest-email-module.mdc; plans/plan-nest-email §8.10): fuera de
 * src/commons/email nadie importa nodemailer, handlebars ni @nestjs-modules/mailer. Corre aunque
 * el lint del backend esté apagado. Si falla, el que está mal es el import, no este test.
 */
const SRC = join(__dirname, '..', '..')
const EMAIL_DIR = join(SRC, 'commons', 'email')
const FORBIDDEN = /(?:from\s+|require\(\s*|import\(\s*|import\s+)['"](nodemailer|handlebars|@nestjs-modules\/mailer)(?:\/[^'"]*)?['"]/

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (full !== EMAIL_DIR && entry.name !== 'node_modules') out.push(...tsFiles(full))
    } else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('frontera del módulo de email', () => {
  it('ningún archivo de src/ fuera de commons/email importa nodemailer, handlebars ni @nestjs-modules/mailer', () => {
    const offenders = tsFiles(SRC)
      .filter((file) => FORBIDDEN.test(readFileSync(file, 'utf-8')))
      .map((file) => relative(SRC, file).split(sep).join('/'))
    expect(offenders).toEqual([])
  })

  it('el patrón detecta los imports prohibidos', () => {
    expect(FORBIDDEN.test("import * as nodemailer from 'nodemailer'")).toBe(true)
    expect(FORBIDDEN.test("import { MailerService } from '@nestjs-modules/mailer'")).toBe(true)
    expect(FORBIDDEN.test("const h = require('handlebars')")).toBe(true)
    expect(FORBIDDEN.test("import SMTPTransport from 'nodemailer/lib/smtp-transport'")).toBe(true)
    expect(FORBIDDEN.test("import { EmailService } from '../commons/email/email.service'")).toBe(false)
  })
})
