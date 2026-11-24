'use client'

import * as React from 'react'
import type { RowSelectionState } from '@tanstack/react-table'
import { FilePlus2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deleteResultMessage } from '@/components/billing/wo-delete-result'
import { WoGenerateInvoiceDialog } from '@/components/billing/wo-generate-invoice-dialog'
import { useWoRowActions } from '@/components/billing/wo-row-actions'
import { woErrorMessage } from '@/components/billing/wo-to-be-billed-errors'
import {
  EMPTY_WO_FILTERS,
  WO_FILTER_INVOICE_TYPE_ID,
  WO_FILTER_SERVICES_ID,
  WoToBeBilledFilters,
  type WoFilterState,
} from '@/components/billing/wo-to-be-billed-filters'
import { WoToBeBilledTable } from '@/components/billing/wo-to-be-billed-table'
import { PageHeading } from '@/components/layout/page-heading'
import { AppLink } from '@/components/shared/app-link'
import { ReportRulesNotice } from '@/components/shared/report-rules-notice'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { useWoToBeBilledConfig, useWoToBeBilledList, useWoToBeBilledSummary } from '@/hooks/use-wo-to-be-billed'
import { useDeleteWorkOrders, useSingleFlight } from '@/hooks/use-wo-to-be-billed-mutations'
import { woUsDate } from '@/lib/billing/wo-to-be-billed-format'
import { useFilters } from '@/lib/filter-context'
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value'
import { useTranslation } from '@/lib/i18n/locale-context'
import {
  buildWoFilterRequest,
  WO_INVOICE_TYPE_BY_SERVICES,
  WO_INVOICE_TYPE_MULTI_SERVICES,
  WO_DELETE_MAX,
  WO_INVOICE_TYPE_SELECTED_SERVICES,
  type CreatedWoInvoice,
  type GenerateWoInvoicesResponse,
} from '@/lib/srs-wo-to-be-billed-api'
import { formatDateParam } from '@/lib/ttk/map-header-filters'

/** `YYYY-MM-DD` → fecha local (para el período de Invoices). */
function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Lleva el foco al campo que falta, cuando el panel ya lo dibujó (cerrado, su contenido no está en la página). */
function focusWhenDrawn(selector: string) {
  window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(selector)
      el?.scrollIntoView({ block: 'center' })
      el?.focus()
    }),
  )
}

/** Debounce de los buscadores, como Invoices. */
const SEARCH_DEBOUNCE_MS = 350
const PAGE_SIZE = 25
const NO_SELECTION: RowSelectionState = {}
/** Sin departments ni servicios (siempre el mismo arreglo, para que nada se redibuje). */
const NO_IDS: number[] = []

/**
 * Billing › WO to be Billed (plans/plan-wo-to-be-billed-v0, T9): las WO que tienen algún servicio sin invoice, para un
 * dealer y el rango de la barra. Mismo armado que `/billing/invoices`: título con el cartel de reglas, panel de filtros
 * con chips, tabla común con scroll. El permiso lo decide `getScreenAccess` (internos, 15 y 16).
 */
export default function WoToBeBilledPage() {
  const { t } = useTranslation()
  const {
    dateRange,
    selectedDealers,
    filtersHydrated,
    setInvoiceDateMode,
    setInvoiceDateFrom,
    setInvoiceDateTo,
    setInvoiceShowZeroOnce,
  } = useFilters()
  // La pantalla trabaja con un dealer: con ninguno o con varios, «Select one dealer…» (fila 1 de §2).
  const idDealer = selectedDealers.length === 1 ? Number(selectedDealers[0]) : null
  const oneDealer = idDealer != null && Number.isFinite(idDealer) && idDealer > 0 ? idDealer : null

  // Los filtros recuerdan para qué dealer se eligieron: departments y servicios son de ese dealer, y con otro dealer en
  // la barra arrancan vacíos (si no, el pedido mezcla el dealer nuevo con ids del anterior y Nest da 403; R9 de
  // CODE-review.md). El resto de los filtros sigue.
  const [filterState, setFilterState] = React.useState<{ dealer: number | null; value: WoFilterState }>({
    dealer: null,
    value: EMPTY_WO_FILTERS,
  })
  const filters = React.useMemo<WoFilterState>(
    () =>
      filterState.dealer === oneDealer
        ? filterState.value
        : { ...filterState.value, departments: NO_IDS, services: NO_IDS },
    [filterState, oneDealer],
  )
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<{ invoiceType?: string | null; services?: string | null }>({})
  const [generateOpen, setGenerateOpen] = React.useState(false)
  const [deleteSelectedOpen, setDeleteSelectedOpen] = React.useState(false)
  const setFilters = React.useCallback(
    (next: WoFilterState) => {
      setFilterState({ dealer: oneDealer, value: next })
      setFieldErrors({})
    },
    [oneDealer],
  )

  // El objeto se arma una vez por cambio de texto: si fuera nuevo en cada render, el debounce lo «cambiaría» cada
  // 350 ms y la pantalla se redibujaría sin parar (y perdería la selección).
  const typed = React.useMemo(
    () => ({ stock: filters.stock, wo: filters.wo, price: filters.price, ro: filters.ro, po: filters.po }),
    [filters.stock, filters.wo, filters.price, filters.ro, filters.po],
  )
  const texts = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS)

  const dateFrom = formatDateParam(dateRange?.from)
  const dateTo = formatDateParam(dateRange?.to ?? dateRange?.from)
  const gateReady = filtersHydrated && oneDealer != null && Boolean(dateFrom && dateTo)

  const request = React.useMemo(
    () =>
      gateReady
        ? buildWoFilterRequest({
            idDealer: oneDealer as number,
            dateFrom,
            dateTo,
            status: filters.status,
            departments: filters.departments,
            services: filters.services,
            invoiceType: filters.invoiceType,
            includeZero: filters.includeZero,
            approved: filters.approved,
            ...texts,
          })
        : null,
    [
      gateReady,
      oneDealer,
      dateFrom,
      dateTo,
      filters.status,
      filters.departments,
      filters.services,
      filters.invoiceType,
      filters.includeZero,
      filters.approved,
      texts,
    ],
  )

  // Otro filtro, otra lista: la selección vieja no se arrastra (queda atada al pedido con el que se hizo).
  const [selection, setSelection] = React.useState<{ request: unknown; value: RowSelectionState }>({
    request: null,
    value: {},
  })
  const rowSelection = selection.request === request ? selection.value : NO_SELECTION
  const setRowSelection = React.useCallback(
    (value: RowSelectionState) => setSelection({ request, value }),
    [request],
  )

  // Los tres pedidos salen juntos, sin esperarse uno al otro.
  const list = useWoToBeBilledList(request, PAGE_SIZE)
  const summary = useWoToBeBilledSummary(request)
  const config = useWoToBeBilledConfig(gateReady ? oneDealer : null)

  const rows = React.useMemo(() => list.data?.pages.flatMap((p) => p.results) ?? [], [list.data])
  const selectedRows = React.useMemo(() => rows.filter((r) => rowSelection[String(r.id)]), [rows, rowSelection])
  const woIds = React.useMemo(() => selectedRows.map((r) => r.id), [selectedRows])

  /**
   * «View in Invoices» (§5): antes de navegar deja Invoices con el período de las invoices creadas (no el rango del
   * filtro: una individual lleva la fecha de alta de la WO) y el aviso para que muestre también las de $0.
   */
  const viewInInvoices = React.useCallback(
    (invoices: CreatedWoInvoice[]) => {
      const froms = invoices.map((i) => i.dateFrom).sort()
      const tos = invoices.map((i) => i.dateTo).sort()
      return (
        <AppLink
          href="/billing/invoices"
          className="font-semibold text-primary underline-offset-2 hover:underline"
          onNavigate={() => {
            if (froms.length) {
              setInvoiceDateMode('range')
              setInvoiceDateFrom(ymdToDate(froms[0]))
              setInvoiceDateTo(ymdToDate(tos[tos.length - 1]))
            }
            setInvoiceShowZeroOnce(true)
          }}
        >
          {t('woToBeBilled.generate.viewInInvoices')}
        </AppLink>
      )
    },
    [setInvoiceDateMode, setInvoiceDateFrom, setInvoiceDateTo, setInvoiceShowZeroOnce, t],
  )

  const rowActions = useWoRowActions({ config: config.data, includeZero: filters.includeZero, viewInInvoices })

  /** Generate Invoice: si falta el Invoice Type (o un servicio con «Selected Services»), abre el panel y lleva el foco. */
  const onGenerateClick = () => {
    if (filters.invoiceType == null) {
      setFieldErrors({ invoiceType: t('woToBeBilled.generate.missingType') })
      setFilterOpen(true)
      focusWhenDrawn(`#${WO_FILTER_INVOICE_TYPE_ID}`)
      return
    }
    if (filters.invoiceType === WO_INVOICE_TYPE_SELECTED_SERVICES && filters.services.length === 0) {
      setFieldErrors({ services: t('woToBeBilled.generate.missingService') })
      setFilterOpen(true)
      focusWhenDrawn(`#${WO_FILTER_SERVICES_ID} button`)
      return
    }
    setGenerateOpen(true)
  }

  const onGenerated = (res: GenerateWoInvoicesResponse) => {
    setRowSelection({})
    const m = res.invoices.length
    toast.success(m === 1 ? t('woToBeBilled.generate.createdOne') : t('woToBeBilled.generate.created', { m }), {
      description: viewInInvoices(res.invoices),
    })
  }

  const removeSelected = useDeleteWorkOrders()
  const once = useSingleFlight()
  const confirmDeleteSelected = () =>
    once(async () => {
      try {
        const res = await removeSelected.mutateAsync({ ids: woIds, bulk: true })
        setDeleteSelectedOpen(false)
        setRowSelection({})
        if (res.failed.length === 0) {
          toast.success(
            res.deleted.length === 1
              ? t('woToBeBilled.delete.selectedDoneOne')
              : t('woToBeBilled.delete.selectedDone', { n: res.deleted.length }),
          )
        } else {
          toast.error(deleteResultMessage(res, selectedRows, t))
        }
      } catch (err) {
        setDeleteSelectedOpen(false)
        toast.error(woErrorMessage(err, t))
      }
    })

  // «Delete selected (n)» va al lado del contador, donde lo pone Invoices (regla data-table).
  const recordsNote =
    config.data?.canDeleteSelected && woIds.length > 0 ? (
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="ml-1 h-7 gap-1.5 px-2 text-[11px]"
        onClick={() => {
          // El Nest acepta hasta 200 por pedido: con más, se avisa antes de confirmar (R12 de CODE-review.md). Generar
          // no tiene tope.
          if (woIds.length > WO_DELETE_MAX) {
            toast.error(t('woToBeBilled.delete.tooMany', { max: WO_DELETE_MAX }))
            return
          }
          setDeleteSelectedOpen(true)
        }}
      >
        <Trash2 className="size-3.5" />
        {t('woToBeBilled.delete.selectedButton', { n: woIds.length })}
      </Button>
    ) : null

  const typeLabel: Record<number, string> = {
    [WO_INVOICE_TYPE_BY_SERVICES]: t('woToBeBilled.invoiceTypes.byServices'),
    [WO_INVOICE_TYPE_MULTI_SERVICES]: t('woToBeBilled.invoiceTypes.multiServices'),
    [WO_INVOICE_TYPE_SELECTED_SERVICES]: t('woToBeBilled.invoiceTypes.selectedServices'),
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeading
        title={t('woToBeBilled.title')}
        icon={<FilePlus2 />}
        variant="info"
        titleAside={<ReportRulesNotice screen="woToBeBilled" />}
        actions={
          config.data?.canGenerate ? (
            <Button type="button" onClick={onGenerateClick} disabled={!gateReady}>
              <FilePlus2 />
              {t('woToBeBilled.generate.button')}
            </Button>
          ) : null
        }
      />

      <WoToBeBilledFilters
        value={filters}
        onChange={setFilters}
        idDealer={oneDealer != null ? String(oneDealer) : ''}
        disabled={!gateReady}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        fieldErrors={fieldErrors}
      />

      <WoToBeBilledTable
        query={list}
        gateReady={gateReady}
        hasOneDealer={!filtersHydrated || oneDealer != null}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        summary={gateReady ? summary.data : undefined}
        renderActions={rowActions.renderActions}
        renderRoPo={rowActions.renderRoPo}
        recordsNote={recordsNote}
      />

      {rowActions.dialogs}

      {generateOpen ? (
        <WoGenerateInvoiceDialog
          open
          onOpenChange={setGenerateOpen}
          request={request}
          woIds={woIds}
          summary={[
            { label: t('woToBeBilled.filters.invoiceType'), value: filters.invoiceType != null ? typeLabel[filters.invoiceType] : '' },
            { label: t('woToBeBilled.columns.date'), value: `${woUsDate(dateFrom)} – ${woUsDate(dateTo)}` },
          ]}
          onGenerated={onGenerated}
        />
      ) : null}

      <ConfirmActionDialog
        open={deleteSelectedOpen}
        onOpenChange={setDeleteSelectedOpen}
        tone="danger"
        icon={Trash2}
        title={t('woToBeBilled.delete.title')}
        description={
          woIds.length === 1
            ? t('woToBeBilled.delete.selectedTextOne')
            : t('woToBeBilled.delete.selectedText', { n: woIds.length })
        }
        cancelLabel={t('woToBeBilled.generate.cancel')}
        confirmLabel={t('woToBeBilled.delete.confirm')}
        confirmIcon={Trash2}
        pending={removeSelected.isPending}
        pendingLabel={t('woToBeBilled.generate.processing')}
        onConfirm={() => {
          void confirmDeleteSelected()
        }}
      />
    </div>
  )
}
