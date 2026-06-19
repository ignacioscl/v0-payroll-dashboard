'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { employeePunchPreviewUrl } from '@/lib/face/face-proxy-url'
import type { EmployeePunchPhotoItem } from '@/lib/face/face-api-types'
import type { FaceApiResponse, EmployeePunchPhotosData } from '@/lib/face/face-api-types'
import { faceProxyUrl } from '@/lib/face/face-proxy-url'
import { useSetEmployeeThumbnail } from '@/hooks/use-set-employee-thumbnail'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

type EmployeeThumbnailPickerModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: number
  employeeName: string
  onSaved: (thumbnailUuid: string) => void
}

const MAX_PUNCH_PHOTOS = 10

function sortPunchPhotosNewestFirst(items: EmployeePunchPhotoItem[]): EmployeePunchPhotoItem[] {
  return [...items]
    .sort((a, b) => {
      const dateA = a.createDate ? new Date(a.createDate).getTime() : 0
      const dateB = b.createDate ? new Date(b.createDate).getTime() : 0
      if (dateB !== dateA) {
        return dateB - dateA
      }
      return b.logId - a.logId
    })
    .slice(0, MAX_PUNCH_PHOTOS)
}

async function fetchPunchPhotos(employeeId: number): Promise<EmployeePunchPhotoItem[]> {
  const res = await fetch(faceProxyUrl(`api/employeePunchPhotos/${employeeId}`), {
    credentials: 'include',
  })
  const json = (await res.json()) as FaceApiResponse<EmployeePunchPhotosData>
  if (!res.ok || json.status === 'fail' || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to load punch photos')
  }
  return sortPunchPhotosNewestFirst(json.data.items ?? [])
}

function PunchPreviewTile({
  item,
  saving,
  onSelect,
  dateLabel,
}: {
  item: EmployeePunchPhotoItem
  saving: boolean
  onSelect: () => void
  dateLabel: string
}) {
  return (
    <button
      type="button"
      disabled={saving}
      onClick={onSelect}
      className={cn(
        'group relative block w-full overflow-hidden rounded-md border border-border bg-muted/30 text-left transition hover:border-primary hover:ring-2 hover:ring-primary/30',
        saving && 'pointer-events-none opacity-60',
      )}
    >
      <div className="relative aspect-square w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={employeePunchPreviewUrl(item.logId)}
          alt={dateLabel}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-[10px] text-white">
        {dateLabel}
      </div>
    </button>
  )
}

export function EmployeeThumbnailPickerModal({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  onSaved,
}: EmployeeThumbnailPickerModalProps) {
  const { t } = useTranslation()
  const setThumbnail = useSetEmployeeThumbnail()

  const photosQuery = useQuery({
    queryKey: ['employee-punch-photos', employeeId],
    enabled: open && employeeId > 0,
    queryFn: () => fetchPunchPhotos(employeeId),
  })

  const handleSelect = async (logId: number) => {
    try {
      const result = await setThumbnail.mutateAsync({ idEmployee: employeeId, logFaceId: logId })
      onSaved(result.thumbnailUuid)
      onOpenChange(false)
    } catch {
      // mutation error surfaced below
    }
  }

  const items = photosQuery.data ?? []
  const saving = setThumbnail.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('employeeThumbnail.title', { name: employeeName })}</DialogTitle>
        </DialogHeader>

        {photosQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : photosQuery.error ? (
          <p className="text-sm text-destructive">
            {photosQuery.error instanceof Error ? photosQuery.error.message : t('employeeThumbnail.loadFailed')}
          </p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('employeeThumbnail.noPhotos')}
          </p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
            {items.map((item) => (
              <PunchPreviewTile
                key={item.logId}
                item={item}
                saving={saving}
                dateLabel={
                  item.createDate
                    ? format(new Date(item.createDate), 'MMM d, yyyy HH:mm')
                    : t('employeeThumbnail.punchNumber', { id: item.logId })
                }
                onSelect={() => void handleSelect(item.logId)}
              />
            ))}
          </div>
        )}

        {setThumbnail.error ? (
          <p className="text-sm text-destructive">
            {setThumbnail.error instanceof Error ? setThumbnail.error.message : t('employeeThumbnail.saveFailed')}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
