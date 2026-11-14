'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, Loader2, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatUsCalendarDate } from '@/lib/format-us-datetime'
import { useTranslation } from '@/lib/i18n/locale-context'
import { fmtMoney, fmtQty } from '@/lib/kpi-money'
import { fetchIncomeByDealerServices, type IncomeServicesDealer } from '@/lib/srs-kpis-api'
import { isSrsBusyError } from '@/lib/srs-busy-error'
import { cn } from '@/lib/utils'
import { IncomeServiceVehiclesDialog } from './income-service-vehicles-dialog'
import { useServiceVehicles, type ServiceVehiclesTarget } from './income-service-vehicles-query'

/** Vehicles shown inside the open service row; the rest are in «View in a window» (plan §5.2, D1). */
const VEHICLES_IN_ROW = 50

type RowRange = { fechaDesde: string; fechaHasta: string; filterDateDone: boolean }

/**
 * The open row of Income by Dealer (plans/plan-income-by-dealer-por-servicio §5.2 and T3): the services of one dealer in
 * one year, asked alone (one dealer and one year per request). Markup of the Expenses sub-table (`GroupRows`).
 * TTK by invoice and the vehicles of each service: plans/plan-income-by-dealer-ttk-y-autos §5.1, §5.2, T4 and T5.
 */
export function IncomeDealerServices({
  dealerId,
  fechaDesde,
  fechaHasta,
  filterDateDone,
  wrap,
  yearLabel,
}: {
  dealerId: number
  /** The range of that year, as the backend cropped it. */
  fechaDesde: string
  fechaHasta: string
  filterDateDone: boolean
  wrap: string
  /** «2026» or «2026 YTD», as the table of the year says (title of «View in a window»). */
  yearLabel: string
}) {
  const { t } = useTranslation()
  // Without «Include removed dealers»: sent, the request of one dealer would also bring every removed one (T3). A removed
  // dealer is still found by its id, so the answer does not depend on the switch and the key does not carry it.
  const query = useQuery({
    queryKey: ['srs-kpi', 'income-by-dealer-services', { fechaDesde, fechaHasta, idDealer: dealerId, filterDateDone }],
    queryFn: () => fetchIncomeByDealerServices({ fechaDesde, fechaHasta, idDealer: String(dealerId), filterDateDone }),
  })

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center px-3 py-6 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      </div>
    )
  }
  if (query.isError) {
    return (
      <p className="px-3 py-3 text-xs text-destructive">
        {isSrsBusyError(query.error) ? t('common.serverBusy') : t('common.failedToLoad')}
      </p>
    )
  }
  // Its own dealer, never the first one or the totals of the year.
  const d = query.data?.years[0]?.dealers.find((x) => x.dealerId === dealerId)
  if (!d) return <p className="px-3 py-3 text-xs text-muted-foreground">{t('incomeByDealer.noData')}</p>
  return (
    <ServicesTable d={d} wrap={wrap} range={{ fechaDesde, fechaHasta, filterDateDone }} yearLabel={yearLabel} />
  )
}

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

function ServicesTable({
  d,
  wrap,
  range,
  yearLabel,
}: {
  d: IncomeServicesDealer
  wrap: string
  range: RowRange
  yearLabel: string
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [openServices, setOpenServices] = React.useState<Set<string>>(() => new Set())
  const [openInvoices, setOpenInvoices] = React.useState<Set<string>>(() => new Set())
  const [windowTarget, setWindowTarget] = React.useState<ServiceVehiclesTarget | null>(null)
  const num = 'py-1 pl-2 text-right tabular-nums'
  const head = 'py-1 font-medium text-muted-foreground'
  const total = 'border-t border-border/50 font-semibold'
  const section = (title: string) => (
    <tr>
      <td colSpan={4} className={cn('pb-1 pt-3 font-semibold', wrap)}>
        {title}
      </td>
    </tr>
  )
  const targetOf = (s: IncomeServicesDealer['wo']['services'][number]): ServiceVehiclesTarget => ({
    dealerId: d.dealerId,
    dealer: d.dealer,
    service: s.service,
    ...range,
    qty: s.qty,
    vehicles: s.vehicles,
    income: s.income,
  })
  const invoices = d.ttk.invoices ?? []
  return (
    <div className="min-w-0 px-3 py-2" data-testid="income-dealer-services">
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col />
          <col className="w-12 sm:w-32" />
          <col className="w-16 sm:w-32" />
          {/* Income: en celular entra «$1,040,784.32» del total del dealer por año (texto sm en negrita). */}
          <col className="w-28 sm:w-40" />
        </colgroup>
        <tbody>
          {d.wo.services.length > 0 ? (
            <>
              {section(t('incomeByDealer.sectionWo'))}
              <tr>
                <th className={cn(head, 'text-left')}>{t('incomeByDealer.colService')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colQty')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colVehicles')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colIncome')}</th>
              </tr>
              {d.wo.services.map((s) => {
                const open = openServices.has(s.service)
                const target = targetOf(s)
                return (
                  <React.Fragment key={s.service}>
                    <ServiceRow
                      service={s}
                      open={open}
                      wrap={wrap}
                      num={num}
                      isMobile={isMobile}
                      onToggle={() => setOpenServices((prev) => toggle(prev, s.service))}
                      onWindow={() => setWindowTarget(target)}
                    />
                    {open ? (
                      <ServiceVehiclesRows
                        target={target}
                        isMobile={isMobile}
                        num={num}
                        onViewAll={() => setWindowTarget(target)}
                      />
                    ) : null}
                  </React.Fragment>
                )
              })}
              <tr className={total} data-testid="income-services-total-wo">
                <td className={cn('py-1 pr-2', wrap)}>{t('incomeByDealer.totalWo')}</td>
                <td className={num}>{fmtQty(d.wo.qty)}</td>
                <td className={num}>{fmtQty(d.wo.vehicles)}</td>
                <td className={num}>{fmtMoney(d.wo.income)}</td>
              </tr>
            </>
          ) : null}

          {d.generic.lines.length > 0 ? (
            <>
              {section(t('incomeByDealer.sectionGeneric'))}
              <tr>
                <th className={cn(head, 'text-left')}>{t('incomeByDealer.colDescription')}</th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colQty')}</th>
                <th />
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colIncome')}</th>
              </tr>
              {d.generic.lines.map((g, i) => (
                <tr key={`${g.description}-${i}`} className="border-t border-border/50">
                  <td className={cn('py-1 pr-2', wrap)}>{g.description}</td>
                  <td className={num}>{g.qty === null ? '' : fmtQty(g.qty)}</td>
                  <td />
                  <td className={num}>{fmtMoney(g.income)}</td>
                </tr>
              ))}
              <tr className={total}>
                <td className={cn('py-1 pr-2', wrap)}>{t('incomeByDealer.totalGeneric')}</td>
                <td />
                <td />
                <td className={num}>{fmtMoney(d.generic.income)}</td>
              </tr>
            </>
          ) : null}

          {invoices.length > 0 ? (
            <>
              {section(t('incomeByDealer.sectionTtk'))}
              <tr>
                <th colSpan={3} className={cn(head, 'text-left')}>
                  {t('invoices.colInvoice')}
                </th>
                <th className={cn(head, 'pl-2 text-right')}>{t('incomeByDealer.colIncome')}</th>
              </tr>
              {invoices.map((inv) => {
                const open = openInvoices.has(inv.nro)
                return (
                  <React.Fragment key={inv.nro}>
                    <tr
                      className="cursor-pointer border-t border-border/50 hover:bg-muted/40"
                      data-testid="income-ttk-invoice"
                      onClick={() => setOpenInvoices((prev) => toggle(prev, inv.nro))}
                    >
                      <td colSpan={3} className="py-1 pr-2">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${inv.nro}: ${open ? t('incomeByDealer.hideEmployees') : t('incomeByDealer.showEmployees')}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenInvoices((prev) => toggle(prev, inv.nro))
                          }}
                          className="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-2 text-left"
                        >
                          <span className="flex items-center gap-1 font-medium">
                            {open ? (
                              <ChevronDown className="size-3.5 shrink-0" />
                            ) : (
                              <ChevronRight className="size-3.5 shrink-0" />
                            )}
                            {inv.nro}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatUsCalendarDate(inv.dateFrom)} – {formatUsCalendarDate(inv.dateTo)}
                          </span>
                        </button>
                      </td>
                      <td className={num}>{fmtMoney(inv.income)}</td>
                    </tr>
                    {open
                      ? inv.employees.map((e) => (
                          <tr key={e.employee} className="border-t border-border/30" data-testid="income-ttk-employee">
                            <td colSpan={3} className="whitespace-normal break-words py-1 pl-7 pr-2 text-muted-foreground">
                              {e.employee}
                            </td>
                            <td className={num}>{fmtMoney(e.income)}</td>
                          </tr>
                        ))
                      : null}
                  </React.Fragment>
                )
              })}
              <tr className={total}>
                <td colSpan={3} className={cn('py-1 pr-2', wrap)}>
                  {t('incomeByDealer.totalTtk')}
                </td>
                <td className={num}>{fmtMoney(d.ttk.income)}</td>
              </tr>
            </>
          ) : null}

          <tr className="border-t-2 border-border font-semibold text-sm" data-testid="income-services-total-dealer">
            <td colSpan={3} className={cn('pb-1 pr-2 pt-3', wrap)}>
              {t('incomeByDealer.totalDealer', { dealer: d.dealer })}
            </td>
            <td className="pb-1 pl-2 pt-3 text-right tabular-nums">{fmtMoney(d.income)}</td>
          </tr>
        </tbody>
      </table>
      <IncomeServiceVehiclesDialog target={windowTarget} yearLabel={yearLabel} onClose={() => setWindowTarget(null)} />
    </div>
  )
}

/**
 * A service of Work Orders: a click opens or closes it in place; a right click (or the «⋯», which is how a phone gets
 * there) opens «Show / Hide vehicles» and «View in a window» (D1). One handler: the chevron and the «⋯» stop the click.
 */
function ServiceRow({
  service: s,
  open,
  wrap,
  num,
  isMobile,
  onToggle,
  onWindow,
}: {
  service: IncomeServicesDealer['wo']['services'][number]
  open: boolean
  wrap: string
  num: string
  isMobile: boolean
  onToggle: () => void
  onWindow: () => void
}) {
  const { t } = useTranslation()
  const items = (Item: typeof ContextMenuItem | typeof DropdownMenuItem) => (
    <>
      <Item onSelect={onToggle}>
        {open ? <ChevronUp /> : <ChevronDown />}
        {open ? t('incomeByDealer.hideVehicles') : t('incomeByDealer.showVehicles')}
      </Item>
      <Item onSelect={onWindow}>
        <ExternalLink />
        {t('incomeByDealer.viewInWindow')}
      </Item>
    </>
  )
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <tr
          className="cursor-pointer border-t border-border/50 hover:bg-muted/40"
          data-testid="income-service-row"
          onClick={onToggle}
        >
          <td className={cn('py-1 pr-2', wrap)}>
            <span className="flex min-w-0 items-center gap-1">
              {/* En celular no entra al lado de nombres como «Headlight Restoration» (la columna mide ~80 px): el menú
                  se abre dejando el dedo apretado sobre la fila, y la ventana tiene su botón al pie de los autos. */}
              {isMobile ? null : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="relative size-6 shrink-0 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">{t('expenses.actions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                  {items(DropdownMenuItem)}
                </DropdownMenuContent>
              </DropdownMenu>
              )}
              <button
                type="button"
                aria-expanded={open}
                aria-label={t('incomeByDealer.showVehiclesOf', { service: s.service })}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle()
                }}
                className={cn('flex min-w-0 cursor-pointer items-center gap-1 text-left', wrap)}
              >
                {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                <span className={wrap}>{s.service}</span>
              </button>
            </span>
          </td>
          <td className={num}>{fmtQty(s.qty)}</td>
          <td className={num}>{fmtQty(s.vehicles)}</td>
          <td className={num}>{fmtMoney(s.income)}</td>
        </tr>
      </ContextMenuTrigger>
      <ContextMenuContent>{items(ContextMenuItem)}</ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * The vehicles of an open service, up to VEHICLES_IN_ROW (§5.2). Compu: one line per vehicle, Qty in its column. Celular
 * (approved in T1): the VIN on its own line next to the Income, and «Make Model Year · WO #» below, full width; the Qty of
 * the vehicle only when it is more than 1.
 */
function ServiceVehiclesRows({
  target,
  isMobile,
  num,
  onViewAll,
}: {
  target: ServiceVehiclesTarget
  isMobile: boolean
  num: string
  onViewAll: () => void
}) {
  const { t } = useTranslation()
  const query = useServiceVehicles(target)
  if (query.isLoading) {
    return (
      <tr>
        <td colSpan={4} className="py-3 text-center text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin" aria-hidden />
        </td>
      </tr>
    )
  }
  if (query.isError) {
    return (
      <tr>
        <td colSpan={4} className="py-2 pl-7 text-destructive">
          {isSrsBusyError(query.error) ? t('common.serverBusy') : t('common.failedToLoad')}
        </td>
      </tr>
    )
  }
  const rows = query.data?.rows ?? []
  const shown = rows.slice(0, VEHICLES_IN_ROW)
  const desc = (r: (typeof rows)[number]) => [r.make, r.model, r.carYear ?? ''].filter((x) => x !== '').join(' ')
  // «WO # MBP22171 · 10/05/2026»: each WO with its date (the date of the period), as the Date column of the window.
  const wos = (r: (typeof rows)[number]) =>
    t('incomeByDealer.woNumbers', {
      numbers: r.wos
        .map((n, i) => (r.woDates[i] ? `${n} · ${formatUsCalendarDate(r.woDates[i])}` : n))
        .join(', '),
    })
  return (
    <>
      {shown.map((r) =>
        isMobile ? (
          <React.Fragment key={r.vin}>
            <tr className="border-t border-border/30" data-testid="income-service-vehicle">
              <td colSpan={3} className="whitespace-nowrap pl-7 pt-1 font-mono">
                {r.vin}
                {r.qty !== 1 ? <span className="ml-1 font-sans text-muted-foreground">×{fmtQty(r.qty)}</span> : null}
              </td>
              <td className={cn(num, 'pt-1')}>{fmtMoney(r.income)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="whitespace-normal break-words pb-1 pl-7 pr-2 text-muted-foreground">
                {desc(r)} · {wos(r)}
              </td>
            </tr>
          </React.Fragment>
        ) : (
          <tr key={r.vin} className="border-t border-border/30" data-testid="income-service-vehicle">
            <td className="whitespace-normal break-words py-1 pl-7 pr-2">
              <span className="font-mono">{r.vin}</span> · {desc(r)}
              <div className="text-[11px] text-muted-foreground">{wos(r)}</div>
            </td>
            <td className={cn(num, 'align-top')}>{fmtQty(r.qty)}</td>
            <td />
            <td className={cn(num, 'align-top')}>{fmtMoney(r.income)}</td>
          </tr>
        ),
      )}
      {rows.length > VEHICLES_IN_ROW || isMobile ? (
        <tr className="border-t border-border/30">
          <td colSpan={4} className="py-1.5 pl-7 text-muted-foreground">
            {rows.length > VEHICLES_IN_ROW
              ? `${t('incomeByDealer.showingVehicles', { shown: shown.length, total: rows.length })} · `
              : null}
            <button
              type="button"
              className="cursor-pointer text-primary underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                onViewAll()
              }}
            >
              {rows.length > VEHICLES_IN_ROW ? t('incomeByDealer.viewAll') : t('incomeByDealer.viewInWindow')}
            </button>
          </td>
        </tr>
      ) : null}
    </>
  )
}
