'use client'

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, FileText, Loader2, Paperclip, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { invalidateExpenses } from '@/hooks/use-expenses-list'
import {
  ATTACHMENT_MAX_BYTES,
  attachmentFileUrl,
  attachmentKind,
  listAttachments,
  uploadAttachment,
  withUploadedFile,
} from '@/lib/expense-attachments'
import { useTranslation } from '@/lib/i18n/locale-context'

export const attachmentsQueryKey = (idDealer: number, idExpense: number) =>
  ['expense-attachments', idDealer, idExpense] as const

export function useExpenseAttachments(location: { idDealer: number; idExpense: number } | null, enabled = true) {
  return useQuery<string[]>({
    queryKey: attachmentsQueryKey(location?.idDealer ?? 0, location?.idExpense ?? 0),
    queryFn: () => listAttachments(location!.idDealer, location!.idExpense),
    enabled: enabled && location !== null,
  })
}

function isImageName(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name) || !/\.pdf$/i.test(name)
}

/**
 * «Attachment» de una fila: lista lo que hay en el bucket (imagen → visor, PDF → abrir/descargar) y
 * deja subir otro (es el «try again from its row» de T4 cuando la subida falló al crear).
 */
export function ExpenseAttachmentDialog({
  open,
  onOpenChange,
  location,
  title,
  canUpload = true,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  location: { idDealer: number; idExpense: number } | null
  title: string
  canUpload?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useExpenseAttachments(location, open)
  const [uploading, setUploading] = React.useState(false)
  const [preview, setPreview] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const files = query.data ?? []

  React.useEffect(() => {
    if (!open) setPreview(null)
  }, [open])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !location) return
    if (!attachmentKind(file)) {
      toast.error(t('expenses.fileType'))
      return
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast.error(t('expenses.fileTooBig'))
      return
    }
    setUploading(true)
    try {
      const { filename, logged } = await uploadAttachment(location.idDealer, location.idExpense, file)
      toast.success(t('expenses.uploaded'))
      // Subió pero el log no se pudo dejar: se avisa, no bloquea.
      if (!logged) toast.error(t('expenses.attachmentLogFailed'))
      const key = attachmentsQueryKey(location.idDealer, location.idExpense)
      if (filename) queryClient.setQueryData<string[]>(key, (files) => withUploadedFile(files, filename))
      else await queryClient.invalidateQueries({ queryKey: key })
      invalidateExpenses(queryClient)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('expenses.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="size-4" aria-hidden />
            {t('expenses.attachment')}
          </DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          {query.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('common.loading')}
            </p>
          ) : query.error ? (
            <p className="text-sm text-destructive" role="alert">
              {query.error.message}
            </p>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('expenses.noAttachment')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {files.map((name) => {
                const url = location ? attachmentFileUrl(location.idDealer, location.idExpense, name) : '#'
                const image = isImageName(name)
                return (
                  <li key={name} className="flex min-w-0 flex-wrap items-center gap-2 px-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 break-all text-sm">{name}</span>
                    {image ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => setPreview(preview === url ? null : url)}
                      >
                        <ExternalLink className="size-3" />
                        {t('expenses.open')}
                      </Button>
                    ) : (
                      <Button asChild type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-3" />
                          {t('expenses.open')}
                        </a>
                      </Button>
                    )}
                    <Button asChild type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                      <a href={url} download={name}>
                        <Download className="size-3" />
                        {t('expenses.download')}
                      </a>
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="max-h-[50vh] w-full rounded-md border border-border object-contain" />
          ) : null}

          {canUpload && location ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => void onPick(e)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {uploading ? t('expenses.uploading') : t('expenses.upload')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('expenses.attachmentHint')}</span>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
