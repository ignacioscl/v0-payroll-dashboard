'use client'

import { useMemo } from 'react'
import { useApiRequest } from '@/lib/hooks/use-api-request'
import { srsProxyUrl } from '@/lib/srs-proxy-url'

/**
 * Client-side SRS calls through the single Next proxy `/api/srs/[...path]`.
 * Pass only the upstream PHP path (e.g. `php/api/payroll/ttk-list.php`).
 */
export function useSrsApiRequest<TPayload = unknown, TQuery = Record<string, string | number>, TResponse = unknown>(
  phpPath: string,
) {
  const url = useMemo(() => srsProxyUrl(phpPath), [phpPath])
  return useApiRequest<TPayload, TQuery, TResponse>(undefined, url)
}
