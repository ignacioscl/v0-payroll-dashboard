'use client'

import { QueryProvider } from '@/lib/providers/query-provider'

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>
}
