'use client'

import * as React from 'react'
import { Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSingleFlight, useUpdateWorkOrderRoPo } from '@/hooks/use-wo-to-be-billed-mutations'
import { focusFirstFieldError } from '@/lib/forms/use-form-with-focus'
import { useTranslation } from '@/lib/i18n/locale-context'
import { isSrsNestApiError } from '@/lib/srs-nest-client'
import type { WoToBeBilledRow } from '@/lib/srs-wo-to-be-billed-api'
import { woErrorMessage } from './wo-to-be-billed-errors'

/** `INVOICE.ro` / `INVOICE.po` son `varchar(16)` (`DUMP:1323`). */
export const WO_RO_PO_MAX_LENGTH = 16

/**
 * RO# / PO# de una WO (plans/plan-wo-to-be-billed-v0, T10), sobre el mismo armado que `InvoicePoRoDialog`: un campo
 * (el que eligió el lápiz, sin el combo PO / RO), tope de 16 y el error —también el del servidor, p. ej. «RO# is
 * required for this work order»— **debajo del campo y con el foco en él**, nunca en un toast.
 */
export function WoPoRoDialog({
  open,
  onOpenChange,
  row,
  field,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: WoToBeBilledRow
  field: 'ro' | 'po'
}) {
  const { t } = useTranslation()
  const mutation = useUpdateWorkOrderRoPo()
  const once = useSingleFlight()
  const initial = (field === 'ro' ? row.ro : row.po) ?? ''
  const [value, setValue] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const pending = mutation.isPending

  const showError = (message: string) => {
    setError(message)
    // El campo ya está en pantalla: se le lleva el foco en el próximo cuadro, con el mensaje dibujado.
    window.requestAnimationFrame(() => focusFirstFieldError({ value: message }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim().length > WO_RO_PO_MAX_LENGTH) {
      showError(t('invoices.exportXlsMaxChars', { n: WO_RO_PO_MAX_LENGTH }))
      return
    }
    setError(null)
    await once(async () => {
      try {
        await mutation.mutateAsync({ idInvoice: row.id, field, value: value.trim() })
        toast.success(t('woToBeBilled.roPo.saved'))
        onOpenChange(false)
      } catch (err) {
        const fieldMessage = isSrsNestApiError(err) ? err.validationErrors.find((v) => v.field === 'value')?.message : undefined
        showError(fieldMessage ?? woErrorMessage(err, t))
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return
        onOpenChange(next)
      }}
    >
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {field === 'ro' ? t('woToBeBilled.roPo.titleRo') : t('woToBeBilled.roPo.titlePo')} — WO# {row.fullNro}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="wo-ro-po-value">
              {field === 'ro' ? t('woToBeBilled.roPo.labelRo') : t('woToBeBilled.roPo.labelPo')}
            </Label>
            <Input
              id="wo-ro-po-value"
              name="value"
              value={value}
              maxLength={WO_RO_PO_MAX_LENGTH + 4}
              aria-invalid={error ? true : undefined}
              aria-describedby="wo-ro-po-value-message"
              onChange={(e) => {
                setValue(e.target.value)
                setError(null)
              }}
              autoFocus
            />
            <FieldMessage id="wo-ro-po-value-message" message={error} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              <X />
              {t('woToBeBilled.roPo.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('woToBeBilled.roPo.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
