'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { History, Hourglass } from 'lucide-react'
import { RemovedDealerBadge } from '@/components/filters/removed-dealer-badge'
import { RemovedDealersSwitch } from '@/components/filters/removed-dealers-switch'
import { PageHeading } from '@/components/layout/page-heading'
import { OpenInvoiceSnapshotsDialog } from '@/components/reports/open-invoice-snapshots-dialog'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { ReportRulesNotice } from '@/components/shared/report-rules-notice'
import { ServerXlsxExportButton } from '@/components/shared/server-xlsx-export-button'
import { Button } from '@/components/ui/button'
import { useRemovedDealersSwitch } from '@/hooks/use-removed-dealers-available'
import { useIsMobile } from '@/hooks/use-mobile'
import { useFilters } from '@/lib/filter-context'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fmtMoney } from '@/lib/kpi-money'
import { isValidAsOf } from '@/lib/reports/open-invoices-dates'
import {
  fetchOpenInvoices,
  OPEN_INVOICE_SNAPSHOTS_QUERY_KEY,
  openInvoicesExportUrl,
  type OpenInvoiceMoney,
  type OpenInvoiceRow,
  type OpenInvoicesQueryParams,
} from '@/lib/srs-kpis-api'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import { cn } from '@/lib/utils'

const DEALER_PINNING = { left: ['dealer'] }
const MONEY_KEYS = ['current', 'd15', 'd30', 'd60', 'd90', 'total'] as const

/**
 * Reports › Open Invoices (plans/plan-reporte-javier §1.2, §4.3): por dealer y departamento, lo que falta cobrar del
 * trabajo hecho hasta un domingo, por antigüedad. Armada como Monthly Closing: `PageHeading` con el cartel, el switch de
 * dealers eliminados, el `DataTable` compartido con los totales al pie y el Excel de Nest (que guarda la foto).
 */
export function OpenInvoicesReport() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  // «As of» viene del header (SundayFilter), como el mes de Monthly Closing.
  const { selectedDealers, filtersHydrated, openInvoicesAsOf: asOf } = useFilters()
  const [snapshotsOpen, setSnapshotsOpen] = React.useState(false)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'dealer', desc: false }])

  const idDealer = React.useMemo(() => selectedDealers.join(','), [selectedDealers])
  const asOfValid = isValidAsOf(asOf)
  const ready = filtersHydrated && selectedDealers.length > 0 && asOfValid

  // Sin rango: la historia entera (§4.3), como «Owed, all dates» de Invoices.
  const removedDealers = useRemovedDealersSwitch({ filterDateDone: false, ready })
  const removedIds = removedDealers.removedIds

  const params = React.useMemo((): OpenInvoicesQueryParams | null => {
    if (!ready) return null
    return { asOf, idDealer, includeRemovedDealers: removedDealers.include }
  }, [ready, asOf, idDealer, removedDealers.include])

  const report = useQuery({
    queryKey: ['srs-report', 'open-invoices', params],
    queryFn: () => fetchOpenInvoices(params!),
    enabled: Boolean(params),
  })
  const data = report.data
  const rows = data?.rows ?? []

  const labels: Record<(typeof MONEY_KEYS)[number], string> = React.useMemo(
    () => ({
      current: t('openInvoices.current'),
      d15: t('openInvoices.col15'),
      d30: t('openInvoices.col30'),
      d60: t('openInvoices.col60'),
      d90: t('openInvoices.col90'),
      total: t('openInvoices.total'),
    }),
    [t],
  )

  const columns = React.useMemo<ColumnDef<OpenInvoiceRow>[]>(() => {
    const money = (key: (typeof MONEY_KEYS)[number]): ColumnDef<OpenInvoiceRow> => ({
      accessorKey: key,
      size: key === 'total' ? 140 : 120,
      header: ({ column }) => <DataTableColumnHeader column={column} title={labels[key]} />,
      cell: ({ row }) => {
        const v = row.original[key]
        return v === 0 && key !== 'total' ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn(key === 'total' && 'font-semibold')}>{fmtMoney(v)}</span>
        )
      },
      meta: { label: labels[key], numeric: true } satisfies DataTableColumnMeta<OpenInvoiceRow>,
    })
    return [
      {
        accessorKey: 'dealer',
        size: 300,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dealer.label')} />,
        // Misma celda que Production vs Goal y Monthly Closing; en celular el DataTable no la fija ni la corta.
        cell: ({ row }) =>
          removedIds.has(row.original.dealerId) || row.original.removed ? (
            <span className={cn('flex min-w-0 gap-2', isMobile ? 'flex-wrap items-start' : 'items-center')}>
              <span className="truncate font-medium">{row.original.dealer}</span>
              <RemovedDealerBadge />
            </span>
          ) : (
            <span className="block truncate font-medium">{row.original.dealer}</span>
          ),
        meta: { label: t('dealer.label'), pin: 'left' } satisfies DataTableColumnMeta<OpenInvoiceRow>,
      },
      {
        accessorKey: 'department',
        size: 220,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('openInvoices.department')} />,
        cell: ({ row }) => <span className="whitespace-normal break-words">{row.original.department}</span>,
        meta: { label: t('openInvoices.department') } satisfies DataTableColumnMeta<OpenInvoiceRow>,
      },
      ...MONEY_KEYS.map(money),
    ]
  }, [t, labels, isMobile, removedIds])

  const errorMessage = report.isError
    ? isSrsBusyError(report.error)
      ? t('common.serverBusy')
      : report.error instanceof Error
        ? report.error.message
        : t('common.failedToLoad')
    : null

  const totalsLine = (totals: OpenInvoiceMoney) => (
    <div className="flex w-full flex-col gap-1 border-t border-border px-3 py-2 text-left text-sm md:flex-row md:items-center md:justify-between md:gap-4">
      <span className="font-semibold">{t('openInvoices.total')}</span>
      <span className="flex flex-wrap gap-x-5 gap-y-1">
        {MONEY_KEYS.map((k) => (
          <span key={k} className="whitespace-nowrap">
            <span className="text-muted-foreground">{labels[k]}: </span>
            <span className="font-semibold tabular-nums">{fmtMoney(totals[k])}</span>
          </span>
        ))}
      </span>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeading
        title={t('openInvoices.title')}
        icon={<Hourglass />}
        variant="success"
        titleAside={<ReportRulesNotice screen="openInvoices" />}
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeaderToLoad')}</p>
      ) : null}

      {removedDealers.visible ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <RemovedDealersSwitch id="include-removed-dealers-open-invoices" state={removedDealers} disabled={!ready} />
        </div>
      ) : null}

      {errorMessage && !report.isLoading ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="min-w-0">
        <DataTable<OpenInvoiceRow>
          tableId="open-invoices"
          columns={columns}
          data={rows}
          getRowId={(row) => `${row.dealerId}|${row.department}`}
          isLoading={report.isFetching}
          sorting={sorting}
          onSortingChange={setSorting}
          columnPinning={DEALER_PINNING}
          defaultPageSize={100}
          includeAllPageSize
          enableGlobalFilter={false}
          // El Excel lo arma Nest con Report Info (Summary e Invoices) y guarda la foto de lo que sale (T6).
          exportAction={
            <span className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                onClick={() => setSnapshotsOpen(true)}
              >
                <History className="size-3" />
                {t('openInvoices.snapshots')}
              </Button>
              <ServerXlsxExportButton
                url={params ? openInvoicesExportUrl(params) : null}
                rowCount={rows.length}
                fallbackFileName="open_invoices.xlsx"
                disabled={report.isFetching || rows.length === 0}
                onExported={() => void queryClient.invalidateQueries({ queryKey: OPEN_INVOICE_SNAPSHOTS_QUERY_KEY })}
              />
            </span>
          }
          recordsCount={rows.length}
          footer={data && rows.length > 0 ? totalsLine(data.totals) : undefined}
          emptyState={data ? <p className="py-8 text-center text-sm text-muted-foreground">—</p> : undefined}
        />
      </div>

      <OpenInvoiceSnapshotsDialog open={snapshotsOpen} onOpenChange={setSnapshotsOpen} />
    </div>
  )
}
