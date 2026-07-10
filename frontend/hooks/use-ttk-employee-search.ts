'use client'

import { useQuery } from '@tanstack/react-query'
import { useSrsApiRequest } from '@/lib/hooks/use-srs-api-request'
import { assertSrsSuccess } from '@/lib/srs/parse-srs-response'
import { SrsPhpPath } from '@/types/enum-url'

export type TtkEmployeeOption = {
  id: number
  nombre: string
  role?: string
  department?: string
}

type TtkEmployeesResponse = {
  data?: { results: TtkEmployeeOption[] }
  status?: string
  error?: { message?: string }
}

export function useTtkEmployeeSearch(term: string, idDealer: number | null, enabled: boolean) {
  const apiRequest = useSrsApiRequest<undefined, { term: string; id_dealer: number }, TtkEmployeesResponse>(
    SrsPhpPath.TTK_EMPLOYEES,
  )

  return useQuery({
    queryKey: ['ttk-employees', idDealer, term],
    queryFn: async () => {
      const raw = await apiRequest.getCustom('', undefined, {
        term,
        id_dealer: idDealer!,
      })
      const data = assertSrsSuccess<{ results: TtkEmployeeOption[] }>(
        raw,
        'Failed to search employees',
      )
      return data.results ?? []
    },
    enabled: enabled && idDealer != null && idDealer > 0 && term.trim().length >= 2,
    staleTime: 30_000,
  })
}
