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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEditInvoicePoRo } from '@/hooks/use-invoice-statement-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useToast } from '@/hooks/use-toast'

export function InvoicePoRoDialog({
  open,
  onOpenChange,
  row,
  initialField = 'PO',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: InvoiceRow
  initialField?: 'PO' | 'RO'
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const mutation = useEditInvoicePoRo()
  const [field, setField] = React.useState<'PO' | 'RO'>(initialField)
  const [value, setValue] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setField(initialField)
    setValue(initialField === 'PO' ? (row.po ?? '') : (row.ro ?? ''))
  }, [open, initialField, row.po, row.ro])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await mutation.mutateAsync({
        id_invoice_statement: row.id,
        field,
        value: value.trim(),
      })
      toast({ title: t('invoices.actionPoRoSuccess') })
      onOpenChange(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('invoices.actionPoRoError'),
        description: getSrsErrorMessage(err, t('invoices.actionPoRoError')),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('invoices.actionPoRoTitle')} — {row.fullNro || `#${row.id}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('invoices.actionPoRoField')}</Label>
            <Select value={field} onValueChange={(v) => setField(v as 'PO' | 'RO')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PO">{t('invoices.colPo')}</SelectItem>
                <SelectItem value="RO">{t('invoices.colRo')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-po-ro-value">
              {field === 'PO' ? t('invoices.colPo') : t('invoices.colRo')}
            </Label>
            <Input
              id="inv-po-ro-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
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
