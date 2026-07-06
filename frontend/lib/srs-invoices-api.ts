// Tipos = DTOs del backend NestJS (src/srs/billing/dto/invoice-*.dto). Datos REALES.

export type InvoiceStatementTypeToken = 'wo' | 'ttk' | 'generic'

export interface InvoiceRow {
  id: number
  fullNro: string
  /** statement_type: 1-4 WO, 5 TTK, 6 Generic. */
  statementType: number
  estado: number
  wo?: string
  department?: string
  invoiceService?: string
  invoiceServiceSelRel?: string
  invoiceNote?: string
  author?: string
  dealer?: string
  fechaCreate: string
  fechaDesde?: string
  fechaHasta?: string
  subtotal: number
  discount?: number
  discountType?: number
  total: number
  tax: number
  po?: string
  ro?: string
  sended: number
  isBilled: number
  isPartialBilled: number
  idBilling?: number
  fechaPago?: string
  checkNumber?: string
  amount?: number
}

export interface InvoiceSummary {
  count: number
  subtotal: number
  discount: number
  total: number
}

export interface InvoiceListResponse {
  results: InvoiceRow[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
  summary: InvoiceSummary
}

export interface InvoiceDetailWoRow {
  id: number
  idStatement: number
  woNro?: string
  fechaAlta?: string
  vin?: string
  stockNumber?: string
  ro?: string
  po?: string
  department?: string
  service?: string
  observation?: string
  qty?: number
  price?: number
  isStatementFullBilled: number
  checkNumber?: string
  amount?: number
  fechaPago?: string
}

export interface InvoiceDetailGenericRow {
  id?: number
  idStatement: number
  description?: string
  genericQty?: number
  price?: number
  isStatementFullBilled: number
  checkNumber?: string
  amount?: number
  fechaPago?: string
  idAuthorTtk?: number
  rolName?: string
  departmentName?: string
  onlyTimecard: number
}

export interface InvoiceDetailResponse {
  idStatement: number
  statementType: number
  woRows: InvoiceDetailWoRow[]
  genericRows: InvoiceDetailGenericRow[]
}

export const INVOICE_PAGE_SIZE = 25

export interface InvoiceListParams {
  fechaDesde: string
  fechaHasta: string
  idDealer: string
  /** csv de 'wo' | 'ttk' | 'generic'. */
  types: string
  search?: string
  payed?: '0' | '1'
  sended?: '0' | '1'
  page: number
  pageSize?: number
}

function buildInvoiceQuery(params: InvoiceListParams): string {
  const qs = new URLSearchParams({
    fechaDesde: params.fechaDesde,
    fechaHasta: params.fechaHasta,
    idDealer: params.idDealer,
    types: params.types,
    page: String(params.page),
    pageSize: String(params.pageSize ?? INVOICE_PAGE_SIZE),
  })
  if (params.search) qs.set('search', params.search)
  if (params.payed) qs.set('payed', params.payed)
  if (params.sended) qs.set('sended', params.sended)
  return `?${qs.toString()}`
}

export async function fetchInvoiceList(params: InvoiceListParams): Promise<InvoiceListResponse> {
  const res = await fetch(`/api/srs-kpis/billing/invoices${buildInvoiceQuery(params)}`, {
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Invoices (${res.status})`)
  }
  return res.json() as Promise<InvoiceListResponse>
}

export async function fetchInvoiceDetail(id: number): Promise<InvoiceDetailResponse> {
  const res = await fetch(`/api/srs-kpis/billing/invoices/${id}/detail`, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Invoice detail (${res.status})`)
  }
  return res.json() as Promise<InvoiceDetailResponse>
}
