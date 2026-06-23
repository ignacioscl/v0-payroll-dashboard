'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Settings2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { canAccessSystemConfig } from '@/lib/auth/ttk-permissions'
import {
  useInvoiceNoteStatuses,
  useUpdateInvoiceNoteStatusLabel,
  type InvoiceNoteStatusItem,
} from '@/hooks/use-invoice-note-status'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { useTranslation } from '@/lib/i18n/locale-context'
import { toast } from 'sonner'

export default function SystemConfigPage() {
  const { t } = useTranslation()
  const { user, hasPermission, loading: meLoading } = useSrsMe()
  const canAccess = canAccessSystemConfig(hasPermission, user?.isSystemAdmin)
  const { data, isLoading, error } = useInvoiceNoteStatuses(canAccess)
  const updateLabel = useUpdateInvoiceNoteStatusLabel()
  const [drafts, setDrafts] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!data?.statuses) return
    const next: Record<number, string> = {}
    for (const status of data.statuses) {
      next[status.id] = status.displayName
    }
    setDrafts(next)
  }, [data?.statuses])

  if (meLoading) {
    return <p className="text-muted-foreground">{t('common.loading')}</p>
  }

  if (!canAccess) {
    return (
      <Card className="border-border">
        <CardContent className="pt-6">
          <p className="text-muted-foreground">{t('systemConfig.noAccess')}</p>
        </CardContent>
      </Card>
    )
  }

  const handleSave = async (status: InvoiceNoteStatusItem) => {
    const displayName = (drafts[status.id] ?? '').trim()
    if (!displayName) {
      toast.error(t('systemConfig.labelEmpty'))
      return
    }
    try {
      await updateLabel.mutateAsync({ id: status.id, displayName })
      toast.success(t('systemConfig.labelUpdated'))
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('systemConfig.updateFailed')))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
          <Settings2 className="h-7 w-7 text-primary" />
          {t('systemConfig.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('systemConfig.subtitle')}</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg">{t('systemConfig.invoiceNoteStatuses')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">{t('systemConfig.loadingStatuses')}</p>}
          {error && (
            <p className="text-sm text-destructive">
              {getSrsErrorMessage(error, t('systemConfig.loadFailed'))}
            </p>
          )}
          {data?.statuses.map((status) => (
            <div
              key={status.id}
              className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[180px_1fr_auto]"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{status.defaultName}</p>
                <p className="text-xs text-muted-foreground">{status.code}</p>
              </div>
              <Input
                value={drafts[status.id] ?? status.displayName}
                onChange={(e) =>
                  setDrafts((prev) => ({ ...prev, [status.id]: e.target.value }))
                }
                placeholder={status.defaultName}
              />
              <Button
                variant="outline"
                disabled={updateLabel.isPending}
                onClick={() => void handleSave(status)}
              >
                {t('common.save')}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{t('systemConfig.billingNoteHint')}</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        {t('systemConfig.backToDashboard')}
      </Link>
    </div>
  )
}
