'use client'

import { useState } from 'react'
import { Camera } from 'lucide-react'
import { employeeThumbnailUrl } from '@/lib/face/face-proxy-url'
import { EmployeeThumbnailPickerModal } from '@/components/ttk/employee-thumbnail-picker-modal'
import { cn } from '@/lib/utils'

type EmployeeThumbnailProps = {
  employeeId: number
  employeeName: string
  thumbnailUuid: string | null | undefined
  onSaved: (thumbnailUuid: string) => void
  size?: 'sm' | 'md'
  className?: string
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
}

export function EmployeeThumbnail({
  employeeId,
  employeeName,
  thumbnailUuid,
  onSaved,
  size = 'md',
  className,
}: EmployeeThumbnailProps) {
  const [open, setOpen] = useState(false)
  const src = employeeThumbnailUrl(thumbnailUuid)
  const canEdit = employeeId > 0

  return (
    <>
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => canEdit && setOpen(true)}
        title={canEdit ? 'Edit employee thumbnail' : undefined}
        className={cn(
          'relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          canEdit && 'cursor-pointer',
          !canEdit && 'cursor-default',
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={employeeName}
          className={cn('rounded-full border border-border object-cover bg-muted', sizeClasses[size])}
        />
        {canEdit ? (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground shadow-sm">
            <Camera className="h-2.5 w-2.5" />
          </span>
        ) : null}
      </button>

      {canEdit ? (
        <EmployeeThumbnailPickerModal
          open={open}
          onOpenChange={setOpen}
          employeeId={employeeId}
          employeeName={employeeName}
          onSaved={onSaved}
        />
      ) : null}
    </>
  )
}
