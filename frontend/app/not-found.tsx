'use client'

import { AppLink } from '@/components/shared/app-link'
import { FileQuestion, LayoutDashboard } from 'lucide-react'

import { PageState } from '@/components/layout/page-state'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/locale-context'

/** Dirección que no existe (plans/plan-buenas-practicas-v0, 2.9): la tarjeta con «Back to dashboard». */
export default function NotFound() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <PageState
        icon={FileQuestion}
        tone="muted"
        title={t('notFound.title')}
        message={t('notFound.body')}
        action={
          <Button asChild variant="outline">
            <AppLink href="/">
              <LayoutDashboard aria-hidden />
              {t('systemConfig.backToDashboard')}
            </AppLink>
          </Button>
        }
      />
    </main>
  )
}
