'use client'

import * as React from 'react'
import { Images, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { facePunchImageUrl } from '@/lib/face/face-proxy-url'
import { useTranslation } from '@/lib/i18n/locale-context'

export type PunchFacePhotoValidation = {
  punchIn?: number | null
  breakStart?: number | null
  breakEnd?: number | null
  punchOut?: number | null
}

type PhotoSlot = {
  label: string
  validationId?: number | null
}

function PunchFacePhotoSlot({
  label,
  validationId,
  withoutImageLabel,
}: PhotoSlot & { withoutImageLabel: string }) {
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error'>(
    validationId ? 'loading' : 'error',
  )

  React.useEffect(() => {
    setStatus(validationId ? 'loading' : 'error')
  }, [validationId])

  if (!validationId) {
    return (
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <p className="text-sm text-muted-foreground">{withoutImageLabel}</p>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      {status === 'loading' ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {status === 'error' ? (
        <p className="text-sm text-muted-foreground">{withoutImageLabel}</p>
      ) : null}
      <img
        src={facePunchImageUrl(validationId)}
        alt={label}
        className={
          status === 'loaded'
            ? 'max-h-72 max-w-full rounded-lg border border-border object-contain'
            : 'hidden'
        }
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </section>
  )
}

type PunchFacePhotosDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeName?: string
  punchDateLabel?: string
  validation: PunchFacePhotoValidation | null
}

export function PunchFacePhotosDialog({
  open,
  onOpenChange,
  employeeName,
  punchDateLabel,
  validation,
}: PunchFacePhotosDialogProps) {
  const { t } = useTranslation()
  const titleName = employeeName?.trim() || t('common.employee')
  const datePart = punchDateLabel?.trim()
  const withoutImageLabel = t('punch.withoutImage')

  const slots = [
    { label: t('punch.slotPunchIn'), validationId: validation?.punchIn },
    { label: t('punch.slotBreakIn'), validationId: validation?.breakStart },
    { label: t('punch.slotBreakOut'), validationId: validation?.breakEnd },
    { label: t('punch.slotPunchOut'), validationId: validation?.punchOut },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Images className="size-5 shrink-0 text-accent" />
            <span className="leading-snug">
              {titleName}
              <span className="font-normal text-muted-foreground"> {t('punch.faceRecognition')}</span>
            </span>
          </DialogTitle>
          {datePart ? (
            <DialogDescription>{t('punch.punchDate')} {datePart}</DialogDescription>
          ) : (
            <DialogDescription>{t('punch.facePhotos')}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-6 py-1">
          {slots.map((slot) => (
            <PunchFacePhotoSlot
              key={slot.label}
              label={slot.label}
              validationId={slot.validationId}
              withoutImageLabel={withoutImageLabel}
            />
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function buildPunchFacePhotoValidation(row: {
  idPunchInLogValidation?: number | null
  idBreakStartLogValidation?: number | null
  idBreakEndLogValidation?: number | null
  idPunchOutLogValidation?: number | null
}): PunchFacePhotoValidation {
  return {
    punchIn: row.idPunchInLogValidation ?? null,
    breakStart: row.idBreakStartLogValidation ?? null,
    breakEnd: row.idBreakEndLogValidation ?? null,
    punchOut: row.idPunchOutLogValidation ?? null,
  }
}
