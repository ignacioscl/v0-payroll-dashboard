'use client'

import * as React from 'react'
import { Filter, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseWoInput, woNumbersToInput } from '@/lib/invoice-advanced-filters'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/locale-context'

interface WoNumberFilterProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

export function WoNumberFilter({ value, onChange, disabled }: WoNumberFilterProps) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [input, setInput] = React.useState(woNumbersToInput(value))

  React.useEffect(() => {
    setInput(woNumbersToInput(value))
  }, [value])

  const commitInput = (raw: string) => {
    const next = parseWoInput(raw)
    onChange(next)
  }

  const handleInputBlur = () => {
    commitInput(input)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitInput(input)
    }
  }

  const openMulti = () => {
    setDraft(woNumbersToInput(value))
    setDialogOpen(true)
  }

  const applyMulti = () => {
    onChange(parseWoInput(draft))
    setDialogOpen(false)
  }

  const removeWo = (wo: string) => {
    onChange(value.filter((w) => w !== wo))
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          placeholder={t('invoices.filterWoPlaceholder')}
          className="h-8 text-xs"
          disabled={disabled}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 border-border"
          onClick={openMulti}
          disabled={disabled}
          aria-label={t('invoices.filterWoMulti')}
          title={t('invoices.filterWoMulti')}
        >
          <Filter className="h-3.5 w-3.5" />
        </Button>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((wo) => (
            <span
              key={wo}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium"
            >
              {wo}
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`${t('common.clear')} ${wo}`}
                onClick={() => removeWo(wo)}
                disabled={disabled}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('invoices.filterWoMultiTitle')}</DialogTitle>
            <DialogDescription>{t('invoices.filterWoMultiHint')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="wo-multi" className="text-xs">
              {t('invoices.filterWoLabel')}
            </Label>
            <textarea
              id="wo-multi"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className={cn(
                'border-input bg-background ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-[120px] w-full rounded-md border px-3 py-2 text-xs',
                'focus-visible:ring-[3px] focus-visible:outline-none',
              )}
              placeholder={t('invoices.filterWoPlaceholder')}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={applyMulti}>
              {t('common.apply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
