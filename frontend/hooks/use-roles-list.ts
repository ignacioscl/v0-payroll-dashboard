'use client'

import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { throwIfSrsFail } from '@/lib/srs/parse-srs-response'
import type { RolesListResponse } from '@/lib/roles/roles-types'
import { SrsPhpPath } from '@/types/enum-url'

export type RolesListEnvelope = {
  status?: string
  data?: RolesListResponse
  error?: { message?: string | null }
}

/**
 * Fetcher for DataTable adapter — returns the raw SRS envelope.
 */
export function useRolesListFetcher() {
  const apiRequest = useSrsApiRequest<
    unknown,
    Record<string, string | number>,
    RolesListEnvelope
  >(SrsPhpPath.ROLES_LIST)

  return async (params: Record<string, string | number>) => {
    const raw = await apiRequest.getCustom('', undefined, params)
    throwIfSrsFail(raw, 'Failed to load roles')
    return raw as unknown as RolesListEnvelope
  }
}
