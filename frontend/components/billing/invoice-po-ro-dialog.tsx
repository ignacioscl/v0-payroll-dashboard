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
import { FieldMessage } from '@/components/ui/form'
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
import { focusFirstFieldError } from '@/lib/forms/use-form-with-focus'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { InvoiceRow } from '@/lib/srs-invoices-api'
import { useToast } from '@/hooks/use-toast'

/** `INVOICE_STATEMENT.po` y `.ro` son `varchar(16)` (public/sql/db-structure/srssui5_srs.sql). Vacío = se borra. */
export const INVOICE_PO_RO_MAX_LENGTH = 16

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
  const [valueError, setValueError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setField(initialField)
    setValue(initialField === 'PO' ? (row.po ?? '') : (row.ro ?? ''))
    setValueError(null)
  }, [open, initialField, row.po, row.ro])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (value.trim().length > INVOICE_PO_RO_MAX_LENGTH) {
      const message = t('invoices.exportXlsMaxChars', { n: INVOICE_PO_RO_MAX_LENGTH })
      setValueError(message)
      focusFirstFieldError({ poRo: message })
      return
    }
    setValueError(null)
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
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('invoices.actionPoRoTitle')} — {row.fullNro || `#${row.id}`}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label>{t('invoices.actionPoRoField')}</Label>
            <Select
              value={field}
              onValueChange={(v) => {
                setField(v as 'PO' | 'RO')
                setValueError(null)
              }}
            >
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
              name="poRo"
              value={value}
              aria-invalid={valueError ? true : undefined}
              aria-describedby="inv-po-ro-value-message"
              onChange={(e) => {
                setValue(e.target.value)
                setValueError(null)
              }}
              autoFocus
            />
            <FieldMessage id="inv-po-ro-value-message" message={valueError} />
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
