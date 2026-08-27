export type GenericCatalogCategory = 36 | 44

export interface GenericCatalogItem {
  id: number
  name: string
  price: number | null
  canDelete: boolean
}

export interface GenericInvoiceConfig {
  hasGenericInvoice: boolean
  canCreate: boolean
  canDeleteCatalogItem: boolean
}

export type GenericInvoiceItemPayload =
  | { kind?: 'free'; idRel?: number; description: string; qty?: number; unitAmount: number }
  | { kind: 'ttk'; idEmployee: number; onlyTimecard?: boolean }

export interface CreateGenericInvoicePayload {
  idDealer: number
  dateFrom: string
  dateTo: string
  invoiceNote?: string
  headerNote?: string
  tax?: number
  items: GenericInvoiceItemPayload[]
}

export interface UpdateGenericInvoicePayload {
  dateFrom: string
  dateTo: string
  invoiceNote?: string
  headerNote?: string
  tax?: number
  items: GenericInvoiceItemPayload[]
}

export interface CreateGenericInvoiceResponse {
  id: number
  invoiceNro: number
  fullNro: string
}

export interface UpdateGenericInvoiceResponse {
  id: number
  fullNro: string
}

export interface GenericTtkEmployeeRow {
  idEmployee: number
  nombreEmployee: string
  rolName: string | null
  dptoName: string | null
  hoursReg: number
  amountDealer: number
  alreadyOnInvoice: boolean
  hoursUnbilledInRange: number
}

export interface GenericTtkEmployeesResponse {
  rows: GenericTtkEmployeeRow[]
  totals: { employees: number; hours: number; amountDealer: number }
}

export interface GenericInvoiceFreeLine {
  kind: 'free'
  idRel: number
  description: string
  qty: number | null
  unitAmount: number
  isPaid: boolean
}

export interface GenericInvoiceTtkLine {
  kind: 'ttk'
  idRels: number[]
  idEmployee: number
  nombreEmployee: string
  rolName: string | null
  dptoName: string | null
  hoursReg: number
  amountDealer: number
  onlyTimecard: boolean
  isPaid: boolean
}

export interface GenericInvoiceDetail {
  id: number
  fullNro: string
  idDealer: number
  dealerName: string
  dateFrom: string
  dateTo: string
  invoiceNote: string | null
  headerNote: string | null
  tax: number | null
  discount: number | null
  discountType: number | null
  discountDetail: string | null
  statementPaid: boolean
  items: Array<GenericInvoiceFreeLine | GenericInvoiceTtkLine>
}

export class GenericInvoiceApiError extends Error {
  status: number
  code?: string
  meta?: Record<string, unknown>

  constructor(
    message: string,
    status: number,
    code?: string,
    meta?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'GenericInvoiceApiError'
    this.status = status
    this.code = code
    this.meta = meta
  }
}

export function isGenericInvoiceApiError(err: unknown): err is GenericInvoiceApiError {
  return err instanceof GenericInvoiceApiError
}

const BASE = '/api/srs-kpis/billing'

type NestErrorBody = {
  message?: string | string[]
  validationErrors?: Array<{ field?: string; message?: string } | string> | string
  statusCode?: number
  code?: string
  meta?: Record<string, unknown>
}

function formatValidationErrors(
  validationErrors: NestErrorBody['validationErrors'],
): string | null {
  if (!validationErrors) return null
  if (typeof validationErrors === 'string') {
    const trimmed = validationErrors.trim()
    return trimmed || null
  }
  if (!Array.isArray(validationErrors) || validationErrors.length === 0) return null
  const parts = validationErrors
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      const message = entry?.message?.trim() ?? ''
      const field = entry?.field?.trim() ?? ''
      if (message && field) return `${field}: ${message}`
      return message || field
    })
    .filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

async function parseNestError(res: Response, fallback: string): Promise<GenericInvoiceApiError> {
  let message = fallback
  let code: string | undefined
  let meta: Record<string, unknown> | undefined
  try {
    const body = (await res.json()) as NestErrorBody
    code = body.code
    meta = body.meta
    const fromValidation = formatValidationErrors(body.validationErrors)
    if (fromValidation) message = fromValidation
    else if (Array.isArray(body.message)) message = body.message.filter(Boolean).join(', ') || fallback
    else if (typeof body.message === 'string' && body.message.trim()) message = body.message
  } catch {
    /* non-JSON body */
  }
  return new GenericInvoiceApiError(message, res.status, code, meta)
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  fallbackErrorMessage: string,
): Promise<T> {
  const res = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!res.ok) {
    throw await parseNestError(res, fallbackErrorMessage)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function fetchGenericInvoiceConfig(): Promise<GenericInvoiceConfig> {
  return requestJson(
    `${BASE}/generic-invoices/config`,
    { method: 'GET' },
    'Failed to load generic invoice config',
  )
}

export async function fetchGenericCatalog(params: {
  cat: GenericCatalogCategory
  idDealer: number
  q?: string
}): Promise<GenericCatalogItem[]> {
  const qs = new URLSearchParams({
    cat: String(params.cat),
    idDealer: String(params.idDealer),
  })
  if (params.q?.trim()) qs.set('q', params.q.trim())
  return requestJson(
    `${BASE}/generic-catalog?${qs.toString()}`,
    { method: 'GET' },
    'Failed to load catalog',
  )
}

export async function deleteGenericCatalogItem(id: number): Promise<void> {
  await requestJson<{ ok: true }>(
    `${BASE}/generic-catalog/${id}`,
    { method: 'DELETE' },
    'Failed to delete catalog item',
  )
}

export async function createGenericInvoice(
  payload: CreateGenericInvoicePayload,
): Promise<CreateGenericInvoiceResponse> {
  return requestJson(
    `${BASE}/generic-invoices`,
    { method: 'POST', body: JSON.stringify(payload) },
    'Failed to create generic invoice',
  )
}

export async function fetchGenericInvoice(id: number): Promise<GenericInvoiceDetail> {
  return requestJson(
    `${BASE}/generic-invoices/${id}`,
    { method: 'GET' },
    'Failed to load generic invoice',
  )
}

export async function updateGenericInvoice(
  id: number,
  payload: UpdateGenericInvoicePayload,
): Promise<UpdateGenericInvoiceResponse> {
  return requestJson(
    `${BASE}/generic-invoices/${id}`,
    { method: 'PUT', body: JSON.stringify(payload) },
    'Failed to save generic invoice',
  )
}

export async function fetchGenericTtkEmployees(params: {
  idDealer: number
  dateFrom: string
  dateTo: string
  includeStatementId?: number
}): Promise<GenericTtkEmployeesResponse> {
  const qs = new URLSearchParams({
    idDealer: String(params.idDealer),
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  })
  if (params.includeStatementId != null) {
    qs.set('includeStatementId', String(params.includeStatementId))
  }
  return requestJson(
    `${BASE}/generic-invoices/ttk-employees?${qs.toString()}`,
    { method: 'GET' },
    'Failed to load TTK employees',
  )
}
