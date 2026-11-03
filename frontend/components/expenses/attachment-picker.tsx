'use client'

import * as React from 'react'
import { FileText, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ATTACHMENT_MAX_BYTES, attachmentKind } from '@/lib/expense-attachments'
import { useTranslation } from '@/lib/i18n/locale-context'

/** Dropzone de Add Expense: imagen o PDF, uno o más, con vista previa; se suben después del POST (T4). */
export function AttachmentPicker({
  files,
  onChange,
  disabled,
}: {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    const next: Record<string, string> = {}
    for (const f of files) {
      if (attachmentKind(f) === 'image') next[`${f.name}-${f.size}`] = URL.createObjectURL(f)
    }
    setPreviews(next)
    return () => {
      for (const url of Object.values(next)) URL.revokeObjectURL(url)
    }
  }, [files])

  const add = (list: FileList | null) => {
    if (!list) return
    const accepted: File[] = []
    for (const f of Array.from(list)) {
      if (!attachmentKind(f)) {
        toast.error(t('expenses.fileType'))
        continue
      }
      if (f.size > ATTACHMENT_MAX_BYTES) {
        toast.error(t('expenses.fileTooBig'))
        continue
      }
      accepted.push(f)
    }
    if (accepted.length) onChange([...files, ...accepted])
  }

  return (
    <div className="min-w-0 space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!disabled) add(e.dataTransfer.files)
        }}
        className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground hover:bg-muted/40 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        <Paperclip className="size-4" />
        <span>{t('expenses.attachmentHint')}</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          add(e.target.files)
          e.target.value = ''
        }}
      />
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => {
            const key = `${f.name}-${f.size}`
            const preview = previews[key]
            return (
              <li key={`${key}-${i}`} className="flex min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="size-8 rounded object-cover" />
                ) : (
                  <FileText className="size-4 text-muted-foreground" />
                )}
                <span className="max-w-[12rem] truncate">{f.name}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-6"
                  disabled={disabled}
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                >
                  <X className="size-3" />
                  <span className="sr-only">{t('common.clear')}</span>
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
