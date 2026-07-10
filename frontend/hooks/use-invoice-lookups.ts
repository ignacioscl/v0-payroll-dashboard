'use client'

import { useQuery } from '@tanstack/react-query'

import {
  fetchInvoiceDepartments,
  fetchInvoiceServices,
  type InvoiceLookupOption,
} from '@/lib/srs-invoices-api'

export type { InvoiceLookupOption }

export function useInvoiceDepartmentLookup(
  idDealer: string,
  search: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['invoice-dept-lookup', idDealer, search],
    queryFn: () => fetchInvoiceDepartments({ idDealer, search: search || undefined }),
    enabled: enabled && idDealer.length > 0,
    staleTime: 60_000,
  })
}

export function useInvoiceServiceLookup(
  idDealer: string,
  departmentIds: number[],
  search: string,
  enabled: boolean,
) {
  const idDepartment = departmentIds.length ? departmentIds.join(',') : undefined
  return useQuery({
    queryKey: ['invoice-svc-lookup', idDealer, idDepartment, search],
    queryFn: () =>
      fetchInvoiceServices({
        idDealer,
        idDepartment,
        search: search || undefined,
      }),
    enabled: enabled && idDealer.length > 0,
    staleTime: 60_000,
  })
}
