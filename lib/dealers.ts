import { agencies } from '@/lib/mock-data'
import type { DealerOption } from '@/components/filters/types'

export const dealerOptions: DealerOption[] = agencies.map((agency) => ({
  id: agency.id,
  label: agency.name,
}))
