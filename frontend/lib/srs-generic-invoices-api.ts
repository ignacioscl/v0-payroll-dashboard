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

export interface GenericInvoiceItemPayload {
  description: string
  qty?: number
  unitAmount: number
}

export interface CreateGenericInvoicePayload {
  idDealer: number
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

const BASE = '/api/srs-kpis/billing'

type NestErrorBody = {
  message?: string | string[]
  validationErrors?: Array<{ field?: string; message?: string } | string> | string
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

async function parseNestErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as NestErrorBody
    const fromValidation = formatValidationErrors(body.validationErrors)
    if (fromValidation) return fromValidation
    if (Array.isArray(body.message)) return body.message.filter(Boolean).join(', ') || fallback
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  } catch {
    /* non-JSON body */
  }
  return fallback
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
    throw new Error(await parseNestErrorMessage(res, fallbackErrorMessage))
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
