'use client'

import { useQuery } from '@tanstack/react-query'

import {
  fetchInvoiceAuthors,
  fetchInvoiceDepartments,
  fetchInvoiceDistricts,
  fetchInvoiceServices,
  fetchInvoiceWorkers,
  type InvoiceDistrictOption,
  type InvoiceLookupOption,
} from '@/lib/srs-invoices-api'

export type { InvoiceDistrictOption, InvoiceLookupOption }

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

export function useInvoiceAuthorLookup(
  idDealer: string,
  search: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['invoice-author-lookup', idDealer, search],
    queryFn: () => fetchInvoiceAuthors({ idDealer, search: search || undefined }),
    enabled: enabled && idDealer.length > 0,
    staleTime: 60_000,
  })
}

export function useInvoiceWorkerLookup(
  idDealer: string,
  search: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['invoice-worker-lookup', idDealer, search],
    queryFn: () => fetchInvoiceWorkers({ idDealer, search: search || undefined }),
    enabled: enabled && idDealer.length > 0,
    staleTime: 60_000,
  })
}

export function useInvoiceDistrictLookup(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['invoice-district-lookup', search],
    queryFn: () => fetchInvoiceDistricts({ search: search || undefined }),
    enabled,
    staleTime: 60_000,
  })
}
