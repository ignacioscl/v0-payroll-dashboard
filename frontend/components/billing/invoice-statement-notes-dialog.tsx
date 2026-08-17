'use client'

import * as React from 'react'
import { Loader2, Plus, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useInvoiceStatementNotes,
  useSaveInvoiceStatementNote,
} from '@/hooks/use-invoice-statement-mutations'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { useToast } from '@/hooks/use-toast'

export function InvoiceStatementNotesDialog({
  open,
  onOpenChange,
  statementId,
  invoiceLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  statementId: number
  invoiceLabel: string
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const notesQuery = useInvoiceStatementNotes(statementId, open)
  const saveNote = useSaveInvoiceStatementNote()

  const statuses = notesQuery.data?.statuses ?? []
  const notes = notesQuery.data?.notes ?? []

  const [statusId, setStatusId] = React.useState<string>('')
  const [text, setText] = React.useState('')

  React.useEffect(() => {
    if (!open) return
    setText('')
    if (statuses.length > 0 && !statusId) {
      setStatusId(String(statuses[0].id))
    }
  }, [open, statuses, statusId])

  const onSave = async () => {
    const idStatus = Number(statusId)
    if (!idStatus || !text.trim()) {
      toast({
        variant: 'destructive',
        title: t('invoices.actionNotesInvalid'),
      })
      return
    }
    try {
      await saveNote.mutateAsync({
        id_invoice_statement: statementId,
        id_status: idStatus,
        note_text: text.trim(),
      })
      setText('')
      toast({ title: t('invoices.actionNotesSuccess') })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('invoices.actionNotesError'),
        description: getSrsErrorMessage(err, t('invoices.actionNotesError')),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('invoices.actionNotesTitle')} — {invoiceLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {notesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : notesQuery.isError ? (
            <p className="text-sm text-destructive">
              {getSrsErrorMessage(notesQuery.error, t('invoices.actionNotesLoadError'))}
            </p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('invoices.actionNotesEmpty')}</p>
          ) : (
            <ul className="space-y-3">
              {notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{n.status.name}</Badge>
                    <span className="text-xs text-muted-foreground">{n.fecha}</span>
                    <span className="text-xs text-muted-foreground">· {n.author.nombre}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{n.noteText}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t border-border pt-3">
            <Label>{t('invoices.actionNotesStatus')}</Label>
            <Select value={statusId} onValueChange={setStatusId}>
              <SelectTrigger>
                <SelectValue placeholder={t('invoices.actionNotesStatus')} />
              </SelectTrigger>
              <SelectContent>
                {statuses.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.displayName || s.defaultName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="inv-note-text">{t('invoices.actionNotesText')}</Label>
            <Textarea
              id="inv-note-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder={t('invoices.actionNotesPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X />
            {t('common.close')}
          </Button>
          <Button type="button" onClick={() => void onSave()} disabled={saveNote.isPending}>
            {saveNote.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t('invoices.actionNotesSave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
