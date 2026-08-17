'use client'

import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDeleteCatalogItem, useGenericCatalog } from '@/hooks/use-generic-invoice'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import type { GenericCatalogItem } from '@/lib/srs-generic-invoices-api'

export type GenericItemDraft = {
  key: number
  description: string
  qty: number | null
  unitAmount: number
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return n < 0 ? `-$${abs}` : `$${abs}`
}

function lineTotal(item: GenericItemDraft): number {
  return item.qty ? item.unitAmount * item.qty : item.unitAmount
}

function parseOptionalQty(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0.01 || n > 9999999.99) return { ok: false }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

function parseUnitAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < -999999.99 || n > 999999.99) return null
  return Math.round(n * 100) / 100
}

function toCustomCatalogItem(term: string): GenericCatalogItem {
  return { id: 0, name: term, price: null, canDelete: false }
}

export function GenericInvoiceItems({
  items,
  onChange,
  idDealer,
  canDeleteCatalogItem,
  disabled = false,
}: {
  items: GenericItemDraft[]
  onChange: (items: GenericItemDraft[]) => void
  idDealer: number | null
  canDeleteCatalogItem: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [nextKey, setNextKey] = React.useState(1)
  const [descItem, setDescItem] = React.useState<GenericCatalogItem | null>(null)
  const [descTerm, setDescTerm] = React.useState('')
  const [debouncedDesc, setDebouncedDesc] = React.useState('')
  const [qty, setQty] = React.useState('')
  const [unitAmount, setUnitAmount] = React.useState('')
  const [pendingRemove, setPendingRemove] = React.useState<GenericItemDraft | null>(null)
  const [pendingCatalog, setPendingCatalog] = React.useState<GenericCatalogItem | null>(null)

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebouncedDesc(descTerm.trim()), 250)
    return () => window.clearTimeout(id)
  }, [descTerm])

  const catalog = useGenericCatalog(36, idDealer, debouncedDesc)
  const deleteCatalog = useDeleteCatalogItem()

  const fillFromCatalog = (item: GenericCatalogItem | null) => {
    setDescItem(item)
    if (item?.price != null) setUnitAmount(String(item.price))
  }

  const resetDraft = () => {
    setDescItem(null)
    setDescTerm('')
    setQty('')
    setUnitAmount('')
  }

  const addItem = () => {
    const description = (descItem?.name ?? descTerm).trim()
    if (!description) {
      toast.error(t('invoices.generic.descriptionRequired'))
      return
    }
    if (description.length > 128) {
      toast.error(t('invoices.generic.descriptionTooLong'))
      return
    }
    const parsedQty = parseOptionalQty(qty)
    if (!parsedQty.ok) {
      toast.error(t('invoices.generic.qtyInvalid'))
      return
    }
    const amount = parseUnitAmount(unitAmount)
    if (amount === null) {
      toast.error(t('invoices.generic.amountRequired'))
      return
    }
    const dup = items.some(
      (row) => row.description.trim().toLowerCase() === description.toLowerCase(),
    )
    if (dup) {
      toast.error(t('invoices.generic.duplicateItem'))
      return
    }
    onChange([
      ...items,
      { key: nextKey, description, qty: parsedQty.value, unitAmount: amount },
    ])
    setNextKey((n) => n + 1)
    resetDraft()
  }

  const beginEdit = (row: GenericItemDraft) => {
    const currentDescription = (descItem?.name ?? descTerm).trim()
    let nextItems = items.filter((item) => item.key !== row.key)
    if (currentDescription) {
      const parsedQty = parseOptionalQty(qty)
      const amount = parseUnitAmount(unitAmount)
      const exists = nextItems.some(
        (item) => item.description.trim().toLowerCase() === currentDescription.toLowerCase(),
      )
      if (parsedQty.ok && amount !== null && !exists) {
        nextItems = [
          ...nextItems,
          {
            key: nextKey,
            description: currentDescription,
            qty: parsedQty.value,
            unitAmount: amount,
          },
        ]
        setNextKey((n) => n + 1)
      } else {
        toast.warning(t('invoices.generic.draftDiscarded'))
      }
    }
    onChange(nextItems)
    setDescItem(toCustomCatalogItem(row.description))
    setDescTerm('')
    setQty(row.qty == null ? '' : String(row.qty))
    setUnitAmount(String(row.unitAmount))
  }

  const onDraftKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    addItem()
  }

  const total = items.reduce((sum, item) => sum + lineTotal(item), 0)

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] md:items-end">
        <div className="space-y-1.5">
          <Label>{t('invoices.generic.description')}</Label>
          <SearchableCombobox<GenericCatalogItem>
            value={descItem}
            onChange={fillFromCatalog}
            searchTerm={descTerm}
            onSearchTermChange={setDescTerm}
            items={catalog.data ?? []}
            isLoading={catalog.isFetching}
            getItemKey={(item) => (item.id > 0 ? item.id : `custom:${item.name}`)}
            getItemLabel={(item) => item.name}
            minSearchChars={0}
            serverSideSearch
            disabled={disabled}
            placeholder={t('invoices.generic.descriptionPlaceholder')}
            searchPlaceholder={t('invoices.generic.descriptionPlaceholder')}
            emptyTitle={t('invoices.generic.catalogEmpty')}
            createCustomItem={toCustomCatalogItem}
            createItemLabel={(term) => t('invoices.generic.useCustom', { term })}
            onDeleteItem={
              canDeleteCatalogItem ? (item) => setPendingCatalog(item) : undefined
            }
            canDeleteItem={(item) => item.canDelete && item.id > 0}
            deleteItemAriaLabel={t('invoices.generic.deleteCatalogAction')}
            prerequisite={{
              met: idDealer != null && idDealer > 0,
              title: t('invoices.generic.dealer'),
              description: t('invoices.generic.pickDealerFirst'),
            }}
            renderItem={({ item }) => (
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {item.name}
                {item.price != null ? ` (${fmtMoney(item.price)})` : ''}
              </span>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="generic-item-qty">{t('invoices.generic.qty')}</Label>
          <Input
            id="generic-item-qty"
            type="number"
            min={0.01}
            step="0.01"
            value={qty}
            disabled={disabled}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={onDraftKeyDown}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="generic-item-amount">{t('invoices.generic.unitAmount')}</Label>
          <Input
            id="generic-item-amount"
            type="number"
            min={-999999.99}
            max={999999.99}
            step="0.01"
            value={unitAmount}
            disabled={disabled}
            onChange={(e) => setUnitAmount(e.target.value)}
            onKeyDown={onDraftKeyDown}
          />
        </div>
        <Button type="button" disabled={disabled} onClick={addItem}>
          <Plus />
          {t('invoices.generic.addItem')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-md border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('invoices.generic.colItem')}</TableHead>
              <TableHead className="text-right">{t('invoices.generic.colRate')}</TableHead>
              <TableHead className="text-right">{t('invoices.generic.colQty')}</TableHead>
              <TableHead className="text-right">{t('invoices.generic.colAmount')}</TableHead>
              <TableHead className="w-[1%] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  —
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.key}>
                  <TableCell className="max-w-[28rem] truncate font-medium">
                    {item.description}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(item.unitAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.qty == null ? '—' : item.qty}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtMoney(lineTotal(item))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={disabled}
                        aria-label={t('invoices.generic.edit')}
                        onClick={() => beginEdit(item)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={disabled}
                        aria-label={t('invoices.generic.remove')}
                        onClick={() => setPendingRemove(item)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          {items.length > 0 ? (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="text-right font-medium">
                  {t('invoices.generic.total')}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {fmtMoney(total)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>

      <ConfirmActionDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null)
        }}
        tone="danger"
        title={t('invoices.generic.removeConfirmTitle')}
        description={t('invoices.generic.removeConfirm', {
          name: pendingRemove?.description ?? '',
        })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('invoices.generic.remove')}
        onConfirm={() => {
          if (pendingRemove) {
            onChange(items.filter((item) => item.key !== pendingRemove.key))
          }
          setPendingRemove(null)
        }}
      />

      <ConfirmActionDialog
        open={pendingCatalog != null}
        onOpenChange={(open) => {
          if (!open && !deleteCatalog.isPending) setPendingCatalog(null)
        }}
        tone="danger"
        title={t('invoices.generic.deleteCatalogTitle')}
        description={t('invoices.generic.deleteCatalogConfirm', {
          name: pendingCatalog?.name ?? '',
        })}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('invoices.generic.deleteCatalogAction')}
        pending={deleteCatalog.isPending}
        pendingLabel={t('common.loading')}
        onConfirm={async () => {
          if (!pendingCatalog) return
          try {
            await deleteCatalog.mutateAsync(pendingCatalog.id)
            toast.success(t('invoices.generic.deleteCatalogSuccess'))
            if (descItem?.id === pendingCatalog.id) {
              setDescItem(null)
              setDescTerm('')
            }
            setPendingCatalog(null)
          } catch (err) {
            toast.error(
              getSrsErrorMessage(err, t('invoices.generic.deleteCatalogError')),
            )
          }
        }}
      />
    </div>
  )
}
