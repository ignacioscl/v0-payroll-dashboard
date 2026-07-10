'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  ReceiptText,
  Wallet,
} from 'lucide-react'

import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import {
  fetchInvoiceDetail,
  fetchInvoiceList,
  type InvoiceRow,
} from '@/lib/srs-invoices-api'
import type { InvoiceListInput, useInvoiceList } from '@/hooks/use-invoice-list'

type InvoiceListQuery = ReturnType<typeof useInvoiceList>

/* ----------------------------- formatters -------------------------------- */

function fmtMoney(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
  wo: 'border-l-sky-500',
  ttk: 'border-l-violet-500',
  generic: 'border-l-amber-500',
}

function typeTokenOf(statementType: number): TypeToken {
  if (statementType === 5) return 'ttk'
  if (statementType === 6) return 'generic'
  return 'wo'
}

function typeMeta(statementType: number, t: TranslateFn): { label: string; className: string } {
  switch (typeTokenOf(statementType)) {
    case 'ttk':
      return {
        label: t('invoices.typeTtk'),
        className: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
      }
    case 'generic':
      return {
        label: t('invoices.typeGeneric'),
        className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      }
    default:
      return {
        label: t('invoices.typeWo'),
        className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      }
  }
}

function paidMeta(row: InvoiceRow, t: TranslateFn): { label: string; className: string } {
  if (row.isBilled === 1) {
    return {
      label: t('invoices.statusPaid'),
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    }
  }
  if (row.isPartialBilled === 1) {
    return {
      label: t('invoices.statusPartial'),
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    }
  }
  return {
    label: t('invoices.statusUnpaid'),
    className: 'border-border bg-muted/60 text-muted-foreground',
  }
}

function authorDisplay(row: InvoiceRow, t: TranslateFn): string {
  if (row.createdBySchedule) return t('invoices.authorCreatedBySchedule')
  const name = row.author?.trim()
  return name || '—'
}

function rowDetailText(row: InvoiceRow): string {
  const parts = [row.wo, row.department, row.invoiceService, row.invoiceServiceSelRel].filter(
    (p): p is string => Boolean(p && p.trim()),
  )
  return parts.length ? parts.join(' · ') : '—'
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
function InvoiceDetailBody({ row }: { row: InvoiceRow }) {
  const { t } = useTranslation()
  const token = typeTokenOf(row.statementType)
  const detail = useQuery({
    queryKey: ['srs-invoice-detail', row.id],
    queryFn: () => fetchInvoiceDetail(row.id),
    staleTime: 5 * 60 * 1000,
  })

  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('invoices.detailLoading')}
      </div>
    )
  }
  if (detail.isError) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-destructive">
        <AlertTriangle className="h-4 w-4" />
        {t('invoices.detailError')}
      </div>
    )
  }

  const woRows = detail.data?.woRows ?? []
  const genericRows = detail.data?.genericRows ?? []

  if (woRows.length === 0 && genericRows.length === 0) {
    return <div className="py-2 text-xs text-muted-foreground">{t('invoices.detailEmpty')}</div>
  }

  return (
    <div className="space-y-4">
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
}: {
  shown: number
  total: number
  subtotal: number
  discount: number
  grandTotal: number
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border bg-muted/50 px-4 py-2.5">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('invoices.totalsLabel')}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('invoices.totalsShowing', { shown, total })}
        </span>
      </div>
      <div className="flex items-center gap-6 tabular-nums">
        <div className="hidden items-baseline gap-2 sm:flex">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('invoices.totalsSubtotal')}
          </span>
          <span className="text-xs font-medium text-foreground">{fmtMoney(subtotal)}</span>
        </div>
        <div className="hidden items-baseline gap-2 sm:flex">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('invoices.totalsDiscount')}
          </span>
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {discount > 0 ? `−${fmtMoney(discount)}` : fmtMoney(0)}
          </span>
        </div>
        <div className="flex items-baseline gap-2 border-l border-border/80 pl-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('invoices.totalsTotal')}
          </span>
          <span className="text-base font-bold text-sky-700 dark:text-sky-300">
            {fmtMoney(grandTotal)}
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
  showDealerSubline,
}: {
  query: InvoiceListQuery
  input: InvoiceListInput | null
  hydrated: boolean
  hasDealer: boolean
  hasDates: boolean
  pageSize: number
  onPageSizeChange: (pageSize: number) => void
  /** Legacy: debajo del nro de invoice cuando hay multi-dealer en el header. */
  showDealerSubline?: boolean
}) {
  const { t } = useTranslation()

  const {
    data,
    isError,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = query

  const rows = React.useMemo(() => data?.pages.flatMap((p) => p.results) ?? [], [data])
  const summary = data?.pages[0]?.summary
  const total = data?.pages[0]?.total ?? 0

  const gateReady = hydrated && hasDealer && hasDates

  const onLoadMore = React.useCallback(() => {
    void fetchNextPage()
  }, [fetchNextPage])

  const columns = React.useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
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
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50"
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
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colInvoice')} />
        ),
        cell: ({ row }) => {
          const r = row.original
          return (
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">{r.fullNro || `#${r.id}`}</span>
              {showDealerSubline && r.dealer ? (
                <span className="text-[11px] text-muted-foreground">{r.dealer}</span>
              ) : null}
            </div>
          )
        },
        meta: {
          label: t('invoices.colInvoice'),
          pin: 'left',
          exportValue: (r) => r.fullNro || `#${r.id}`,
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
        enableSorting: false,
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
        accessorFn: (row) => rowDetailText(row),
        size: 160,
        minSize: 100,
        enableResizing: false,
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('invoices.colDetail')} />
        ),
        cell: ({ row }) => {
          const text = rowDetailText(row.original)
          return (
            <span className="block text-[11px] leading-snug break-words text-foreground">
              {text}
            </span>
          )
        },
        meta: {
          label: t('invoices.colDetail'),
          cellClassName: 'whitespace-normal',
          exportValue: (r) => rowDetailText(r),
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
          <span className="text-muted-foreground">{fmtMoney(row.original.subtotal)}</span>
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
          const d = row.original.discount
          return (
            <span className="text-amber-600 dark:text-amber-400">
              {d && d > 0 ? `−${fmtMoney(d)}` : '—'}
            </span>
          )
        },
        meta: {
          label: t('invoices.colDiscount'),
          numeric: true,
          exportValue: (r) => r.discount ?? 0,
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
          <span className="font-semibold text-foreground">{fmtMoney(row.original.total)}</span>
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
    ],
    [t, showDealerSubline],
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

  const showFooter = gateReady && !isError && rows.length > 0 && Boolean(summary)

  return (
    <DataTable<InvoiceRow>
        tableId="billing-invoices"
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        isLoading={gateReady && isFetching && rows.length === 0}
        emptyState={emptyState}
        enableGlobalFilter={false}
        recordsCount={gateReady ? total : 0}
        recordsCountLabel={t('nav.invoices')}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        showPageSizeInInfiniteScroll
        pageSizeOptions={[25, 50, 100]}
        includeAllPageSize
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
              <InvoiceDetailBody row={row.original} />
            </div>
          )
        }}
        footer={
          showFooter && summary ? (
            <TotalsBar
              shown={rows.length}
              total={total}
              subtotal={summary.subtotal}
              discount={summary.discount}
              grandTotal={summary.total}
            />
          ) : undefined
        }
        enableExport
        exportFileName="invoices"
        fetchAllRowsForExport={fetchAllRowsForExport}
        tableScrollHeight="calc(100dvh - 22rem)"
        flexColumnId="detail"
        enableTableFocus
      />
  )
}
