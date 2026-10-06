export type JobTrigger = 'cron' | 'api' | 'cli' | 'watchdog'
export type JobRunStatus = 'running' | 'ok' | 'failed' | 'skipped'
export type JobLogLevel = 'info' | 'warn' | 'error'

/** Lo que el runner le pasa a cada job en una corrida. */
export interface JobContext {
  runId: number
  trigger: JobTrigger
  dryRun: boolean
  force: boolean
  log(level: JobLogLevel, message: string, context?: Record<string, unknown>): Promise<void>
}

export interface JobResult {
  itemsTotal: number
  itemsChanged: number
  itemsSkipped: number
  itemsFailed: number
  summary?: Record<string, unknown>
}

/**
 * Campo del diálogo «Run job» del monitor (System Config › Jobs). `company` y las fechas van al
 * payload con su `key`; `boolean` con key `force` es la opción `force` de la corrida. Un job que
 * necesite otro tipo de campo lo agrega en su propio plan.
 */
export interface JobFormField {
  key: string
  type: 'company' | 'dateFrom' | 'dateTo' | 'boolean'
  label: string
}

/** Lo que el monitor necesita para ofrecer un job en «Run job». */
export interface JobForm {
  label: string
  fields: JobFormField[]
}

/**
 * Un job: `name` único y `run`. Con `form`, el monitor lo ofrece en «Run job» con esos campos. El payload es JSON plano (fechas como `YYYY-MM-DD`, nunca `Date`).
 * Todo job acepta `dryRun`; si escribe por unidades, también `force`.
 */
export interface JobHandler<P = Record<string, unknown>> {
  readonly name: string
  readonly form?: JobForm
  run(payload: P, ctx: JobContext): Promise<JobResult>
}

/** Token del array de jobs registrados (lo arma `JobsModule`). */
export const JOB_HANDLERS = Symbol('JOB_HANDLERS')

export const emptyJobResult = (): JobResult => ({
  itemsTotal: 0,
  itemsChanged: 0,
  itemsSkipped: 0,
  itemsFailed: 0,
})
