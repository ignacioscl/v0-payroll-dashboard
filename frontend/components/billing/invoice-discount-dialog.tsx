'use client'

import * as React from 'react'
import { Loader2, Save, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSetInvoiceDiscount } from '@/hooks/use-invoice-statement-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useToast } from '@/hooks/use-toast'

type DiscountType = 1 | 2

export function InvoiceDiscountDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: InvoiceRow
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const mutation = useSetInvoiceDiscount()

  const initialType: DiscountType =
    row.discountType === 1 ? 1 : 2
  const [discountType, setDiscountType] = React.useState<DiscountType>(initialType)
  const [value, setValue] = React.useState(
    row.discount != null ? String(row.discount) : '',
  )
  const [detail, setDetail] = React.useState(row.discountDetail ?? '')

  React.useEffect(() => {
    if (!open) return
    setDiscountType(row.discountType === 1 ? 1 : 2)
    setValue(row.discount != null ? String(row.discount) : '')
    setDetail(row.discountDetail ?? '')
  }, [open, row.discount, row.discountDetail, row.discountType])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) {
      toast({
        variant: 'destructive',
        title: t('invoices.actionDiscountInvalid'),
      })
      return
    }
    try {
      await mutation.mutateAsync({
        id_invoice_statement: row.id,
        discountType,
        discount: n,
        discountDetail: detail.trim() || undefined,
      })
      toast({ title: t('invoices.actionDiscountSuccess') })
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('invoices.actionDiscountError'),
        description: getSrsErrorMessage(err, t('invoices.actionDiscountError')),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('invoices.actionDiscountTitle')} — {row.fullNro || `#${row.id}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="discountType"
                checked={discountType === 2}
                onChange={() => setDiscountType(2)}
              />
              {t('invoices.actionDiscountAmount')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="discountType"
                checked={discountType === 1}
                onChange={() => setDiscountType(1)}
              />
              {t('invoices.actionDiscountPercent')}
            </label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-discount-value">
              {discountType === 1
                ? t('invoices.actionDiscountPercent')
                : t('invoices.actionDiscountAmount')}
            </Label>
            <Input
              id="inv-discount-value"
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-discount-detail">{t('invoices.actionDiscountDetail')}</Label>
            <Textarea
              id="inv-discount-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X />
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
