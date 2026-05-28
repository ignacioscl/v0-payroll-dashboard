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

function PunchFacePhotoSlot({ label, validationId }: PhotoSlot) {
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
        <p className="text-sm text-muted-foreground">Without image</p>
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
        <p className="text-sm text-muted-foreground">Without image</p>
      ) : null}
      <img
        src={facePunchImageUrl(validationId)}
        alt={`${label} face recognition`}
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
  const titleName = employeeName?.trim() || 'Employee'
  const datePart = punchDateLabel?.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Images className="size-5 shrink-0 text-sky-600" />
            <span className="leading-snug">
              {titleName}
              <span className="font-normal text-muted-foreground"> (Face recognition)</span>
            </span>
          </DialogTitle>
          {datePart ? (
            <DialogDescription>Punch date: {datePart}</DialogDescription>
          ) : (
            <DialogDescription>Face recognition photos for this punch</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-6 py-1">
          <PunchFacePhotoSlot label="Punch in" validationId={validation?.punchIn} />
          <PunchFacePhotoSlot label="Break in" validationId={validation?.breakStart} />
          <PunchFacePhotoSlot label="Break out" validationId={validation?.breakEnd} />
          <PunchFacePhotoSlot label="Punch out" validationId={validation?.punchOut} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
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
