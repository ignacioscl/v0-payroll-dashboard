/**
 * Probar el email sin HTTP (plans/plan-nest-email §8.9), por la misma política que todo mail:
 *   node dist/commons/email/email.cli.js verify            handshake SMTP sin mandar nada
 *   node dist/commons/email/email.cli.js send <destinatario> un mail con la plantilla `test`
 * En dev sin EMAIL_DEV_REDIRECT_TO no sale nada (`suppressed`). En PROD, dentro del contenedor:
 *   docker exec srs-suite-backend node dist/commons/email/email.cli.js verify
 * Sale con 0 si ok/sent, 1 si failed/suppressed, 2 si el uso es incorrecto.
 * Levanta solo EmailModule (no las bases).
 */
import 'dotenv/config'
import { hostname } from 'os'
import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { EmailModule } from './email.module'
import { EmailService } from './email.service'
import { EmailRequestError } from './email.types'

@Module({ imports: [EmailModule] })
class EmailCliModule {}

const USAGE = 'Uso: email.cli verify | email.cli send <destinatario>\n'

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

async function main(argv: string[]): Promise<number> {
  const [command, to, ...rest] = argv
  const isVerify = command === 'verify' && !to
  const isSend = command === 'send' && !!to && rest.length === 0
  if (!isVerify && !isSend) {
    process.stderr.write(USAGE)
    return 2
  }

  const app = await NestFactory.createApplicationContext(EmailCliModule, { logger: ['error', 'warn', 'log'] })
  try {
    const email = app.get(EmailService)
    const { mode } = email.status

    if (isVerify) {
      const result = await email.verify()
      out(JSON.stringify(result, null, 2))
      return result.ok ? 0 : 1
    }

    out(`mode=${mode} to=${to}`)
    try {
      const result = await email.send({
        purpose: 'email-smoke-test',
        audience: 'internal',
        to,
        subject: `[SRS jobs] email smoke test (${hostname()}, ${mode})`,
        template: { name: 'test', context: { hostname: hostname(), mode, sentAt: new Date().toISOString() } },
      })
      out(JSON.stringify(result, null, 2))
      return result.status === 'sent' ? 0 : 1
    } catch (e) {
      if (!(e instanceof EmailRequestError)) throw e
      process.stderr.write(`${e.message}\n`)
      return 2
    }
  } finally {
    await app.close()
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`)
    process.exit(1)
  })
