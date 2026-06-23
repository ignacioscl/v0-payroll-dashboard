'use client'

import { useEffect, useMemo, useState } from 'react'
import { DollarSign, Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { useTtkPaymentTypes } from '@/hooks/use-ttk-payment-types'
import { useTtkSavePayment } from '@/hooks/use-ttk-save-payment'
import type { TtkPaymentTypeOption } from '@/lib/ttk/ttk-payment-types'
import { useTranslation } from '@/lib/i18n/locale-context'

export type EditPaymentTypeTarget = {
  id: number | string
  employeeName: string
  punchDateLabel: string
  idEmployee: number
  idDealer: number
  paymentTypeId?: number | null
  paymentTypeName?: string | null
  hourlyRate?: number | null
}

interface EditPaymentTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: EditPaymentTypeTarget | null
  onSaved?: () => void
}

function buildOptions(
  fetched: TtkPaymentTypeOption[],
  currentId?: number | null,
  currentName?: string | null,
  unknownOverdueLabel = 'Unknown (overdue)',
): TtkPaymentTypeOption[] {
  if (!currentId || currentId <= 0) return fetched
  if (fetched.some((item) => item.id === currentId)) return fetched
  return [
    ...fetched,
    {
      id: currentId,
      paymentTypeName: currentName ?? unknownOverdueLabel,
      price: null,
      isDefault: 0,
    },
  ]
}

export function EditPaymentTypeDialog({
  open,
  onOpenChange,
  target,
  onSaved,
}: EditPaymentTypeDialogProps) {
  const { t } = useTranslation()
  const [paymentTypeId, setPaymentTypeId] = useState<string>('')
  const [hourlyRate, setHourlyRate] = useState<string>('0')
  const [note, setNote] = useState('')

  const paymentTypesQuery = useTtkPaymentTypes(
    target?.idDealer,
    target?.idEmployee,
    target?.id,
    open,
  )
  const saveMutation = useTtkSavePayment()

  const options = useMemo(
    () =>
      buildOptions(
        paymentTypesQuery.data ?? [],
        target?.paymentTypeId,
        target?.paymentTypeName,
        t('punch.unknownOverdue'),
      ),
    [paymentTypesQuery.data, target?.paymentTypeId, target?.paymentTypeName, t],
  )

  useEffect(() => {
    if (!open || !target) return
    const initialId = target.paymentTypeId && target.paymentTypeId > 0
      ? String(target.paymentTypeId)
      : ''
    setPaymentTypeId(initialId)
    setHourlyRate(
      target.hourlyRate != null && !Number.isNaN(Number(target.hourlyRate))
        ? String(target.hourlyRate)
        : '0',
    )
    setNote('')
  }, [open, target])

  const handlePaymentTypeChange = (value: string) => {
    setPaymentTypeId(value)
    const selected = options.find((item) => String(item.id) === value)
    if (selected?.price != null && !Number.isNaN(Number(selected.price))) {
      setHourlyRate(String(selected.price))
    }
  }

  const handleSave = async () => {
    if (!target) return
    const typeId = Number(paymentTypeId)
    if (!typeId || typeId <= 0) {
      toast.error(t('punch.selectPaymentType'))
      return
    }

    try {
      await saveMutation.mutateAsync({
        id_ttk: Number(target.id),
        payment_type: typeId,
        hourly_rate: Number(hourlyRate) || 0,
        note: note.trim() || null,
      })
      toast.success(t('punch.paymentTypeUpdated'))
      onOpenChange(false)
      onSaved?.()
    } catch (error) {
      toast.error(getSrsErrorMessage(error, t('punch.paymentTypeUpdateFailed')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            {t('punch.editPaymentType')}
          </DialogTitle>
          <DialogDescription>
            {target?.employeeName ?? t('common.employee')}
            {target?.punchDateLabel ? ` · ${target.punchDateLabel}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="payment-type-select">{t('punch.paymentType')}</Label>
            {paymentTypesQuery.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : paymentTypesQuery.isError ? (
              <p className="text-sm text-destructive">
                {getSrsErrorMessage(paymentTypesQuery.error, t('punch.loadPaymentTypesFailed'))}
              </p>
            ) : (
              <Select value={paymentTypeId} onValueChange={handlePaymentTypeChange}>
                <SelectTrigger id="payment-type-select" className="w-full">
                  <SelectValue placeholder={t('punch.selectPaymentType')} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.paymentTypeName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment-note">{t('common.note')}</Label>
            <Textarea
              id="payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('punch.optionalNote')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            <X className="mr-1.5 h-4 w-4" />
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveMutation.isPending || paymentTypesQuery.isLoading}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
