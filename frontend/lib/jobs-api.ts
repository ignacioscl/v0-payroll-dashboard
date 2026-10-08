/**
 * Monitor de jobs (System Config › Jobs, solo Admin General). Llega al Nest por el proxy
 * `/api/srs-kpis/*` → `api/srs/jobs/*` (el backend responde 403 a todo rol que no sea Admin General).
 */
import { isSrsBusy, SrsBusyError } from '@/lib/srs-busy-error'

export type JobRunStatus = 'running' | 'ok' | 'failed' | 'skipped'

export interface JobFormField {
  key: string
  type: 'company' | 'dateFrom' | 'dateTo' | 'boolean'
  label: string
}

export interface JobInfo {
  name: string
  label: string
  /** Tiene campos para «Run job». */
  runnable: boolean
  fields: JobFormField[]
}

export interface JobRun {
  id: number
  jobName: string
  trigger: 'cron' | 'api' | 'cli' | 'watchdog'
  status: JobRunStatus
  /** JSON */
  payload: string | null
  /** UTC `yyyy-MM-dd HH:mm:ss` */
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  itemsTotal: number
  itemsChanged: number
  itemsSkipped: number
  itemsFailed: number
  summary: string | null
  error: string | null
  host: string | null
  pid: number | null
}

export interface JobRunLogLine {
  id: number
  level: 'info' | 'warn' | 'error'
  message: string
  context: string | null
  /** Epoch en segundos. */
  ts: number
}

export interface JobDailyStatus {
  jobName: string
  state: 'ok' | 'failed' | 'missing' | 'disabled'
  reason: string | null
  lastRun: JobRun | null
}

export interface JobCompany {
  id: number
  name: string
}

const BASE = '/api/srs-kpis/jobs'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' })
  if (isSrsBusy(res)) throw new SrsBusyError()
  if (!res.ok) throw new JobsApiError(res.status, `Jobs ${path} (${res.status})`)
  return res.json() as Promise<T>
}

export class JobsApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export const fetchJobs = () => getJson<JobInfo[]>('')

export const fetchJobRuns = (name: string, limit = 20) =>
  getJson<JobRun[]>(`/runs?${new URLSearchParams({ ...(name ? { name } : {}), limit: String(limit) })}`)

export const fetchJobRunLog = (id: number) =>
  getJson<{ run: JobRun; lines: JobRunLogLine[] }>(`/runs/${id}/log`)

export const fetchJobsHealth = () => getJson<JobDailyStatus[]>('/health')

export const fetchJobCompanies = () => getJson<JobCompany[]>('/companies')

export async function runJob(
  name: string,
  body: { payload: Record<string, unknown>; force: boolean },
): Promise<{ runId: number; status: JobRunStatus; error?: string }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(name)}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  if (isSrsBusy(res)) throw new SrsBusyError()
  if (!res.ok) throw new JobsApiError(res.status, `Run ${name} (${res.status})`)
  return res.json()
}

/** Duración legible: `42 s`, `1 m 13 s`. */
export function formatJobDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return ''
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total} s`
  const m = Math.floor(total / 60)
  const s = total % 60
  return s ? `${m} m ${s} s` : `${m} m`
}

/** UTC `yyyy-MM-dd HH:mm:ss` → `MM/DD/YYYY hh:mm:ss AM` en New York. */
export function formatJobTimeNy(utc: string | null | undefined, withSeconds = true): string {
  if (!utc) return ''
  const d = new Date(`${utc.replace(' ', 'T')}Z`)
  if (Number.isNaN(d.getTime())) return ''
  const date = d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  })
  return `${date} ${time}`
}
