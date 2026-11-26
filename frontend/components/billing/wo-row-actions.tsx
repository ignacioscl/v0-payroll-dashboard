'use client'

import * as React from 'react'
import { Copy, Info, MoreHorizontal, Pencil, Printer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useDeleteWorkOrders,
  useGenerateIndividualInvoice,
  useSingleFlight,
  useWoPdf,
} from '@/hooks/use-wo-to-be-billed-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import { cn } from '@/lib/utils'
import { openPdfTabNow } from '@/lib/srs/parse-srs-response'
import {
  WO_STATUS_IN_TRANSIT,
  type CreatedWoInvoice,
  type WoToBeBilledConfig,
  type WoToBeBilledRow,
} from '@/lib/srs-wo-to-be-billed-api'
import { WoPoRoDialog } from './wo-po-ro-dialog'
import { woErrorMessage } from './wo-to-be-billed-errors'
import { deleteResultMessage } from './wo-delete-result'

type Dialog =
  | { kind: 'individual'; row: WoToBeBilledRow }
  | { kind: 'delete'; row: WoToBeBilledRow }
  | { kind: 'roPo'; row: WoToBeBilledRow; field: 'ro' | 'po' }
  | null

/**
 * Las acciones de la fila de WO to be Billed (plans/plan-wo-to-be-billed-v0, T10): Print WO (siempre), Obs (si la WO
 * tiene), Generate Individual Invoice (con «Create Invoice» y si la WO no tiene nada facturado) y Delete WO (según
 * `/config` y el estado de la fila); y el lápiz de RO# / PO#. Un solo juego de diálogos para toda la tabla.
 *
 * Los dos PDF se abren en una pestaña nueva **abierta en el mismo clic** (`openPdfTabNow`); en la individual, primero se
 * avisa y se invalida la lista, y el PDF va después.
 */
export function useWoRowActions({
  config,
  includeZero,
  viewInInvoices,
}: {
  config: WoToBeBilledConfig | undefined
  includeZero: boolean
  /** El enlace «View in Invoices» para las invoices creadas (lo arma la pantalla, con el período ya puesto). */
  viewInInvoices: (invoices: CreatedWoInvoice[]) => React.ReactNode
}) {
  const { t } = useTranslation()
  const [dialog, setDialog] = React.useState<Dialog>(null)
  const individual = useGenerateIndividualInvoice()
  const remove = useDeleteWorkOrders()
  const once = useSingleFlight()
  const fetchPdf = useWoPdf()

  const printWo = React.useCallback(
    (row: WoToBeBilledRow) => {
      const tab = openPdfTabNow()
      void fetchPdf(row.id)
        .then((blob) => tab.load(blob, `WO_${row.fullNro}.pdf`))
        .catch((err) => {
          tab.close()
          toast.error(woErrorMessage(err, t))
        })
    },
    [fetchPdf, t],
  )

  const canDelete = React.useCallback(
    (row: WoToBeBilledRow) =>
      Boolean(config?.canDeleteRow) ||
      (Boolean(config?.canDeleteRowInTransitOnly) && row.idWorkflow === WO_STATUS_IN_TRANSIT),
    [config],
  )

  /**
   * Las acciones de la fila con el mismo armado que Invoices (`invoice-row-actions.tsx`): las marcas a la vista en un
   * grupo (acá, Obs) y todas las acciones en el menú «⋯», con la que borra al final, separada y en rojo.
   */
  const renderActions = React.useCallback(
    (row: WoToBeBilledRow) => (
      <>
        {row.observation ? (
          <div
            className={cn(
              'inline-flex items-center gap-px rounded-md border border-border/80',
              'bg-muted/50 px-0.5 py-0.5 shadow-[inset_0_1px_0_0_hsl(var(--background)/0.6)]',
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm px-1 text-foreground/70"
                  tabIndex={0}
                  aria-label={t('woToBeBilled.tooltips.obs', { text: row.observation })}
                >
                  <Info className="size-3.5 shrink-0" strokeWidth={1.75} />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-normal">
                {t('woToBeBilled.tooltips.obs', { text: row.observation })}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t('woToBeBilled.columns.actions')}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => printWo(row)}>
              <Printer className="size-4" />
              {t('woToBeBilled.tooltips.printWo')}
            </DropdownMenuItem>
            {config?.canGenerate && !row.woHaveInvoice ? (
              <DropdownMenuItem onClick={() => setDialog({ kind: 'individual', row })}>
                <Copy className="size-4" />
                {t('woToBeBilled.tooltips.generateIndividual')}
              </DropdownMenuItem>
            ) : null}
            {canDelete(row) ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDialog({ kind: 'delete', row })}
                >
                  <Trash2 className="size-4" />
                  {t('woToBeBilled.tooltips.deleteWo')}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ),
    [t, printWo, config, canDelete],
  )

  /** RO# / PO#: la celda de PO / RO de Invoices — el valor (o «—») y el lápiz chico, todo un botón. */
  const renderRoPo = React.useCallback(
    (row: WoToBeBilledRow, field: 'ro' | 'po') => (
      <button
        type="button"
        aria-label={field === 'ro' ? t('woToBeBilled.tooltips.editRo') : t('woToBeBilled.tooltips.editPo')}
        className="inline-flex items-center gap-1 text-left text-foreground hover:text-accent"
        onClick={(e) => {
          e.stopPropagation()
          setDialog({ kind: 'roPo', row, field })
        }}
      >
        <span>{row[field]?.trim() || '—'}</span>
        <Pencil className="h-3 w-3 opacity-50" />
      </button>
    ),
    [t],
  )

  /** Confirmar la individual: la pestaña se abre en este clic; el PDF se carga cuando llega. */
  const confirmIndividual = (row: WoToBeBilledRow) => {
    // `once` corre la función en el mismo clic (antes del primer `await`): la pestaña se abre en el clic, y un
    // segundo clic no abre otra.
    void once(async () => {
      const tab = openPdfTabNow()
      let created: CreatedWoInvoice
      try {
        created = await individual.mutateAsync({ idInvoice: row.id, includeZero })
      } catch (err) {
        tab.close()
        toast.error(woErrorMessage(err, t))
        return
      }
      setDialog(null)
      // Primero el aviso y la lista (la invalida la mutación); el PDF, después.
      toast.success(t('woToBeBilled.generate.createdOne'), { description: viewInInvoices([created]) })
      // El PDF va aparte: la guarda se suelta acá, así un PDF demorado no se come la confirmación de otra fila (R16 de
      // plans/plan-wo-to-be-billed-v0/CODE-review.md).
      void fetchPdf(row.id)
        .then((blob) => tab.load(blob, `Invoice_${created.fullNro}.pdf`))
        .catch(() => {
          tab.close()
          toast.warning(t('woToBeBilled.individual.pdfFailed', { nro: created.fullNro }), {
            description: viewInInvoices([created]),
          })
        })
    })
  }

  const confirmDelete = (row: WoToBeBilledRow) => {
    void once(async () => {
      try {
        const res = await remove.mutateAsync({ ids: [row.id], bulk: false })
        setDialog(null)
        if (res.deleted.length === 1) toast.success(t('woToBeBilled.delete.done', { wo: row.fullNro }))
        else toast.error(deleteResultMessage(res, [row], t))
      } catch (err) {
        toast.error(woErrorMessage(err, t))
      }
    })
  }

  const dialogs = (
    <>
      <ConfirmActionDialog
        open={dialog?.kind === 'individual'}
        onOpenChange={(open) => !open && setDialog(null)}
        tone="info"
        icon={Copy}
        title={t('woToBeBilled.individual.title')}
        description={dialog?.kind === 'individual' ? t('woToBeBilled.individual.text', { wo: dialog.row.fullNro }) : ''}
        cancelLabel={t('woToBeBilled.generate.cancel')}
        confirmLabel={t('woToBeBilled.individual.confirm')}
        confirmIcon={Copy}
        pending={individual.isPending}
        pendingLabel={t('woToBeBilled.generate.processing')}
        onConfirm={() => {
          if (dialog?.kind === 'individual') confirmIndividual(dialog.row)
        }}
      />
      <ConfirmActionDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        tone="danger"
        icon={Trash2}
        title={t('woToBeBilled.delete.title')}
        description={dialog?.kind === 'delete' ? t('woToBeBilled.delete.text', { wo: dialog.row.fullNro }) : ''}
        cancelLabel={t('woToBeBilled.generate.cancel')}
        confirmLabel={t('woToBeBilled.delete.confirm')}
        confirmIcon={Trash2}
        pending={remove.isPending}
        pendingLabel={t('woToBeBilled.generate.processing')}
        onConfirm={() => {
          if (dialog?.kind === 'delete') confirmDelete(dialog.row)
        }}
      />
      {dialog?.kind === 'roPo' ? (
        <WoPoRoDialog
          key={`${dialog.row.id}-${dialog.field}`}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          row={dialog.row}
          field={dialog.field}
        />
      ) : null}
    </>
  )

  return { renderActions, renderRoPo, dialogs }
}
