'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { FilePlus2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { BillingActionDialog } from '@/components/billing/billing-action-dialog'
import type { WoFilterRequest } from '@/hooks/use-wo-to-be-billed'
import { useGenerateWoInvoices, useSingleFlight } from '@/hooks/use-wo-to-be-billed-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import { previewWoInvoices, type GenerateWoInvoicesResponse } from '@/lib/srs-wo-to-be-billed-api'
import { woErrorMessage } from './wo-to-be-billed-errors'

/** El texto del diálogo (§6), con sus singulares aprobados. */
export function woGenerateText(
  workOrders: number,
  invoices: number,
  t: (key: 'woToBeBilled.generate.text' | 'woToBeBilled.generate.textOneOne' | 'woToBeBilled.generate.textManyOne', params?: Record<string, number>) => string,
): string {
  if (workOrders === 1 && invoices === 1) return t('woToBeBilled.generate.textOneOne')
  if (invoices === 1) return t('woToBeBilled.generate.textManyOne', { n: workOrders })
  return t('woToBeBilled.generate.text', { n: workOrders, m: invoices })
}

/**
 * Generate Invoice (plans/plan-wo-to-be-billed-v0, T10): al abrir pide la cuenta previa (`/preview`, la misma cuenta
 * que después genera) y dice cuántas WO entran y cuántas invoices se crean. Confirmar → `/generate`, un solo pedido por
 * clic; el diálogo no se cierra mientras procesa. El aviso final lo da la pantalla con las cantidades que devolvió el
 * servidor.
 */
export function WoGenerateInvoiceDialog({
  open,
  onOpenChange,
  request,
  woIds,
  summary,
  onGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  request: WoFilterRequest | null
  woIds: number[]
  /** Invoice Type, dealer y fechas, para que el diálogo los muestre (no los vuelve a preguntar). */
  summary: Array<{ label: string; value: string }>
  onGenerated: (res: GenerateWoInvoicesResponse) => void
}) {
  const { t } = useTranslation()
  const generate = useGenerateWoInvoices()
  const once = useSingleFlight()
  const preview = useQuery({
    queryKey: ['srs-wo-to-be-billed-preview', request, woIds],
    queryFn: () => previewWoInvoices(request as WoFilterRequest, woIds),
    enabled: open && request !== null,
    staleTime: 0,
    gcTime: 0,
  })
  const nothing = preview.data != null && preview.data.invoices === 0

  const onConfirm = () =>
    once(async () => {
      if (!request) return
      try {
        const res = await generate.mutateAsync({ request, woIds })
        onGenerated(res)
        onOpenChange(false)
      } catch (err) {
        toast.error(woErrorMessage(err, t))
        onOpenChange(false)
      }
    })

  return (
    <BillingActionDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="sky"
      icon={FilePlus2}
      title={t('woToBeBilled.generate.title')}
      cancelLabel={t('woToBeBilled.generate.cancel')}
      confirmLabel={t('woToBeBilled.generate.confirm')}
      confirmIcon={FilePlus2}
      onConfirm={onConfirm}
      pending={generate.isPending}
      pendingLabel={t('woToBeBilled.generate.processing')}
      confirmDisabled={!preview.data || nothing}
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {summary.map((s) => (
          <React.Fragment key={s.label}>
            <dt className="text-muted-foreground">{s.label}</dt>
            <dd className="min-w-0 font-medium">{s.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-sm font-semibold" data-testid="wo-generate-count">
        {preview.isFetching && !preview.data ? (
          <span className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('woToBeBilled.generate.counting')}
          </span>
        ) : preview.isError ? (
          <span className="font-normal text-destructive">{woErrorMessage(preview.error, t)}</span>
        ) : nothing ? (
          t('woToBeBilled.generate.nothing')
        ) : preview.data ? (
          woGenerateText(preview.data.workOrders, preview.data.invoices, t)
        ) : null}
      </p>
      <p className="text-xs text-muted-foreground">{t('woToBeBilled.generate.help')}</p>
    </BillingActionDialog>
  )
}
