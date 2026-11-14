'use client'

import { ShieldAlert } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/locale-context'
import { PageState } from './page-state'

export function AccessDenied({ message }: { message?: string }) {
  const { t } = useTranslation()

  return <PageState icon={ShieldAlert} title={t('access.denied')} message={message ?? t('access.needTtk')} />
}
