'use client'

import * as React from 'react'
import { ChevronsUpDown, Mail } from 'lucide-react'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import type { InvoiceSentEmailAccount } from '@/hooks/use-invoice-sent-email-accounts'
import { useTranslation } from '@/lib/i18n/locale-context'

interface SentEmailAccountComboboxProps {
  accounts: InvoiceSentEmailAccount[]
  onPick: (email: string) => void
  isLoading?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Searchable email picker (legacy select2 parity). Picking an address appends it
 * to the "Email to" field and clears the combobox — no persistent selection.
 */
export function SentEmailAccountCombobox({
  accounts,
  onPick,
  isLoading = false,
  disabled = false,
  className,
}: SentEmailAccountComboboxProps) {
  const { t } = useTranslation()
  const [searchTerm, setSearchTerm] = React.useState('')

  const handleChange = React.useCallback(
    (item: InvoiceSentEmailAccount | null) => {
      if (!item?.email.trim()) return
      onPick(item.email.trim())
      setSearchTerm('')
    },
    [onPick],
  )

  return (
    <SearchableCombobox<InvoiceSentEmailAccount>
      value={null}
      onChange={handleChange}
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      items={accounts}
      getItemKey={(row) => row.email}
      getItemLabel={(row) => row.email}
      isLoading={isLoading}
      disabled={disabled}
      serverSideSearch={false}
      minSearchChars={0}
      placeholder={t('invoices.actionEmailLastAccountPlaceholder')}
      searchPlaceholder={t('combobox.search')}
      emptyTitle={t('combobox.noResults')}
      emptyDescription={t('combobox.tryDifferent')}
      loadingMessage={t('combobox.searching')}
      resultsHeading={t('invoices.actionEmailLastAccount')}
      className={className}
      renderEmptyTrigger={({ placeholder }) => (
        <>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Mail className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium text-muted-foreground">
            {placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </>
      )}
      renderItem={({ item }) => (
        <>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Mail className="size-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {item.email}
          </span>
        </>
      )}
    />
  )
}
