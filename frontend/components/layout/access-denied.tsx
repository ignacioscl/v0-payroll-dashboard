'use client'

import { ShieldAlert } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/locale-context'

export function AccessDenied({ message }: { message?: string }) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">{t('access.denied')}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {message ?? t('access.needTtk')}
      </p>
    </div>
  )
}
