import { requestNestJson } from '@/lib/srs-nest-client'

/**
 * Cliente del Nest para Billing › WO to be Billed (plans/plan-wo-to-be-billed-v0, T9 y T10), por el proxy
 * `/api/srs-kpis/billing/...`. Los errores son `SrsNestApiError` (con `status`, `code` y `validationErrors`).
 */

const BASE = '/api/srs-kpis/billing'

/** Tope de WO por pedido de «Delete selected»: el mismo que `WORK_ORDER_DELETE_MAX` del Nest (pareja). */
export const WO_DELETE_MAX = 200

/** Invoice Type: 2 by Services, 3 Multi-Services, 4 Selected Services. */
export type WoInvoiceType = 2 | 3 | 4
export const WO_INVOICE_TYPE_BY_SERVICES: WoInvoiceType = 2
export const WO_INVOICE_TYPE_MULTI_SERVICES: WoInvoiceType = 3
export const WO_INVOICE_TYPE_SELECTED_SERVICES: WoInvoiceType = 4

/** Status de la solapa (workflow): In Transit, Arrived, In Process, Completed, Pause. */
export const WO_STATUS_IDS = [15, 5, 6, 7, 16] as const
export const WO_STATUS_COMPLETED = 7
export const WO_STATUS_IN_TRANSIT = 15

export type WoApprovedFilter = '' | '0' | '1'

/** Lo que la pantalla filtra. `null` / vacío = sin ese filtro. */
export interface WoToBeBilledFilterInput {
  idDealer: number
  dateFrom: string
  dateTo: string
  status: number[]
  departments: number[]
  services: number[]
  invoiceType: WoInvoiceType | null
  includeZero: boolean
  approved: WoApprovedFilter
  wo: string
  stock: string
  price: string
  ro: string
  po: string
}

/**
 * El pedido del filtro con **los nombres exactos del DTO del Nest** (`WoToBeBilledFilterDto`): el `ValidationPipe`
 * descarta en silencio un campo con otro nombre, y se facturaría más de lo que se ve. Lo controla el contrato del
 * filtro (`srs-wo-to-be-billed-api.test.ts` y `wo-to-be-billed-filter-contract.spec.ts` del backend, con los mismos
 * casos). Los campos vacíos no se mandan.
 */
export function buildWoFilterRequest(input: WoToBeBilledFilterInput): Record<string, string | number | boolean | number[]> {
  const out: Record<string, string | number | boolean | number[]> = {
    idDealer: input.idDealer,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    includeZero: input.includeZero,
  }
  if (input.status.length) out.status = [...input.status]
  if (input.departments.length) out.departments = [...input.departments]
  if (input.services.length) out.services = [...input.services]
  if (input.invoiceType != null) out.invoiceType = input.invoiceType
  if (input.approved !== '') out.approved = input.approved
  const text = { wo: input.wo, stock: input.stock, ro: input.ro, po: input.po }
  for (const [key, value] of Object.entries(text)) {
    const v = value.trim()
    if (v) out[key] = v
  }
  const price = input.price.trim()
  if (price && Number.isFinite(Number(price))) out.price = Number(price)
  return out
}

/** El mismo pedido como query string (`GET`): las listas van separadas por coma. */
export function woFilterQueryString(request: Record<string, string | number | boolean | number[]>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(request)) {
    if (Array.isArray(value)) qs.set(key, value.join(','))
    else if (typeof value === 'boolean') qs.set(key, value ? '1' : '0')
    else qs.set(key, String(value))
  }
  return qs.toString()
}

export interface WoServiceDetail {
  nombre?: string
  idServiceInvoice?: number
  idStatement?: number | null
  statementFullNro?: string | null
  price?: number
}

export interface WoToBeBilledRow {
  id: number
  fullNro: string
  fechaAlta: string
  stockNumber: string | null
  ro: string | null
  po: string | null
  observation: string | null
  idDepartment: number
  department: string
  idWorkflow: number
  workflow: string
  workflowIcon: string | null
  workflowColor: string | null
  vin: string
  year: string | null
  make: string | null
  model: string | null
  color: string | null
  total: number
  approved: number | null
  approvedDate: string | null
  approverName: string | null
  unapproveNote: string | null
  inspected: number | null
  inspectedDate: string | null
  inspectorName: string | null
  internalInspected: number | null
  internalInspectedDate: string | null
  internalInspectorName: string | null
  woHaveInvoice: boolean
  isBilled: boolean
  invoiceNumbers: string
  services: WoServiceDetail[]
  timeWorked: string | null
  hasFinalInspect: boolean
  hasInternalInspect: boolean
}

export interface WoToBeBilledListResponse {
  results: WoToBeBilledRow[]
  page: number
  pageSize: number
  hasMore: boolean
}

export interface WoToBeBilledSummary {
  count: number
  total: number
}

export interface WoToBeBilledConfig {
  canGenerate: boolean
  canDeleteSelected: boolean
  canDeleteRow: boolean
  canDeleteRowInTransitOnly: boolean
}

export interface WoToBeBilledPreview {
  workOrders: number
  invoices: number
}

export interface CreatedWoInvoice {
  id: number
  fullNro: string
  dateFrom: string
  dateTo: string
}

export interface GenerateWoInvoicesResponse {
  invoices: CreatedWoInvoice[]
  workOrders: number
}

export interface DeleteWorkOrdersResponse {
  deleted: Array<{ id: number; fullNro: string }>
  failed: Array<{ id: number; fullNro?: string; reason: string }>
}

export interface WorkOrderRoPo {
  ro: string | null
  po: string | null
}

export function fetchWoToBeBilledList(
  request: Record<string, string | number | boolean | number[]>,
  page: number,
  pageSize: number,
): Promise<WoToBeBilledListResponse> {
  const qs = woFilterQueryString({ ...request, page, pageSize })
  return requestNestJson(`${BASE}/wo-to-be-billed?${qs}`, { method: 'GET' }, 'Failed to load work orders')
}

export function fetchWoToBeBilledSummary(
  request: Record<string, string | number | boolean | number[]>,
): Promise<WoToBeBilledSummary> {
  return requestNestJson(
    `${BASE}/wo-to-be-billed/summary?${woFilterQueryString(request)}`,
    { method: 'GET' },
    'Failed to load the total',
  )
}

export function fetchWoToBeBilledConfig(idDealer: number): Promise<WoToBeBilledConfig> {
  return requestNestJson(
    `${BASE}/wo-to-be-billed/config?idDealer=${encodeURIComponent(String(idDealer))}`,
    { method: 'GET' },
    'Failed to load the permissions',
  )
}

export function previewWoInvoices(
  request: Record<string, string | number | boolean | number[]>,
  woIds: number[],
): Promise<WoToBeBilledPreview> {
  return requestNestJson(
    `${BASE}/wo-to-be-billed/preview`,
    { method: 'POST', body: JSON.stringify({ ...request, ...(woIds.length ? { woIds } : {}) }) },
    'Failed to count the work orders',
  )
}

export function generateWoInvoices(
  request: Record<string, string | number | boolean | number[]>,
  woIds: number[],
): Promise<GenerateWoInvoicesResponse> {
  return requestNestJson(
    `${BASE}/wo-to-be-billed/generate`,
    { method: 'POST', body: JSON.stringify({ ...request, ...(woIds.length ? { woIds } : {}) }) },
    'Failed to generate the invoices',
  )
}

export function generateIndividualInvoice(idInvoice: number, includeZero: boolean): Promise<CreatedWoInvoice> {
  return requestNestJson(
    `${BASE}/wo-to-be-billed/${idInvoice}/individual`,
    { method: 'POST', body: JSON.stringify({ includeZero }) },
    'Failed to generate the invoice',
  )
}

export function deleteWorkOrders(ids: number[], bulk: boolean): Promise<DeleteWorkOrdersResponse> {
  return requestNestJson(
    `${BASE}/work-orders/delete`,
    { method: 'POST', body: JSON.stringify({ ids, bulk }) },
    'Failed to delete the work orders',
  )
}

export function updateWorkOrderRoPo(idInvoice: number, field: 'ro' | 'po', value: string): Promise<WorkOrderRoPo> {
  return requestNestJson(
    `${BASE}/work-orders/${idInvoice}/ro-po`,
    { method: 'PUT', body: JSON.stringify({ field, value }) },
    'Failed to save',
  )
}
