import type { PunchExportLocale } from '../punch/punch-export-format'
import type { InvoiceRowDto } from './dto/invoice-list.dto'

/**
 * «Export» of the Invoices grid's toolbar (plans/plan-report-info-exports-tablas §6): the same
 * columns and values the browser wrote with the grid's `exportValue` (frontend
 * components/billing/invoice-list-table.tsx), now built by Nest with Report Info (D5).
 *
 * The formatters below are copied AS IS from that file (fmtDate, fmtPeriod, typeMeta, paidMeta,
 * rowDisplayNro, authorDisplay, parseServicesByWoNames, rowServicesText) and from
 * frontend/lib/billing/invoice-discount.ts (discountExportValue). Texts copied from the frontend
 * i18n (`invoices.*`). If one changes there, it changes here.
 */
export type InvoiceListExportLabels = {
  reportName: string
  dataSheet: string
  includePartial: string
  filterDateDone: string
  colInvoice: string
  colType: string
  colPeriod: string
  colAuthor: string
  colDetail: string
  colPo: string
  colRo: string
  colSubtotal: string
  colDiscount: string
  colTotal: string
  colPartialInvoiced: string
  colPaid: string
  colCheckNumber: string
  colCheckAmount: string
  typeWo: string
  typeIndividual: string
  typeByServices: string
  typeMultiService: string
  typeSelectedServices: string
  typeTtk: string
  typeGeneric: string
  servicesIndividualPrefix: string
  servicesGenericPrefix: string
  servicesByServices: string
  servicesMultiService: string
  servicesTimeTracking: string
  servicesNotePrefix: string
  authorCreatedBySchedule: string
  statusPaid: string
  statusUnpaid: string
}

const EN: InvoiceListExportLabels = {
  // Approved by Ignacio on 10/27/2026 (plan §4.2): not translated, like the other two report names.
  reportName: 'Invoice List',
  dataSheet: 'Invoices',
  includePartial: 'Include partial invoices',
  filterDateDone: 'Filter Date Completed',
  colInvoice: 'Invoice',
  colType: 'Type',
  colPeriod: 'Period',
  colAuthor: 'Author',
  colDetail: 'Services',
  colPo: 'PO',
  colRo: 'RO',
  colSubtotal: 'Subtotal',
  colDiscount: 'Discount',
  colTotal: 'Total',
  colPartialInvoiced: 'Partial Invoiced',
  colPaid: 'Paid',
  colCheckNumber: 'Check #',
  colCheckAmount: 'Amount',
  typeWo: 'Work Orders',
  typeIndividual: 'Individual',
  typeByServices: 'By Services',
  typeMultiService: 'Multi-Service',
  typeSelectedServices: 'Selected services',
  typeTtk: 'Time Tracking',
  typeGeneric: 'Generic',
  servicesIndividualPrefix: 'Individual -',
  servicesGenericPrefix: 'Generic -',
  servicesByServices: 'By Services',
  servicesMultiService: 'Multi-Service',
  servicesTimeTracking: 'Time Tracking',
  servicesNotePrefix: 'Note:',
  authorCreatedBySchedule: 'Created by schedule',
  statusPaid: 'Paid',
  statusUnpaid: 'Unpaid',
}

const ES: InvoiceListExportLabels = {
  reportName: 'Invoice List',
  dataSheet: 'Invoices',
  includePartial: 'Incluir invoices parciales',
  filterDateDone: 'Filtrar por fecha de terminado',
  colInvoice: 'Factura',
  colType: 'Tipo',
  colPeriod: 'Período',
  colAuthor: 'Autor',
  colDetail: 'Servicios',
  colPo: 'PO',
  colRo: 'RO',
  colSubtotal: 'Subtotal',
  colDiscount: 'Descuento',
  colTotal: 'Total',
  colPartialInvoiced: 'Parcial facturado',
  colPaid: 'Pago',
  colCheckNumber: 'Cheque #',
  colCheckAmount: 'Amount',
  typeWo: 'Órdenes de trabajo',
  typeIndividual: 'Individual',
  typeByServices: 'By Services',
  typeMultiService: 'Multi-Service',
  typeSelectedServices: 'Servicios seleccionados',
  typeTtk: 'Seguimiento de tiempo',
  typeGeneric: 'Genéricas',
  servicesIndividualPrefix: 'Individual -',
  servicesGenericPrefix: 'Generic -',
  servicesByServices: 'By Services',
  servicesMultiService: 'Multi-Service',
  servicesTimeTracking: 'Time Tracking',
  servicesNotePrefix: 'Nota:',
  authorCreatedBySchedule: 'Creada por schedule',
  statusPaid: 'Pagada',
  statusUnpaid: 'Impaga',
}

export function invoiceListExportLabels(locale: PunchExportLocale): InvoiceListExportLabels {
  return locale === 'es' ? ES : EN
}

function fmtDate(value: string | undefined | null): string {
  if (!value) return '—'
  const iso = value.length > 10 ? value.slice(0, 10) : value
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

export function invoiceListPeriod(from?: string, to?: string): string {
  if (!from && !to) return '—'
  if (from && to && from !== to) return `${fmtDate(from)} – ${fmtDate(to)}`
  return fmtDate(from ?? to)
}

export function invoiceListTypeLabel(statementType: number, l: InvoiceListExportLabels): string {
  switch (statementType) {
    case 1:
      return l.typeIndividual
    case 2:
      return l.typeByServices
    case 3:
      return l.typeMultiService
    case 4:
      return l.typeSelectedServices
    case 5:
      return l.typeTtk
    case 6:
      return l.typeGeneric
    default:
      return l.typeWo
  }
}

export function invoiceListPaidLabel(row: InvoiceRowDto, l: InvoiceListExportLabels): string {
  return row.isBilled === 1 ? l.statusPaid : l.statusUnpaid
}

export function invoiceListDisplayNro(row: InvoiceRowDto): string {
  return row.displayFullNro || row.fullNro || `#${row.id}`
}

export function invoiceListAuthor(row: InvoiceRowDto, l: InvoiceListExportLabels): string {
  if (row.createdBySchedule) return l.authorCreatedBySchedule
  const name = row.author?.trim()
  return name || '—'
}

function parseServicesByWoNames(raw?: string): string {
  if (!raw?.trim()) return ''
  const names: string[] = []
  for (const part of raw.split(',')) {
    const name = part.trim().split('|')[0]?.trim()
    if (name) names.push(name)
  }
  return names.join(', ')
}

/** Legacy Services column text (Individual - … / Generic - … / service name), as the grid. */
export function invoiceListServicesText(row: InvoiceRowDto, l: InvoiceListExportLabels): string {
  const note = row.invoiceNote?.trim()
  const noteSuffix = note ? ` — ${l.servicesNotePrefix} ${note}` : ''
  const selRel = row.invoiceServiceSelRel?.trim() ?? ''
  const type = row.statementType

  if ((type === 4 || type === 6) && selRel) {
    const truncated = selRel.length >= 25 ? `${selRel.slice(0, 25)}…` : selRel
    const body = type === 6 ? `${l.servicesGenericPrefix} ${truncated}` : truncated
    return `${body}${noteSuffix}`
  }

  if (type === 1) {
    const svc = parseServicesByWoNames(row.invoiceServicesByWo)
    const body = svc ? `${l.servicesIndividualPrefix} ${svc}` : l.servicesIndividualPrefix
    return `${body}${noteSuffix}`
  }

  const serviceName = row.invoiceService?.trim()
  if (!serviceName) {
    switch (type) {
      case 2:
        return l.servicesByServices
      case 3:
        return l.servicesMultiService
      case 5:
        return l.servicesTimeTracking
      case 6:
        return l.typeGeneric
      default:
        return '—'
    }
  }

  return `${serviceName}${noteSuffix}`
}

/** With the sign it has on screen: −$40.00 in the grid is −40 in the file; no discount is 0. */
export function invoiceListDiscount(discountAmount: number): number {
  return discountAmount === 0 ? 0 : -discountAmount
}

export type InvoiceListExportColumn = {
  header: string
  width: number
  money: boolean
  value: (row: InvoiceRowDto) => string | number | null
}

/**
 * The grid's columns in its order (Partial Invoiced only with «Include partial invoices»), as the
 * DataTable exporter wrote them: every data column, visible or not.
 */
export function invoiceListExportColumns(
  l: InvoiceListExportLabels,
  includePartial: boolean,
): InvoiceListExportColumn[] {
  return [
    { header: l.colInvoice, width: 20, money: false, value: (r) => invoiceListDisplayNro(r) },
    { header: l.colType, width: 18, money: false, value: (r) => invoiceListTypeLabel(r.statementType, l) },
    { header: l.colPeriod, width: 24, money: false, value: (r) => invoiceListPeriod(r.fechaDesde, r.fechaHasta) },
    { header: l.colAuthor, width: 22, money: false, value: (r) => invoiceListAuthor(r, l) },
    { header: l.colDetail, width: 40, money: false, value: (r) => invoiceListServicesText(r, l) },
    { header: l.colPo, width: 14, money: false, value: (r) => r.po ?? '' },
    { header: l.colRo, width: 14, money: false, value: (r) => r.ro ?? '' },
    { header: l.colSubtotal, width: 13, money: true, value: (r) => r.subtotal },
    { header: l.colDiscount, width: 12, money: true, value: (r) => invoiceListDiscount(r.discountAmount) },
    { header: l.colTotal, width: 13, money: true, value: (r) => r.total },
    ...(includePartial
      ? [
          {
            header: l.colPartialInvoiced,
            width: 16,
            money: true,
            value: (r: InvoiceRowDto) => r.partialInvoiced ?? 0,
          },
        ]
      : []),
    { header: l.colPaid, width: 10, money: false, value: (r) => invoiceListPaidLabel(r, l) },
    { header: l.colCheckNumber, width: 14, money: false, value: (r) => r.checkNumber ?? '' },
    { header: l.colCheckAmount, width: 13, money: true, value: (r) => r.amount ?? null },
  ]
}
