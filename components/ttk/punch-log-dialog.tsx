'use client'

import { Download, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useTtkPunchLog } from '@/hooks/use-ttk-punch-log'
import type { TtkPunchLogEntry } from '@/lib/ttk/ttk-log-types'
import { ttkLogEvidenceUrl } from '@/lib/ttk/ttk-log-evidence-url'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canViewPaymentType } from '@/lib/auth/ttk-permissions'

function formatLogDateTime(gmt0?: string | null): string {
  if (!gmt0) return ''
  const d = new Date(gmt0)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function formatLogDate(dateUpdate?: string | null): string {
  if (!dateUpdate) return '—'
  const d = new Date(dateUpdate.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return dateUpdate
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function statusMessage(updateStatusTo: number | null | undefined): string | null {
  if (updateStatusTo === 0) return 'Deleted punch'
  if (updateStatusTo === 1) return 'Activated punch'
  if (updateStatusTo === 2) return 'Manually created punch'
  return null
}

function timesEqual(a?: string | null, b?: string | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return new Date(a).getTime() === new Date(b).getTime()
}

function LogTimeCell({
  label,
  newGmt0,
  oldGmt0,
  note,
}: {
  label: string
  newGmt0?: string | null
  oldGmt0?: string | null
  note?: string | null
}) {
  if (!newGmt0 && !oldGmt0) {
    return <span className="text-muted-foreground">—</span>
  }

  const changed = oldGmt0 != null && !timesEqual(newGmt0, oldGmt0)
  const deleted = !newGmt0 && oldGmt0
  const added = newGmt0 && !oldGmt0

  return (
    <div className="space-y-0.5 text-xs">
      {deleted ? (
        <>
          <div>
            <span className="font-medium text-destructive">New:</span> Deleted
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Old:</span>{' '}
            {formatLogDateTime(oldGmt0)}
          </div>
        </>
      ) : added ? (
        <>
          <div>
            <span className="font-medium text-muted-foreground">New:</span>{' '}
            {formatLogDateTime(newGmt0)}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Old:</span> Not set
          </div>
        </>
      ) : changed ? (
        <>
          <div>
            <span className="font-medium text-muted-foreground">New:</span>{' '}
            {formatLogDateTime(newGmt0)}
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Old:</span>{' '}
            {formatLogDateTime(oldGmt0)}
          </div>
        </>
      ) : (
        <div>
          {formatLogDateTime(newGmt0 ?? oldGmt0)}
          <span className="text-muted-foreground"> (Not modified)</span>
        </div>
      )}
      {note ? (
        <div className="text-muted-foreground">
          <span className="font-medium">Note:</span> {note}
        </div>
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  )
}

function hasPaymentTypeChange(entry: TtkPunchLogEntry): boolean {
  const oldName = entry.paymentTypeOld?.name?.trim() ?? ''
  const newName = entry.paymentType?.name?.trim() ?? ''
  if (oldName === '' && newName === '') return false
  return oldName !== newName
}

function hasHourlyRateChange(entry: TtkPunchLogEntry): boolean {
  if (entry.hourlyRateOld == null && entry.hourlyRate == null) return false
  return String(entry.hourlyRateOld ?? '') !== String(entry.hourlyRate ?? '')
}

function hasTimeFieldChanges(entry: TtkPunchLogEntry): boolean {
  return (
    !timesEqual(entry.punchInGmt0, entry.punchInOldGmt0) ||
    !timesEqual(entry.breakStartGmt0, entry.breakStartOldGmt0) ||
    !timesEqual(entry.breakEndGmt0, entry.breakEndOldGmt0) ||
    !timesEqual(entry.punchOutGmt0, entry.punchOutOldGmt0)
  )
}

function PaymentDetailsRestrictedMessage() {
  return (
    <p className="text-xs italic text-muted-foreground">
      Payment details hidden — insufficient permissions
    </p>
  )
}

function PaymentChangeCell({ entry }: { entry: TtkPunchLogEntry }) {
  const paymentChanged = hasPaymentTypeChange(entry)
  const hourlyChanged = hasHourlyRateChange(entry)

  if (!paymentChanged && !hourlyChanged && !entry.note) {
    return null
  }

  return (
    <div className="space-y-1 text-xs">
      {paymentChanged ? (
        <div>
          <span className="font-medium">Payment type:</span>{' '}
          <span className="text-muted-foreground">New:</span>{' '}
          {entry.paymentType?.name ?? '—'}
          {' · '}
          <span className="text-muted-foreground">Old:</span>{' '}
          {entry.paymentTypeOld?.name ?? '—'}
        </div>
      ) : null}
      {hourlyChanged ? (
        <div>
          <span className="font-medium">Hourly rate:</span>{' '}
          <span className="text-muted-foreground">New:</span> {entry.hourlyRate ?? '—'}
          {' · '}
          <span className="text-muted-foreground">Old:</span> {entry.hourlyRateOld ?? '—'}
        </div>
      ) : null}
      {entry.note ? (
        <div>
          <span className="font-medium">Note:</span> {entry.note}
        </div>
      ) : null}
    </div>
  )
}

function LogRow({
  entry,
  canViewPayment,
}: {
  entry: TtkPunchLogEntry
  canViewPayment: boolean
}) {
  const status = statusMessage(entry.updateStatusTo ?? null)
  const evidence =
    entry.fileLog && entry.fileLog.trim() !== '' ? (
      <Button variant="outline" size="icon" className="h-7 w-7" asChild>
        <a
          href={ttkLogEvidenceUrl(entry.fileLog)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download evidence"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </Button>
    ) : (
      '—'
    )

  if (status) {
    return (
      <TableRow>
        <TableCell className="whitespace-nowrap text-xs">{formatLogDate(entry.dateUpdate)}</TableCell>
        <TableCell className="text-xs">{entry.usuario?.nombre ?? '—'}</TableCell>
        <TableCell colSpan={4} className="text-xs">
          {status}
        </TableCell>
        <TableCell className="text-center">{evidence}</TableCell>
      </TableRow>
    )
  }

  const paymentRestricted = entry.paymentDetailsRestricted === true
  const paymentChanged = hasPaymentTypeChange(entry)
  const hourlyChanged = hasHourlyRateChange(entry)
  const timeChanged = hasTimeFieldChanges(entry)
  const showPaymentDetails = canViewPayment && (paymentChanged || hourlyChanged)

  if ((paymentChanged || hourlyChanged || paymentRestricted) && !timeChanged) {
    return (
      <TableRow>
        <TableCell className="whitespace-nowrap text-xs">{formatLogDate(entry.dateUpdate)}</TableCell>
        <TableCell className="text-xs">{entry.usuario?.nombre ?? '—'}</TableCell>
        <TableCell colSpan={4} className="align-top text-xs">
          {showPaymentDetails ? (
            <PaymentChangeCell entry={entry} />
          ) : paymentRestricted ? (
            <PaymentDetailsRestrictedMessage />
          ) : null}
        </TableCell>
        <TableCell className="text-center">{evidence}</TableCell>
      </TableRow>
    )
  }

  if (entry.note && !timeChanged && !paymentChanged && !hourlyChanged && !paymentRestricted) {
    return (
      <TableRow>
        <TableCell className="whitespace-nowrap text-xs">{formatLogDate(entry.dateUpdate)}</TableCell>
        <TableCell className="text-xs">{entry.usuario?.nombre ?? '—'}</TableCell>
        <TableCell colSpan={4} className="text-xs">
          <span className="font-medium">Note:</span> {entry.note}
        </TableCell>
        <TableCell className="text-center">{evidence}</TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs">{formatLogDate(entry.dateUpdate)}</TableCell>
      <TableCell className="text-xs">{entry.usuario?.nombre ?? '—'}</TableCell>
      {(paymentChanged || hourlyChanged || paymentRestricted) && timeChanged ? (
        <>
          <TableCell colSpan={4} className="align-top text-xs">
            <div className="space-y-2">
              {showPaymentDetails ? <PaymentChangeCell entry={entry} /> : null}
              {paymentRestricted ? <PaymentDetailsRestrictedMessage /> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <LogTimeCell
                  label="Punch in"
                  newGmt0={entry.punchInGmt0}
                  oldGmt0={entry.punchInOldGmt0}
                  note={entry.punchInNote}
                />
                <LogTimeCell
                  label="Break start"
                  newGmt0={entry.breakStartGmt0}
                  oldGmt0={entry.breakStartOldGmt0}
                  note={entry.breakStartNote}
                />
                <LogTimeCell
                  label="Break end"
                  newGmt0={entry.breakEndGmt0}
                  oldGmt0={entry.breakEndOldGmt0}
                  note={entry.breakEndNote}
                />
                <LogTimeCell
                  label="Punch out"
                  newGmt0={entry.punchOutGmt0}
                  oldGmt0={entry.punchOutOldGmt0}
                  note={entry.punchOutNote}
                />
              </div>
            </div>
          </TableCell>
        </>
      ) : (
        <>
          <TableCell className="align-top text-xs">
            <LogTimeCell
              label="Punch in"
              newGmt0={entry.punchInGmt0}
              oldGmt0={entry.punchInOldGmt0}
              note={entry.punchInNote}
            />
          </TableCell>
          <TableCell className="align-top text-xs">
            <LogTimeCell
              label="Break start"
              newGmt0={entry.breakStartGmt0}
              oldGmt0={entry.breakStartOldGmt0}
              note={entry.breakStartNote}
            />
          </TableCell>
          <TableCell className="align-top text-xs">
            <LogTimeCell
              label="Break end"
              newGmt0={entry.breakEndGmt0}
              oldGmt0={entry.breakEndOldGmt0}
              note={entry.breakEndNote}
            />
          </TableCell>
          <TableCell className="align-top text-xs">
            <LogTimeCell
              label="Punch out"
              newGmt0={entry.punchOutGmt0}
              oldGmt0={entry.punchOutOldGmt0}
              note={entry.punchOutNote}
            />
          </TableCell>
        </>
      )}
      <TableCell className="text-center">{evidence}</TableCell>
    </TableRow>
  )
}

export interface PunchLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  punchId: number | string | null
  employeeName?: string
  punchDateLabel?: string
}

export function PunchLogDialog({
  open,
  onOpenChange,
  punchId,
  employeeName,
  punchDateLabel,
}: PunchLogDialogProps) {
  const { user, hasPermission } = useSrsMe()
  const canViewPayment = canViewPaymentType(hasPermission, user?.isSystemAdmin)

  const { data: entries = [], isLoading, isError, error } = useTtkPunchLog(
    punchId,
    open,
  )

  const title =
    employeeName && punchDateLabel
      ? `${employeeName} — ${punchDateLabel}`
      : employeeName ?? 'Punch change log'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-[min(96vw,90rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,90rem)]">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">View change log</DialogTitle>
          <DialogDescription className="text-xs">{title}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load change log'}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No change log entries.</p>
          ) : (
            <Table className="min-w-[56rem]">
              <TableHeader>
                <TableRow className="bg-primary hover:bg-primary">
                  <TableHead className="h-8 min-w-[9rem] whitespace-nowrap text-xs font-semibold text-primary-foreground">
                    Change date
                  </TableHead>
                  <TableHead className="h-8 min-w-[7rem] text-xs font-semibold text-primary-foreground">
                    User
                  </TableHead>
                  <TableHead className="h-8 min-w-[11rem] text-xs font-semibold text-primary-foreground">
                    Punch in
                  </TableHead>
                  <TableHead className="h-8 min-w-[11rem] text-xs font-semibold text-primary-foreground">
                    Break in
                  </TableHead>
                  <TableHead className="h-8 min-w-[11rem] text-xs font-semibold text-primary-foreground">
                    Break out
                  </TableHead>
                  <TableHead className="h-8 min-w-[11rem] text-xs font-semibold text-primary-foreground">
                    Punch out
                  </TableHead>
                  <TableHead className="h-8 w-[4.5rem] text-center text-xs font-semibold text-primary-foreground">
                    Evidence
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, i) => (
                  <LogRow
                    key={String(entry.id ?? i)}
                    entry={entry}
                    canViewPayment={canViewPayment}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
