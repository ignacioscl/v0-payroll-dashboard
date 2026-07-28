'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  deleteProviderLogo,
  fetchProviderBranding,
  updateProviderAccent,
  uploadProviderLogo,
  type ProviderBranding,
} from '@/lib/srs-provider-branding-api'

export const PROVIDER_BRANDING_KEY = ['provider-branding']

/**
 * Branding of the company the user is logged into. Read by everyone (the shell needs
 * the accent and the logo); only admins can write it — the backend enforces that.
 */
export function useProviderBranding(enabled = true) {
  return useQuery({
    queryKey: PROVIDER_BRANDING_KEY,
    queryFn: fetchProviderBranding,
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

function useBrandingMutation<TArgs>(fn: (args: TArgs) => Promise<ProviderBranding>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (branding) => {
      queryClient.setQueryData(PROVIDER_BRANDING_KEY, branding)
    },
  })
}

export function useUpdateProviderAccent() {
  return useBrandingMutation<string | null>(updateProviderAccent)
}

export function useUploadProviderLogo() {
  return useBrandingMutation<File>(uploadProviderLogo)
}

export function useDeleteProviderLogo() {
  return useBrandingMutation<void>(() => deleteProviderLogo())
}
