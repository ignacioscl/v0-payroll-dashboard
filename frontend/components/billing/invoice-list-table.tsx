'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Loader2,
  Mail,
  Pencil,
  Printer,
  ReceiptText,
  Trash2,
  Wallet,
} from 'lucide-react'

import { GenericInvoiceDialog } from '@/components/billing/generic-invoice-dialog'
import { InvoiceExportDialog } from '@/components/billing/invoice-export-dialog'
import { InvoiceGeneralStatementDialog } from '@/components/billing/invoice-general-statement-dialog'
import { InvoicePoRoDialog } from '@/components/billing/invoice-po-ro-dialog'
import { InvoicePrintDialog } from '@/components/billing/invoice-print-dialog'
import { InvoiceRowActions } from '@/components/billing/invoice-row-actions'
import { InvoiceTtkDetailDialog } from '@/components/billing/invoice-ttk-detail-dialog'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useGenericInvoiceConfig } from '@/hooks/use-generic-invoice'
import { useDeleteInvoiceStatements, useRemoveWoFromInvoice } from '@/hooks/use-invoice-statement-mutations'
import {
  canDeleteInvoice,
  canEditInvoicePoRo,
  canPrintInvoice,
  canRemoveWoFromInvoice,
} from '@/lib/auth/billing-permissions'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { cn } from '@/lib/utils'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import {
  fetchInvoiceDetail,
  fetchInvoiceList,
  type InvoiceRow,
  type InvoiceSummary,
} from '@/lib/srs-invoices-api'
import {
  invoiceRowKey,
  isInvoiceRemainder,
  uniqueStatementIds,
} from '@/lib/billing/invoice-nro-billed'
import type { InvoiceListInput, useInvoiceList } from '@/hooks/use-invoice-list'
import { useToast } from '@/hooks/use-toast'
import { toast as sonnerToast } from 'sonner'

type InvoiceListQuery = ReturnType<typeof useInvoiceList>

/* ----------------------------- formatters -------------------------------- */

function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—'
  // Sign goes before the symbol: -$15.00, not $-15.00 (statements whose discount
  // exceeds the subtotal do show negative totals).
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `-$${abs}` : `$${abs}`
}

function fmtDate(value: string | undefined | null): string {
  if (!value) return '—'
  const iso = value.length > 10 ? value.slice(0, 10) : value
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${m}/${d}/${y}`
}

function fmtPeriod(from?: string, to?: string): string {
  if (!from && !to) return '—'
  if (from && to && from !== to) return `${fmtDate(from)} – ${fmtDate(to)}`
  return fmtDate(from ?? to)
}

type TypeToken = 'wo' | 'ttk' | 'generic'

/** Left rail accent on expanded detail — matches type badge colors. */
const TYPE_RAIL: Record<TypeToken, string> = {
  wo: 'border-l-accent',
  ttk: 'border-l-violet-500',
  generic: 'border-l-amber-500',
}

function typeTokenOf(statementType: number): TypeToken {
  if (statementType === 5) return 'ttk'
  if (statementType === 6) return 'generic'
  return 'wo'
}

function typeMeta(statementType: number, t: TranslateFn): { label: string; className: string } {
  const woClass =
    'border-accent/30 bg-accent/10 text-accent dark:text-accent'
  switch (statementType) {
    case 1:
      return { label: t('invoices.typeIndividual'), className: woClass }
    case 2:
      return { label: t('invoices.typeByServices'), className: woClass }
    case 3:
      return { label: t('invoices.typeMultiService'), className: woClass }
    case 4:
      return { label: t('invoices.typeSelectedServices'), className: woClass }
    case 5:
      return {
        label: t('invoices.typeTtk'),
        className: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
      }
    case 6:
      return {
        label: t('invoices.typeGeneric'),
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      }
    default:
      return { label: t('invoices.typeWo'), className: woClass }
  }
}

function paidMeta(row: InvoiceRow, t: TranslateFn): { label: string; className: string } {
  if (row.isBilled === 1) {
    return {
      label: t('invoices.statusPaid'),
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    }
  }
  return {
    label: t('invoices.statusUnpaid'),
    className: 'border-border bg-muted/60 text-muted-foreground',
  }
}

function rowDisplayNro(row: InvoiceRow): string {
  return row.displayFullNro || row.fullNro || `#${row.id}`
}

function authorDisplay(row: InvoiceRow, t: TranslateFn): string {
  if (row.createdBySchedule) return t('invoices.authorCreatedBySchedule')
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

/** Legacy Services column text (Individual - … / Generic - … / service name). */
function rowServicesText(row: InvoiceRow, t: TranslateFn): string {
  const note = row.invoiceNote?.trim()
  const noteSuffix = note ? ` — ${t('invoices.servicesNotePrefix')} ${note}` : ''
  const selRel = row.invoiceServiceSelRel?.trim() ?? ''
  const type = row.statementType

  if ((type === 4 || type === 6) && selRel) {
    const truncated = selRel.length >= 25 ? `${selRel.slice(0, 25)}…` : selRel
    const body =
      type === 6 ? `${t('invoices.servicesGenericPrefix')} ${truncated}` : truncated
    return `${body}${noteSuffix}`
  }

  if (type === 1) {
    const svc = parseServicesByWoNames(row.invoiceServicesByWo)
    const body = svc
      ? `${t('invoices.servicesIndividualPrefix')} ${svc}`
      : t('invoices.servicesIndividualPrefix')
    return `${body}${noteSuffix}`
  }

  const serviceName = row.invoiceService?.trim()
  if (!serviceName) {
    switch (type) {
      case 2:
        return t('invoices.servicesByServices')
      case 3:
        return t('invoices.servicesMultiService')
      case 5:
        return t('invoices.servicesTimeTracking')
      case 6:
        return t('invoices.typeGeneric')
      default:
        return '—'
    }
  }

  return `${serviceName}${noteSuffix}`
}

/* -------------------------- in-table empty states ------------------------ */

function StateBlock({
  icon,
  title,
  hint,
  tone = 'muted',
}: {
  icon: React.ReactNode
  title: string
  hint?: string
  tone?: 'muted' | 'danger'
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-xl',
          tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{title}</p>
        {hint ? <p className="max-w-md text-sm text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  )
}

/* ------------------------------ detail dialog ---------------------------- */

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={cn(
        'px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  )
}

function detailSectionTitle(statementType: number, t: TranslateFn): string {
  switch (typeTokenOf(statementType)) {
    case 'ttk':
      return t('invoices.detailTtkTitle')
    case 'generic':
      return t('invoices.detailGenericTitle')
    default:
      return t('invoices.detailWoTitle')
  }
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  )
}

function DetailTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-block overflow-hidden rounded-md border border-border/60 bg-card/80">
      <table className="w-auto text-xs">{children}</table>
    </div>
  )
}
function InvoiceDetailBody({
  row,
  listInput,
}: {
  row: InvoiceRow
  listInput: InvoiceListInput | null
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission, user } = useSrsMe()
  const genericConfig = useGenericInvoiceConfig()
  const removeWo = useRemoveWoFromInvoice()
  const [pendingRelId, setPendingRelId] = React.useState<number | null>(null)
  const [ttkDetailOpen, setTtkDetailOpen] = React.useState(false)
  const [genericEditOpen, setGenericEditOpen] = React.useState(false)
  const token = typeTokenOf(row.statementType)
  const isExternal = Boolean(user?.isCompanyTypeCompany)
  const canRemove =
    !isExternal &&
    row.estado !== 0 &&
    canRemoveWoFromInvoice(hasPermission, user?.isSystemAdmin)
  const canEditGeneric =
    Boolean(genericConfig.data?.canCreate) &&
    row.statementType === 6 &&
    row.estado !== 0 &&
    row.isBilled !== 1

  const detail = useQuery({
    queryKey: [
      'srs-invoice-detail',
      row.id,
      row.idBilling ?? 0,
      row.isBilled,
      listInput?.idDepartment,
      listInput?.idInvoiceService,
      listInput?.stock,
    ],
    queryFn: () =>
      fetchInvoiceDetail(row.id, {
        idBilling: row.idBilling ?? 0,
        payed: row.isBilled === 1 ? '1' : undefined,
        idDepartment: listInput?.idDepartment,
        idInvoiceService: listInput?.idInvoiceService,
        stock: listInput?.stock,
      }),
    staleTime: 5 * 60 * 1000,
  })

  const genericEditButton = canEditGeneric ? (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={(e) => {
            e.stopPropagation()
            setGenericEditOpen(true)
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('invoices.generic.edit')}
        </Button>
      </div>
      <GenericInvoiceDialog
        open={genericEditOpen}
        onOpenChange={setGenericEditOpen}
        statementId={row.id}
      />
    </>
  ) : null

  const ttkDetailButton =
    token === 'ttk' ? (
      <>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setTtkDetailOpen(true)}
          >
            <ReceiptText className="h-3.5 w-3.5" />
            {t('invoices.ttkDetailViewButton')}
          </Button>
        </div>
        <InvoiceTtkDetailDialog
          open={ttkDetailOpen}
          onOpenChange={setTtkDetailOpen}
          statementId={row.id}
          invoiceLabel={row.displayFullNro ? `#${row.displayFullNro}` : row.fullNro ? `#${row.fullNro}` : String(row.id)}
          idBilling={row.idBilling}
        />
      </>
    ) : null

  if (detail.isLoading) {
    return (
      <div className="space-y-3">
        {ttkDetailButton}
        {genericEditButton}
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('invoices.detailLoading')}
        </div>
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className="space-y-3">
        {ttkDetailButton}
        {genericEditButton}
        <div className="flex items-center gap-2 py-2 text-xs text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t('invoices.detailError')}
        </div>
      </div>
    )
  }

  const woRows = detail.data?.woRows ?? []
  const genericRows = detail.data?.genericRows ?? []

  if (woRows.length === 0 && genericRows.length === 0) {
    return (
      <div className="space-y-3">
        {ttkDetailButton}
        {genericEditButton}
        <div className="py-2 text-xs text-muted-foreground">{t('invoices.detailEmpty')}</div>
      </div>
    )
  }

  const lineUnpaid = (r: {
    fechaPago?: string
    checkNumber?: string
    amount?: number
  }) => !r.fechaPago && !r.checkNumber && (r.amount == null || r.amount === 0)

  return (
    <div className="space-y-4">
      {ttkDetailButton}
      {genericEditButton}
      {woRows.length > 0 ? (
        <DetailSection title={t('invoices.detailWoTitle')}>
          <DetailTable>
            <thead className="bg-muted/50">
              <tr>
                <Th>{t('invoices.colWo')}</Th>
                <Th>{t('invoices.colVehicle')}</Th>
                <Th>{t('invoices.colDepartment')}</Th>
                <Th>{t('invoices.colService')}</Th>
                <Th align="right">{t('invoices.colQty')}</Th>
                <Th align="right">{t('invoices.colPrice')}</Th>
                {canRemove && row.isBilled !== 1 ? <Th align="right">{t('invoices.colActions')}</Th> : null}
              </tr>
            </thead>
            <tbody>
              {woRows.map((r) => (
                <tr key={r.id} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{r.woNro ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {[r.stockNumber, r.vin].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-3 py-2">{r.department ?? '—'}</td>
                  <td className="px-3 py-2">{r.service ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.qty ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.price)}</td>
                  {canRemove && row.isBilled !== 1 ? (
                    <td className="px-3 py-2 text-right">
                      {row.isBilled !== 1 &&
                      r.isStatementFullBilled !== 1 &&
                      lineUnpaid(r) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          disabled={removeWo.isPending && pendingRelId === r.id}
                          aria-label={t('invoices.actionRemoveWoTitle')}
                          onClick={() => {
                            setPendingRelId(r.id)
                            void removeWo
                              .mutateAsync({
                                id_statement: row.id,
                                id_service_rel: r.id,
                              })
                              .then(() => {
                                toast({ title: t('invoices.actionRemoveWoSuccess') })
                              })
                              .catch((err) => {
                                toast({
                                  variant: 'destructive',
                                  title: t('invoices.actionRemoveWoError'),
                                  description: getSrsErrorMessage(
                                    err,
                                    t('invoices.actionRemoveWoError'),
                                  ),
                                })
                              })
                              .finally(() => setPendingRelId(null))
                          }}
                        >
                          {removeWo.isPending && pendingRelId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </DetailTable>
        </DetailSection>
      ) : null}

      {genericRows.length > 0 ? (
        <DetailSection title={detailSectionTitle(row.statementType, t)}>
          <DetailTable>
            <thead className="bg-muted/50">
              <tr>
                <Th>
                  {token === 'ttk' || genericRows.some((r) => r.idAuthorTtk)
                    ? t('invoices.colEmployee')
                    : t('invoices.colDescription')}
                </Th>
                <Th>{t('invoices.colRole')}</Th>
                <Th align="right">{t('invoices.colQty')}</Th>
                <Th align="right">{t('invoices.colPrice')}</Th>
              </tr>
            </thead>
            <tbody>
              {genericRows.map((r, i) => (
                <tr key={r.id ?? `g-${i}`} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{r.description ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.rolName ?? r.departmentName ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.genericQty ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.price)}</td>
                </tr>
              ))}
            </tbody>
          </DetailTable>
        </DetailSection>
      ) : null}
    </div>
  )
}

/* ------------------------------ totals bar ------------------------------- */

function TotalsBar({
  shown,
  total,
  subtotal,
  discount,
  grandTotal,
  showExcludesDeleted,
  isLoading,
}: {
  shown: number
  total: number | null
  /** Same flag as the top summary strip: deleted=all and there are deleted rows listed. */
  showExcludesDeleted?: boolean
  isLoading?: boolean
  subtotal: number | null
  discount: number | null
  grandTotal: number | null
}) {
  const { t } = useTranslation()
  const money = (n: number | null) => (isLoading || n == null ? '—' : fmtMoney(n))
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border bg-muted/50 px-4 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('invoices.totalsLabel')}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {isLoading || total == null
            ? t('invoices.totalsShowing', { shown, total: '—' })
            : t('invoices.totalsShowing', { shown, total })}
        </span>
        {showExcludesDeleted ? (
          <span className="text-[11px] text-muted-foreground">
            {t('invoices.summaryExcludesDeleted')}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-6 tabular-nums">
        <div className="hidden items-baseline gap-2 sm:flex">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('invoices.totalsSubtotal')}
          </span>
          <span className="text-xs font-medium text-foreground">{money(subtotal)}</span>
        </div>
        <div className="hidden items-baseline gap-2 sm:flex">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('invoices.totalsDiscount')}
          </span>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {isLoading || discount == null
              ? '—'
              : discount > 0
                ? `−${fmtMoney(discount)}`
                : fmtMoney(0)}
          </span>
        </div>
        <div className="flex items-baseline gap-2 border-l border-border/80 pl-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('invoices.totalsTotal')}
          </span>
          <span className="text-base font-bold text-accent dark:text-accent">
            {money(grandTotal)}
          </span>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------- table ---------------------------------- */

const EXPORT_PAGE_SIZE = 200

export function InvoiceListTable({
  query,
  input,
  hydrated,
  hasDealer,
  hasDates,
  pageSize,
  onPageSizeChange,
  sorting,
  onSortingChange,
  showDealerSubline,
  idDealer,
  payedFilter,
  showExcludesDeleted,
  summary,
  summaryTotal,
  summaryLoading,
}: {
  query: InvoiceListQuery
  input: InvoiceListInput | null
  /** Computed once in the page and shared with the top summary strip. */
  showExcludesDeleted?: boolean
  summary?: InvoiceSummary
  summaryTotal?: number
  summaryLoading?: boolean
  hydrated: boolean
  hasDealer: boolean
  hasDates: boolean
  pageSize: number
  onPageSizeChange: (pageSize: number) => void
  sorting: SortingState
  onSortingChange: (next: SortingState) => void
  /** Legacy: debajo del nro de invoice cuando hay multi-dealer en el header. */
  showDealerSubline?: boolean
  idDealer: string
  payedFilter?: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission, user } = useSrsMe()
  const deleteMutation = useDeleteInvoiceStatements()
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({})
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [poRoRow, setPoRoRow] = React.useState<InvoiceRow | null>(null)
  const [poRoField, setPoRoField] = React.useState<'PO' | 'RO'>('PO')

  const isExternal = Boolean(user?.isCompanyTypeCompany)
  const canBulkDelete =
    !isExternal &&
    payedFilter === '0' &&
    canDeleteInvoice(hasPermission, user?.isSystemAdmin)
  const canPrint = canPrintInvoice(hasPermission, user?.isSystemAdmin)
  const canEditPoRo =
    !isExternal && canEditInvoicePoRo(hasPermission, user?.isSystemAdmin)
  const enableSelection = true

  const [printRows, setPrintRows] = React.useState<InvoiceRow[] | null>(null)
  const [gsRows, setGsRows] = React.useState<InvoiceRow[] | null>(null)
  const [exportRows, setExportRows] = React.useState<InvoiceRow[] | null>(null)

  const {
    data,
    isError,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = query

  const rows = React.useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data])

  const selectedSliceRows = React.useMemo(
    () =>
      rows.filter((r) => rowSelection[invoiceRowKey(r)] && r.estado !== 0),
    [rows, rowSelection],
  )

  const selectedStatementIds = React.useMemo(
    () => uniqueStatementIds(selectedSliceRows),
    [selectedSliceRows],
  )

  React.useEffect(() => {
    setRowSelection((prev) => {
      let changed = false
      const next = { ...prev }
      for (const r of rows) {
        const key = invoiceRowKey(r)
        if (r.estado === 0 && next[key]) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [rows])

  const requireSelection = React.useCallback(() => {
    if (selectedSliceRows.length === 0) {
      sonnerToast.error(t('invoices.bulkSelectRequired'))
      return false
    }
    return true
  }, [selectedSliceRows.length, t])

  const gateReady = hydrated && hasDealer && hasDates

  React.useEffect(() => {
    setRowSelection({})
  }, [input])

  const onLoadMore = React.useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  const columns = React.useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      ...(enableSelection
        ? [
            {
              id: 'select',
              size: 40,
              minSize: 40,
              maxSize: 44,
              enableSorting: false,
              enableHiding: false,
              header: ({ table }) => {
                const selectable = table.getRowModel().rows.filter((r) => r.getCanSelect())
                const noneSelectable = selectable.length === 0
                return (
                  <Checkbox
                    checked={
                      table.getIsAllPageRowsSelected()
                        ? true
                        : table.getIsSomePageRowsSelected()
                          ? 'indeterminate'
                          : false
                    }
                    disabled={noneSelectable}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label={t('invoices.bulkSelectAll')}
                    className={noneSelectable ? 'cursor-not-allowed' : 'cursor-pointer'}
                    onClick={(e) => e.stopPropagation()}
                  />
                )
              },
              cell: ({ row }) => {
                const canSelect = row.getCanSelect()
                return (
                  <Checkbox
                    checked={row.getIsSelected()}
                    disabled={!canSelect}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label={t('invoices.bulkSelectRow')}
                    className={canSelect ? 'cursor-pointer' : 'cursor-not-allowed'}
                    onClick={(e) => e.stopPropagation()}
                  />
                )
              },
              meta: {
                label: t('invoices.bulkSelectRow'),
                pin: 'left',
                exportable: false,
                headerClassName: 'w-[40px] px-2',
                cellClassName: 'px-2',
              } satisfies DataTableColumnMeta<InvoiceRow>,
            } satisfies ColumnDef<InvoiceRow>,
          ]
        : []),
      {
        id: 'expander',
        size: 40,
        minSize: 40,
        maxSize: 44,
        enableSorting: false,
        enableHiding: false,
        header: () => <span className="sr-only">{t('invoices.viewDetail')}</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              row.toggleExpanded()
            }}
            aria-expanded={row.getIsExpanded()}
            aria-label={t('invoices.viewDetail')}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {row.getIsExpanded() ? (
              <ChevronDown className="h-4 w-4 transition-transform duration-150" />
            ) : (
              <ChevronRight className="h-4 w-4 transition-transform duration-150" />
            )}
          </button>
        ),
        meta: {
          label: t('invoices.viewDetail'),
          pin: 'left',
          headerClassName: 'w-[40px] px-2',
          cellClassName: 'px-2',
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'invoice',
        accessorFn: (row) => row.fullNro,
        size: 190,
        minSize: 150,
        enableSorting: true,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colInvoice')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const deleted = r.estado === 0
          return (
            <div className="flex flex-col gap-0.5">
              <span
                className={cn(
                  'font-semibold text-foreground',
                  deleted && 'text-muted-foreground line-through',
                )}
              >
                {rowDisplayNro(r)}
              </span>
              {deleted ? (
                <Badge
                  variant="outline"
                  className="w-fit gap-1 border-destructive/40 px-1.5 py-0 text-[10px] font-medium text-destructive"
                >
                  <Trash2 className="size-3" />
                  {t('invoices.rowDeletedBadge')}
                </Badge>
              ) : null}
              {showDealerSubline && r.dealer ? (
                <span className="text-[11px] text-muted-foreground">{r.dealer}</span>
              ) : null}
            </div>
          )
        },
        meta: {
          label: t('invoices.colInvoice'),
          pin: 'left',
          exportValue: (r) => rowDisplayNro(r),
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'type',
        accessorFn: (row) => typeMeta(row.statementType, t).label,
        size: 112,
        minSize: 100,
        maxSize: 130,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colType')} />
        ),
        cell: ({ row }) => {
          const type = typeMeta(row.original.statementType, t)
          return (
            <Badge variant="outline" className={type.className}>
              {type.label}
            </Badge>
          )
        },
        meta: {
          label: t('invoices.colType'),
          exportValue: (r) => typeMeta(r.statementType, t).label,
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'period',
        accessorFn: (row) => fmtPeriod(row.fechaDesde, row.fechaHasta),
        size: 148,
        minSize: 128,
        maxSize: 168,
        enableSorting: true,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colPeriod')} />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {fmtPeriod(row.original.fechaDesde, row.original.fechaHasta)}
          </span>
        ),
        meta: {
          label: t('invoices.colPeriod'),
          exportValue: (r) => fmtPeriod(r.fechaDesde, r.fechaHasta),
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'author',
        accessorFn: (row) => row.author ?? '',
        size: 120,
        minSize: 96,
        maxSize: 160,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colAuthor')} />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              'text-[11px]',
              row.original.createdBySchedule
                ? 'italic text-muted-foreground'
                : 'text-muted-foreground',
            )}
          >
            {authorDisplay(row.original, t)}
          </span>
        ),
        meta: {
          label: t('invoices.colAuthor'),
          exportValue: (r) => authorDisplay(r, t),
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'detail',
        accessorFn: (row) => rowServicesText(row, t),
        size: 200,
        minSize: 140,
        enableResizing: true,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colDetail')} />
        ),
        cell: ({ row }) => {
          const text = rowServicesText(row.original, t)
          const selRel = row.original.invoiceServiceSelRel?.trim() ?? ''
          const truncated =
            (row.original.statementType === 4 || row.original.statementType === 6) &&
            selRel.length >= 25
          return (
            <span
              className="block text-[11px] leading-snug break-words text-foreground"
              title={truncated ? selRel : undefined}
            >
              {text || '—'}
            </span>
          )
        },
        meta: {
          label: t('invoices.colDetail'),
          cellClassName: 'whitespace-normal',
          exportValue: (r) => rowServicesText(r, t),
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'po',
        accessorFn: (row) => row.po ?? '',
        size: 88,
        minSize: 72,
        maxSize: 120,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colPo')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const text = r.po?.trim() || '—'
          if (!canEditPoRo || r.estado === 0) {
            return <span className="text-muted-foreground">{text}</span>
          }
          return (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-left text-foreground hover:text-accent"
              onClick={(e) => {
                e.stopPropagation()
                setPoRoField('PO')
                setPoRoRow(r)
              }}
            >
              <span>{text}</span>
              <Pencil className="h-3 w-3 opacity-50" />
            </button>
          )
        },
        meta: {
          label: t('invoices.colPo'),
          exportValue: (r) => r.po ?? '',
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'ro',
        accessorFn: (row) => row.ro ?? '',
        size: 88,
        minSize: 72,
        maxSize: 120,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colRo')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          const text = r.ro?.trim() || '—'
          if (!canEditPoRo || r.estado === 0) {
            return <span className="text-muted-foreground">{text}</span>
          }
          return (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-left text-foreground hover:text-accent"
              onClick={(e) => {
                e.stopPropagation()
                setPoRoField('RO')
                setPoRoRow(r)
              }}
            >
              <span>{text}</span>
              <Pencil className="h-3 w-3 opacity-50" />
            </button>
          )
        },
        meta: {
          label: t('invoices.colRo'),
          exportValue: (r) => r.ro ?? '',
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'subtotal',
        accessorFn: (row) => row.subtotal,
        size: 84,
        minSize: 72,
        maxSize: 88,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colSubtotal')} />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              'text-muted-foreground',
              row.original.estado === 0 && 'line-through',
            )}
          >
            {fmtMoney(row.original.subtotal)}
          </span>
        ),
        meta: {
          label: t('invoices.colSubtotal'),
          numeric: true,
          exportValue: (r) => r.subtotal,
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'discount',
        accessorFn: (row) => row.discount ?? 0,
        size: 80,
        minSize: 68,
        maxSize: 84,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colDiscount')} />
        ),
        cell: ({ row }) => {
          const d = isInvoiceRemainder(row.original) ? row.original.discount : null
          return (
            <span className="text-amber-600 dark:text-amber-400">
              {d && d > 0 ? `−${fmtMoney(d)}` : '—'}
            </span>
          )
        },
        meta: {
          label: t('invoices.colDiscount'),
          numeric: true,
          exportValue: (r) => (isInvoiceRemainder(r) ? (r.discount ?? 0) : ''),
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'total',
        accessorFn: (row) => row.total,
        size: 84,
        minSize: 72,
        maxSize: 88,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colTotal')} />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              'font-semibold text-foreground',
              row.original.estado === 0 && 'text-muted-foreground line-through',
            )}
          >
            {fmtMoney(row.original.total)}
          </span>
        ),
        meta: {
          label: t('invoices.colTotal'),
          numeric: true,
          exportValue: (r) => r.total,
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'paid',
        accessorFn: (row) => paidMeta(row, t).label,
        size: 118,
        minSize: 104,
        maxSize: 140,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colPaid')} />
        ),
        cell: ({ row }) => {
          const paid = paidMeta(row.original, t)
          return (
            <div className="flex flex-col items-start gap-0.5">
              <Badge variant="outline" className={paid.className}>
                {paid.label}
              </Badge>
              {/* Sólo la fecha de cobro, y sólo si la hay. Sin pago no va nada: el badge de
                  arriba ya dice Unpaid. */}
              {row.original.fechaPago ? (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {fmtDate(row.original.fechaPago)}
                </span>
              ) : null}
            </div>
          )
        },
        meta: {
          label: t('invoices.colPaid'),
          exportValue: (r) => paidMeta(r, t).label,
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'checkNumber',
        accessorFn: (row) => row.checkNumber ?? '',
        size: 110,
        minSize: 88,
        maxSize: 140,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colCheckNumber')} />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.checkNumber?.trim() || '—'}
          </span>
        ),
        meta: {
          label: t('invoices.colCheckNumber'),
          exportValue: (r) => r.checkNumber ?? '',
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'checkAmount',
        accessorFn: (row) => row.amount ?? 0,
        size: 88,
        minSize: 72,
        maxSize: 110,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colCheckAmount')} />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.amount == null ? '—' : fmtMoney(row.original.amount)}
          </span>
        ),
        meta: {
          label: t('invoices.colCheckAmount'),
          numeric: true,
          exportValue: (r) => r.amount ?? '',
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
      {
        id: 'actions',
        size: 132,
        minSize: 72,
        maxSize: 200,
        enableSorting: false,
        enableHiding: false,
        enableResizing: true,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('invoices.colActions')}
            className="w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="flex justify-end">
            <InvoiceRowActions row={row.original} idDealer={idDealer} payedFilter={payedFilter} />
          </div>
        ),
        meta: {
          label: t('invoices.colActions'),
          pin: 'right',
          headerClassName: 'px-1',
          cellClassName: 'overflow-visible px-1',
        } satisfies DataTableColumnMeta<InvoiceRow>,
      },
    ],
    [t, showDealerSubline, idDealer, payedFilter, canEditPoRo, enableSelection, input],
  )

  const fetchAllRowsForExport = React.useCallback(async (): Promise<InvoiceRow[]> => {
    if (!input) return []
    const all: InvoiceRow[] = []
    let page = 1
    for (;;) {
      const res = await fetchInvoiceList({ ...input, page, pageSize: EXPORT_PAGE_SIZE })
      all.push(...res.results)
      if (!res.hasMore) break
      page += 1
    }
    return all
  }, [input])

  const emptyState = !hydrated ? (
    <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
  ) : !hasDealer ? (
    <StateBlock
      icon={<Wallet className="h-6 w-6" />}
      title={t('invoices.selectDealerTitle')}
      hint={t('invoices.selectDealerHint')}
    />
  ) : !hasDates ? (
    <StateBlock icon={<ReceiptText className="h-6 w-6" />} title={t('invoices.selectDatesTitle')} />
  ) : isError ? (
    <StateBlock
      icon={<AlertTriangle className="h-6 w-6" />}
      title={t('invoices.loadErrorTitle')}
      hint={t('invoices.loadErrorHint')}
      tone="danger"
    />
  ) : (
    <StateBlock
      icon={<ReceiptText className="h-6 w-6" />}
      title={t('invoices.noResultsTitle')}
      hint={t('invoices.noResultsHint')}
    />
  )

  const showFooter = gateReady && !isError && rows.length > 0

  const toolbarTrailing = enableSelection ? (
      <TooltipProvider delayDuration={250}>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2"
                onClick={() => {
                  if (!requireSelection()) return
                  setExportRows(selectedSliceRows)
                }}
              >
                <FileSpreadsheet className="size-3.5" />
                <span className="text-muted-foreground">/</span>
                <Mail className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('invoices.bulkExportTitle')}</TooltipContent>
          </Tooltip>

          {canPrint ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    onClick={() => {
                      if (!requireSelection()) return
                      setGsRows(selectedSliceRows)
                    }}
                  >
                    <Printer className="size-3.5" />
                    <span className="text-muted-foreground">/</span>
                    <Mail className="size-3.5" />
                    <span className="ml-0.5 hidden text-xs sm:inline">{t('invoices.bulkGsShort')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('invoices.bulkGsTitle')}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2"
                    onClick={() => {
                      if (!requireSelection()) return
                      setPrintRows(selectedSliceRows)
                    }}
                  >
                    <Printer className="size-3.5" />
                    <span className="text-muted-foreground">/</span>
                    <Mail className="size-3.5" />
                    <span className="ml-0.5 hidden text-xs sm:inline">
                      {t('invoices.bulkPrintShort')}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('invoices.bulkPrintTitle')}</TooltipContent>
              </Tooltip>
            </>
          ) : null}
        </div>
      </TooltipProvider>
    ) : null

  return (
    <>
      {canBulkDelete && selectedStatementIds.length > 0 ? (
        <div className="mb-2 flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setBulkDeleteOpen(true)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {t('invoices.actionDeleteBulk', { count: selectedStatementIds.length })}
          </Button>
        </div>
      ) : null}
      <DataTable<InvoiceRow>
        tableId="billing-invoices-v7"
        columns={columns}
        data={rows}
        getRowId={(row) => invoiceRowKey(row)}
        isLoading={gateReady && isFetching && rows.length === 0}
        emptyState={emptyState}
        enableGlobalFilter={false}
        recordsCount={gateReady && summaryTotal != null ? summaryTotal : undefined}
        recordsCountLabel={t('nav.invoices')}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        showPageSizeInInfiniteScroll
        pageSizeOptions={[25, 50, 100]}
        includeAllPageSize
        enableRowSelection={(row) => row.original.estado !== 0}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        sorting={sorting}
        onSortingChange={onSortingChange}
        manualSorting
        toolbarTrailing={toolbarTrailing}
        infiniteScroll={{
          hasNextPage: gateReady ? (hasNextPage ?? false) : false,
          isFetchingNextPage,
          onLoadMore,
          loadingLabel: (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              {t('invoices.loadingMore')}
            </>
          ),
        }}
        renderSubComponent={(row) => {
          const rail = TYPE_RAIL[typeTokenOf(row.original.statementType)]
          return (
            <div className={cn('border-l-[3px] bg-muted/20 px-4 py-3', rail)}>
              <InvoiceDetailBody row={row.original} listInput={input} />
            </div>
          )
        }}
        footer={
          showFooter ? (
            <TotalsBar
              shown={rows.length}
              total={summaryTotal ?? null}
              subtotal={summary?.subtotal ?? null}
              discount={summary?.discount ?? null}
              grandTotal={summary?.total ?? null}
              showExcludesDeleted={showExcludesDeleted}
              isLoading={Boolean(summaryLoading && !summary)}
            />
          ) : undefined
        }
        enableExport
        exportFormats={['xlsx']}
        exportFileName="invoices"
        fetchAllRowsForExport={fetchAllRowsForExport}
        tableScrollHeight="calc(100dvh - 22rem)"
        flexColumnId="detail"
        enableTableFocus
      />

      {poRoRow ? (
        <InvoicePoRoDialog
          open={Boolean(poRoRow)}
          onOpenChange={(open) => {
            if (!open) setPoRoRow(null)
          }}
          row={poRoRow}
          initialField={poRoField}
        />
      ) : null}

      <ConfirmActionDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        tone="danger"
        title={t('invoices.actionDeleteBulkTitle')}
        description={t('invoices.actionDeleteBulkConfirm', { count: selectedStatementIds.length })}
        confirmLabel={t('invoices.actionDeleteConfirmBtn')}
        cancelLabel={t('common.cancel')}
        pending={deleteMutation.isPending}
        onConfirm={async () => {
          try {
            await deleteMutation.mutateAsync({ ids_statement: selectedStatementIds })
            toast({ title: t('invoices.actionDeleteSuccess') })
            setRowSelection({})
            setBulkDeleteOpen(false)
          } catch (err) {
            toast({
              variant: 'destructive',
              title: t('invoices.actionDeleteError'),
              description: getSrsErrorMessage(err, t('invoices.actionDeleteError')),
            })
          }
        }}
      />

      <InvoicePrintDialog
        open={printRows != null}
        onOpenChange={(open) => {
          if (!open) setPrintRows(null)
        }}
        rows={printRows ?? []}
        payedFilter={payedFilter}
      />

      <InvoiceGeneralStatementDialog
        open={gsRows != null}
        onOpenChange={(open) => {
          if (!open) setGsRows(null)
        }}
        rows={gsRows ?? []}
        idDealer={idDealer}
        fechaDesde={input?.fechaDesde}
        fechaHasta={input?.fechaHasta}
      />

      <InvoiceExportDialog
        open={exportRows != null}
        onOpenChange={(open) => {
          if (!open) setExportRows(null)
        }}
        rows={exportRows ?? []}
        filters={{
          idDealer,
          fechaDesde: input?.fechaDesde,
          fechaHasta: input?.fechaHasta,
          payed: payedFilter,
          idDepartment: input?.idDepartment,
          idService: input?.idInvoiceService,
          includeZero: input?.includeZero,
          filterNotCero: input?.includeZero ? 0 : 1,
          idsEmployees: input?.idAuthorIn
            ? input.idAuthorIn
            : input?.idAuthor
              ? String(input.idAuthor)
              : undefined,
          isNotinIdsEmployees: input?.authorsExclude === 1,
        }}
      />
    </>
  )
}
