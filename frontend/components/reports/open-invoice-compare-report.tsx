'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { ArrowLeft, History } from 'lucide-react'
import { RemovedDealerBadge } from '@/components/filters/removed-dealer-badge'
import { PageHeading } from '@/components/layout/page-heading'
import { SnapshotDealers } from '@/components/reports/open-invoice-snapshots-dialog'
import { AppLink } from '@/components/shared/app-link'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { ReportRulesNotice } from '@/components/shared/report-rules-notice'
import { ServerXlsxExportButton } from '@/components/shared/server-xlsx-export-button'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import { fmtMoney } from '@/lib/kpi-money'
import { formatNyDateTime } from '@/lib/reports/open-invoices-dates'
import {
  fetchOpenInvoiceSnapshotCompare,
  openInvoiceSnapshotCompareExportUrl,
  type OpenInvoiceBucket,
  type OpenInvoiceCompareRow,
  type OpenInvoiceCompareSide,
} from '@/lib/srs-kpis-api'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import { cn } from '@/lib/utils'

const DEALER_PINNING = { left: ['dealer'] }

function bucketLabel(bucket: OpenInvoiceBucket | null, t: TranslateFn): string {
  switch (bucket) {
    case 'current':
      return t('openInvoices.current')
    case 'd15':
      return t('openInvoices.col15')
    case 'd30':
      return t('openInvoices.col30')
    case 'd60':
      return t('openInvoices.col60')
    case 'd90':
      return t('openInvoices.col90')
    default:
      return ''
  }
}

/** «1,200.00 · 15+»; «—» cuando la invoice no está de ese lado (§1.5). */
function sideCell(side: OpenInvoiceCompareSide | null, t: TranslateFn): React.ReactNode {
  if (!side) return <span className="text-muted-foreground">—</span>
  const b = bucketLabel(side.bucket, t)
  return (
    <span className="tabular-nums">
      {fmtMoney(side.amount)}
      {b ? <span className="text-muted-foreground"> · {b}</span> : null}
    </span>
  )
}

function differenceCell(value: number): React.ReactNode {
  return (
    <span className={cn('font-semibold tabular-nums', value < 0 && 'text-destructive', value > 0 && 'text-success')}>
      {value > 0 ? '+' : ''}
      {fmtMoney(value)}
    </span>
  )
}

/**
 * Comparación de una foto de Open Invoices contra hoy (plans/plan-reporte-javier §1.5, §4.3): arriba los datos de la
 * foto y el cartel de la comparación; una fila por invoice que cambió con su motivo; al pie los tres totales y el
 * Excel. Difference = hoy − foto. Celular: ninguna columna fija y «Why» entero (lo hace el `DataTable`).
 */
export function OpenInvoiceCompareReport({ id }: { id: number }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'dealer', desc: false }])
  const valid = Number.isInteger(id) && id > 0

  const compare = useQuery({
    queryKey: ['srs-report', 'open-invoice-compare', id],
    queryFn: () => fetchOpenInvoiceSnapshotCompare(id),
    enabled: valid,
  })
  const data = compare.data
  const rows = data?.rows ?? []

  const columns = React.useMemo<ColumnDef<OpenInvoiceCompareRow>[]>(
    () => [
      {
        accessorKey: 'dealer',
        size: 260,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dealer.label')} />,
        cell: ({ row }) =>
          row.original.removed ? (
            <span className={cn('flex min-w-0 gap-2', isMobile ? 'flex-wrap items-start' : 'items-center')}>
              <span className="truncate font-medium">{row.original.dealer}</span>
              <RemovedDealerBadge />
            </span>
          ) : (
            <span className="block truncate font-medium">{row.original.dealer}</span>
          ),
        meta: { label: t('dealer.label'), pin: 'left' } satisfies DataTableColumnMeta<OpenInvoiceCompareRow>,
      },
      {
        accessorKey: 'invoice',
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('invoices.filterInvoiceLabel')} />,
        cell: ({ row }) => <span className="tabular-nums">{row.original.invoice}</span>,
        meta: { label: t('invoices.filterInvoiceLabel') } satisfies DataTableColumnMeta<OpenInvoiceCompareRow>,
      },
      {
        accessorKey: 'department',
        size: 200,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.department')} />,
        cell: ({ row }) => <span className="whitespace-normal break-words">{row.original.department}</span>,
        meta: { label: t('openInvoices.department') } satisfies DataTableColumnMeta<OpenInvoiceCompareRow>,
      },
      {
        id: 'snapshot',
        accessorFn: (r) => r.snapshot?.amount ?? 0,
        size: 170,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.inSnapshot')} />,
        cell: ({ row }) => sideCell(row.original.snapshot, t),
        meta: { label: t('openInvoices.inSnapshot'), numeric: true } satisfies DataTableColumnMeta<OpenInvoiceCompareRow>,
      },
      {
        id: 'today',
        accessorFn: (r) => r.today?.amount ?? 0,
        size: 170,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.today')} />,
        cell: ({ row }) => sideCell(row.original.today, t),
        meta: { label: t('openInvoices.today'), numeric: true } satisfies DataTableColumnMeta<OpenInvoiceCompareRow>,
      },
      {
        accessorKey: 'difference',
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.difference')} />,
        cell: ({ row }) => differenceCell(row.original.difference),
        meta: { label: t('openInvoices.difference'), numeric: true } satisfies DataTableColumnMeta<OpenInvoiceCompareRow>,
      },
      {
        id: 'why',
        accessorFn: (r) => r.why.join('; '),
        size: 340,
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.why')} />,
        cell: ({ row }) => (
          <span className="flex flex-col gap-0.5 whitespace-normal break-words">
            {row.original.why.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </span>
        ),
        meta: { label: t('openInvoices.why') } satisfies DataTableColumnMeta<OpenInvoiceCompareRow>,
      },
    ],
    [t, isMobile],
  )

  const errorMessage = compare.isError
    ? isSrsBusyError(compare.error)
      ? t('common.serverBusy')
      : compare.error instanceof Error
        ? compare.error.message
        : t('common.failedToLoad')
    : null

  const snap = data?.snapshot
  const subtitle = snap ? (
    <span className="tabular-nums">
      {t('openInvoices.generated')} {formatNyDateTime(snap.generatedAt)} · {t('openInvoices.by')} {snap.generatedBy} ·{' '}
      {t('openInvoices.asOf')} {formatUsCalendarDate(snap.asOf)} · {t('dealer.labelPlural')}: <SnapshotDealers snapshot={snap} />
    </span>
  ) : undefined

  return (
    <div className="space-y-6">
      <AppLink
        href="/reports/open-invoices"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('openInvoices.title')}
      </AppLink>

      <PageHeading
        title={`${t('openInvoices.snapshot')} #${id}`}
        subtitle={subtitle}
        icon={<History />}
        variant="success"
        titleAside={<ReportRulesNotice screen="openInvoicesCompare" />}
      />

      <p className="text-sm text-muted-foreground">{t('openInvoices.compareIntro')}</p>

      {errorMessage && !compare.isLoading ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="min-w-0">
        <DataTable<OpenInvoiceCompareRow>
          tableId="open-invoice-compare"
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.sid)}
          isLoading={compare.isFetching}
          sorting={sorting}
          onSortingChange={setSorting}
          columnPinning={DEALER_PINNING}
          defaultPageSize={100}
          includeAllPageSize
          enableGlobalFilter={false}
          exportAction={
            <ServerXlsxExportButton
              url={valid && data ? openInvoiceSnapshotCompareExportUrl(id) : null}
              rowCount={rows.length}
              fallbackFileName={`open_invoices_snapshot_${id}.xlsx`}
              disabled={compare.isFetching || !data}
            />
          }
          recordsCount={rows.length}
          footer={
            data ? (
              <div className="flex w-full flex-col gap-1 border-t border-border px-3 py-2 text-left text-sm md:flex-row md:items-center md:justify-between md:gap-4">
                <span className="font-semibold">{t('openInvoices.total')}</span>
                <span className="flex flex-wrap gap-x-5 gap-y-1">
                  <span className="whitespace-nowrap">
                    <span className="text-muted-foreground">{t('openInvoices.inSnapshot')}: </span>
                    <span className="font-semibold tabular-nums">{fmtMoney(data.totals.snapshot)}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="text-muted-foreground">{t('openInvoices.today')}: </span>
                    <span className="font-semibold tabular-nums">{fmtMoney(data.totals.today)}</span>
                  </span>
                  <span className="whitespace-nowrap">
                    <span className="text-muted-foreground">{t('openInvoices.difference')}: </span>
                    {differenceCell(data.totals.difference)}
                  </span>
                </span>
              </div>
            ) : undefined
          }
          emptyState={
            data ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('openInvoices.compareNoChanges')}</p>
            ) : undefined
          }
        />
      </div>
    </div>
  )
}
