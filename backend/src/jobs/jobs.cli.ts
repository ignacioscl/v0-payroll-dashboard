/* eslint-disable no-console */
/**
 * Correr un job a mano, sin HTTP:
 *   node dist/jobs/jobs.cli.js run payroll-snapshot --payload '{"idContratista":79,"desde":"2026-07-01","hasta":"2026-08-15"}' [--dry-run] [--force]
 * Sale con 0 si la corrida terminó `ok`, 1 si no. El cron nunca arranca en este contexto.
 */
process.env.JOBS_CRON_ENABLED = 'false'

import { NestFactory } from '@nestjs/core'
import { initializeTransactionalContext } from 'typeorm-transactional'

function parseArgs(argv: string[]) {
  const [command, name, ...rest] = argv
  let payload: Record<string, unknown> = {}
  let dryRun = false
  let force = false
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (arg === '--dry-run') dryRun = true
    else if (arg === '--force') force = true
    else if (arg === '--payload') payload = JSON.parse(rest[++i] ?? '{}')
    else throw new Error(`Argumento desconocido: ${arg}`)
  }
  return { command, name, payload, dryRun, force }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  if (args.command !== 'run' || !args.name) {
    console.error('Uso: jobs.cli run <job> [--payload JSON] [--dry-run] [--force]')
    return 2
  }

  initializeTransactionalContext()
  // Import diferido: JOBS_CRON_ENABLED ya quedó en false antes de cargar los módulos.
  const { AppModule } = await import('../app.module')
  const { JobRunnerService } = await import('./job-runner.service')

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] })
  try {
    const outcome = await app.get(JobRunnerService).run(args.name, args.payload, 'cli', {
      dryRun: args.dryRun,
      force: args.force,
    })
    console.log(JSON.stringify(outcome, null, 2))
    return outcome.status === 'ok' ? 0 : 1
  } finally {
    await app.close()
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
