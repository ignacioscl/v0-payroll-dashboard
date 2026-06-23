'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/locale-context'

function AuthErrorContent() {
  const { t } = useTranslation()
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason') ?? 'unknown'

  return (
    <Card className="max-w-md w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          {t('authError.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('authError.body')}</p>
        <p className="text-xs font-mono text-muted-foreground break-all">{reason}</p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">{t('authError.tryAgain')}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

export default function AuthErrorPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Suspense fallback={<div className="text-muted-foreground">{t('common.loading')}</div>}>
        <AuthErrorContent />
      </Suspense>
    </div>
  )
}
