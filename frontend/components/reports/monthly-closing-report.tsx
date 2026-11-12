'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { CalendarCheck, CarFront, TriangleAlert } from 'lucide-react'
import { MonthlyClosingDealerDialog } from '@/components/reports/monthly-closing-dealer-dialog'
import { RemovedDealerBadge } from '@/components/filters/removed-dealer-badge'
import { RemovedDealersSwitch } from '@/components/filters/removed-dealers-switch'
import { PageHeading } from '@/components/layout/page-heading'
import {
  DataTable,
  DataTableColumnHeader,
  type DataTableColumnMeta,
} from '@/components/shared/data-table'
import { ReportRulesNotice } from '@/components/shared/report-rules-notice'
import { ServerXlsxExportButton } from '@/components/shared/server-xlsx-export-button'
import { useRemovedDealersSwitch } from '@/hooks/use-removed-dealers-available'
import { useIsMobile } from '@/hooks/use-mobile'
import { useFilters } from '@/lib/filter-context'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation, type TranslateFn } from '@/lib/i18n/locale-context'
import { fmtMoney } from '@/lib/kpi-money'
import {
  closingMonthLabel,
  isValidClosingMonth,
  monthBounds,
  type ClosingScope,
} from '@/lib/reports/monthly-closing-month'
import {
  fetchMonthlyClosing,
  monthlyClosingExportUrl,
  type ClosingPeriod,
  type ClosingRow,
  type MonthlyClosingQueryParams,
} from '@/lib/srs-kpis-api'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import { cn } from '@/lib/utils'

function pctLabel(pct: number | null): React.ReactNode {
  return pct == null ? <span className="text-muted-foreground">—</span> : `${pct.toFixed(1)}%`
}

function profitCell(profit: number): React.ReactNode {
  return <span className={cn('tabular-nums', profit < 0 && 'text-destructive')}>{fmtMoney(profit)}</span>
}

/** «Pay periods: 08/31/2026 – 09/15/2026, …» con el estado de cada uno (MC §5.4.5). */
function periodsLine(periods: ClosingPeriod[], t: TranslateFn): string {
  if (periods.length === 0) return t('monthlyClosing.noPayPeriods')
  const list = periods
    .map((p) => {
      const range = `${formatUsCalendarDate(p.desde)} – ${formatUsCalendarDate(p.hasta)}`
      if (p.status === 'partial' && p.calculatedThrough) {
        return `${range} ${t('monthlyClosing.calculatedThrough', { date: formatUsCalendarDate(p.calculatedThrough) })}`
      }
      if (p.status === 'notCalculated') return `${range} ${t('monthlyClosing.notCalculated')}`
      return range
    })
    .join(', ')
  return t('monthlyClosing.payPeriods', { periods: list })
}

/**
 * Reports › Monthly Closing (plans/plan-monthly-closing §5.4) y Reports › Window Tint Closing
 * (plans/plan-reporte-tint §5, `scope="tint"`): una sola pantalla, el alcance cambia columnas, textos y cuentas.
 */
export function MonthlyClosingReport({ scope }: { scope: ClosingScope }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { closingMonth, selectedDealers, filtersHydrated } = useFilters()
  const tint = scope === 'tint'
  const [openDealer, setOpenDealer] = React.useState<{ dealerId: number; dealer: string } | null>(null)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'dealer', desc: false }])

  const idDealer = React.useMemo(() => selectedDealers.join(','), [selectedDealers])
  const monthValid = isValidClosingMonth(closingMonth)
  const bounds = monthValid ? monthBounds(closingMonth) : null
  const ready = filtersHydrated && selectedDealers.length > 0 && monthValid

  const removedDealers = useRemovedDealersSwitch({
    fechaDesde: bounds?.firstDay,
    fechaHasta: bounds?.lastDay,
    filterDateDone: false,
    ready,
  })
  const removedIds = removedDealers.removedIds

  const params = React.useMemo((): MonthlyClosingQueryParams | null => {
    if (!ready) return null
    return { month: closingMonth, idDealer, includeRemovedDealers: removedDealers.include, scope }
  }, [ready, closingMonth, idDealer, removedDealers.include, scope])

  const report = useQuery({
    queryKey: ['srs-report', 'monthly-closing', params],
    queryFn: () => fetchMonthlyClosing(params!),
    enabled: Boolean(params),
  })
  const data = report.data
  const rows = data?.rows ?? []

  const columnPinning = React.useMemo(
    () => (isMobile ? { left: [], right: [] } : { left: ['dealer'] }),
    [isMobile],
  )

  const columns = React.useMemo<ColumnDef<ClosingRow>[]>(() => {
    const money = (key: 'income' | 'payroll' | 'expenses', title: string): ColumnDef<ClosingRow> => ({
      accessorKey: key,
      size: 150,
      header: ({ column }) => <DataTableColumnHeader column={column} title={title} />,
      // Window Tint Closing: el Income con servicios sin «tint» va en el color de error, como el dealer.
      cell: ({ row }) =>
        key === 'income' && row.original.nonTint ? (
          <span className="text-destructive">{fmtMoney(row.original[key])}</span>
        ) : (
          fmtMoney(row.original[key])
        ),
      meta: { label: title, numeric: true, money: true } satisfies DataTableColumnMeta<ClosingRow>,
    })
    const list: ColumnDef<ClosingRow>[] = [
      {
        accessorKey: 'dealer',
        size: 320,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('dealer.label')} />,
        // Misma celda que Production vs Goal (production-dealer-table.tsx): en celular el nombre entero en varias
        // líneas, nunca «…» (regla data-table). Window Tint Closing: con servicios sin «tint», en rojo con ⚠.
        cell: ({ row }) => {
          const nonTint = row.original.nonTint === true
          const removed = removedIds.has(row.original.dealerId)
          if (!removed && !nonTint) {
            return (
              <span className={cn('block font-medium', isMobile ? 'whitespace-normal break-words' : 'truncate')}>
                {row.original.dealer}
              </span>
            )
          }
          return (
            <span
              className={cn('flex min-w-0 gap-2', isMobile ? 'flex-wrap items-start' : 'items-center', nonTint && 'text-destructive')}
            >
              {nonTint ? (
                <TriangleAlert
                  className={cn('size-4 shrink-0', isMobile && 'mt-0.5')}
                  role="img"
                  aria-label={t('monthlyClosing.nonTintIconLabel')}
                  data-testid="monthly-closing-non-tint-icon"
                />
              ) : null}
              <span className={cn('font-medium', isMobile ? 'whitespace-normal break-words' : 'truncate')}>
                {row.original.dealer}
              </span>
              {removed ? <RemovedDealerBadge /> : null}
            </span>
          )
        },
        meta: {
          label: t('dealer.label'),
          // Ninguna columna fija en celular: tapa a las demás (regla data-table).
          pin: isMobile ? undefined : 'left',
        } satisfies DataTableColumnMeta<ClosingRow>,
      },
    ]
    if (tint) {
      list.push({
        accessorKey: 'vehicles',
        size: 110,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('monthlyClosing.colVehicles')} />,
        cell: ({ row }) => (row.original.vehicles ?? 0).toLocaleString(),
        meta: { label: t('monthlyClosing.colVehicles'), numeric: true } satisfies DataTableColumnMeta<ClosingRow>,
      })
    }
    list.push(
      money('income', t('monthlyClosing.colIncome')),
      money('payroll', t('monthlyClosing.colPayroll')),
      money('expenses', t('monthlyClosing.colExpenses')),
      {
        accessorKey: 'profit',
        size: 150,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('monthlyClosing.colProfit')} />,
        cell: ({ row }) => profitCell(row.original.profit),
        meta: { label: t('monthlyClosing.colProfit'), numeric: true, money: true } satisfies DataTableColumnMeta<ClosingRow>,
      },
      {
        accessorKey: 'pct',
        size: 90,
        sortUndefined: 'last',
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('monthlyClosing.colPct')} />,
        cell: ({ row }) => pctLabel(row.original.pct),
        meta: { label: t('monthlyClosing.colPct'), numeric: true } satisfies DataTableColumnMeta<ClosingRow>,
      },
    )
    if (!tint) {
      list.push({
        accessorKey: 'accident',
        size: 130,
        header: ({ column }) => <DataTableColumnHeader column={column} title={t('monthlyClosing.colAccident')} />,
        cell: ({ row }) =>
          row.original.accident ? fmtMoney(row.original.accident) : <span className="text-muted-foreground">—</span>,
        meta: { label: t('monthlyClosing.colAccident'), numeric: true, money: true } satisfies DataTableColumnMeta<ClosingRow>,
      })
    }
    return list
  }, [t, tint, isMobile, removedIds])

  const busyMessage = report.isError
    ? isSrsBusyError(report.error)
      ? t('common.serverBusy')
      : report.error instanceof Error
        ? report.error.message
        : t('common.failedToLoad')
    : null

  /** Total y Without dealer: una línea cada uno, con las columnas de la tabla como etiqueta. */
  const totalsLine = (row: ClosingRow, label: string, onClick?: () => void) => {
    const items: [string, React.ReactNode][] = [
      ...(tint ? [[t('monthlyClosing.colVehicles'), (row.vehicles ?? 0).toLocaleString()] as [string, React.ReactNode]] : []),
      [t('monthlyClosing.colIncome'), fmtMoney(row.income)],
      [t('monthlyClosing.colPayroll'), fmtMoney(row.payroll)],
      [t('monthlyClosing.colExpenses'), fmtMoney(row.expenses)],
      [t('monthlyClosing.colProfit'), profitCell(row.profit)],
      [t('monthlyClosing.colPct'), pctLabel(row.pct)],
      ...(!tint && row.accident
        ? [[t('monthlyClosing.colAccident'), fmtMoney(row.accident)] as [string, React.ReactNode]]
        : []),
    ]
    const content = (
      <>
        <span className="font-semibold">{label}</span>
        <span className="flex flex-wrap gap-x-5 gap-y-1">
          {items.map(([k, v]) => (
            <span key={k} className="whitespace-nowrap">
              <span className="text-muted-foreground">{k}: </span>
              <span className="font-semibold tabular-nums">{v}</span>
            </span>
          ))}
        </span>
      </>
    )
    const cls = 'flex w-full flex-col gap-1 px-3 py-2 text-left text-sm md:flex-row md:items-center md:justify-between md:gap-4'
    return onClick ? (
      <button type="button" className={cn(cls, 'cursor-pointer hover:bg-accent/40')} onClick={onClick}>
        {content}
      </button>
    ) : (
      <div className={cls}>{content}</div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={tint ? t('monthlyClosing.tintTitle') : t('monthlyClosing.title')}
        subtitle={
          <span>
            {monthValid ? <span className="font-medium">{closingMonthLabel(closingMonth)} · </span> : null}
            {tint ? t('monthlyClosing.tintSubtitle') : t('monthlyClosing.subtitle')}
          </span>
        }
        icon={tint ? <CarFront /> : <CalendarCheck />}
        variant="success"
        titleAside={<ReportRulesNotice screen={tint ? 'tintClosing' : 'monthlyClosing'} />}
      />

      {!filtersHydrated || selectedDealers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('dealer.selectInHeaderToLoad')}</p>
      ) : !monthValid ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t('monthlyClosing.monthError')}
        </p>
      ) : null}

      {removedDealers.visible ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <RemovedDealersSwitch
            id={`include-removed-dealers-${tint ? 'window-tint-closing' : 'monthly-closing'}`}
            state={removedDealers}
            disabled={!ready}
          />
        </div>
      ) : null}

      {busyMessage && !report.isLoading ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {busyMessage}
        </div>
      ) : null}

      <div className="min-w-0">
        <DataTable<ClosingRow>
          tableId={tint ? 'window-tint-closing' : 'monthly-closing'}
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.dealerId)}
          isLoading={report.isFetching}
          sorting={sorting}
          onSortingChange={setSorting}
          columnPinning={columnPinning}
          defaultPageSize={100}
          includeAllPageSize
          enableGlobalFilter={false}
          // El Excel lo arma Nest con Report Info (D5): Summary, (By service), Income, Payroll y Expenses.
          enableExport={false}
          exportAction={
            <ServerXlsxExportButton
              url={params ? monthlyClosingExportUrl(params) : null}
              rowCount={rows.length}
              fallbackFileName={tint ? 'window_tint_closing.xlsx' : 'monthly_closing.xlsx'}
              disabled={report.isFetching || rows.length === 0}
            />
          }
          recordsCount={rows.length}
          recordsCountLabel={t('dealer.labelPlural')}
          toolbarLeading={
            <span className="text-xs text-muted-foreground">{rows.length > 0 ? t('monthlyClosing.rowHint') : null}</span>
          }
          onRowClick={(row) => setOpenDealer({ dealerId: row.dealerId, dealer: row.dealer })}
          footer={
            data && rows.length > 0 ? (
              <div className="divide-y divide-border border-t border-border">
                {totalsLine(data.total, t('monthlyClosing.total'))}
                {data.withoutDealer
                  ? totalsLine(data.withoutDealer, t('monthlyClosing.withoutDealer'), () =>
                      setOpenDealer({ dealerId: 0, dealer: t('monthlyClosing.withoutDealer') }),
                    )
                  : null}
              </div>
            ) : undefined
          }
          // Sin dealers elegidos no hay mes que decir vacío: arriba ya está «elegí dealers en el encabezado».
          emptyState={
            data ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {tint ? t('monthlyClosing.tintEmpty') : t('monthlyClosing.empty')}
              </p>
            ) : undefined
          }
        />
      </div>

      {tint && rows.some((r) => r.nonTint) ? (
        <p className="text-xs text-destructive" data-testid="monthly-closing-non-tint-dealers-note">
          {t('monthlyClosing.nonTintDealersNote')}
        </p>
      ) : null}

      {data ? <p className="text-sm text-muted-foreground tabular-nums">{periodsLine(data.periods, t)}</p> : null}

      {params ? (
        <MonthlyClosingDealerDialog dealer={openDealer} onClose={() => setOpenDealer(null)} params={params} />
      ) : null}
    </div>
  )
}
