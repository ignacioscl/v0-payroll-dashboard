'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useSrsMe } from '@/lib/auth/use-srs-me'
import { resolveLocale, type AppLocale } from './locale'
import { translate, type MessageKey } from './messages'

export type TranslateFn = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string

interface LocaleContextValue {
  locale: AppLocale
  t: TranslateFn
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'en',
  t: (key, params) => translate('en', key, params),
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useSrsMe()
  const locale = resolveLocale(user)

  const value = useMemo(
    () => ({
      locale,
      t: ((key: MessageKey, params?: Record<string, string | number>) =>
        translate(locale, key, params)) as TranslateFn,
    }),
    [locale],
  )

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useTranslation() {
  return useContext(LocaleContext)
}
