'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/brand/logo'
import {
  useDeleteProviderLogo,
  useProviderBranding,
  useUpdateProviderAccent,
  useUploadProviderLogo,
} from '@/hooks/use-provider-branding'
import { brandingLogoUrl } from '@/lib/srs-provider-branding-api'
import { useTranslation } from '@/lib/i18n/locale-context'
import { getSrsErrorMessage } from '@/lib/srs/parse-srs-response'
import { cn } from '@/lib/utils'

/** Product default — the same value globals.css falls back to when no tenant accent is set. */
const DEFAULT_ACCENT = '#26407F'

const SWATCHES = ['#26407F', '#2563eb', '#0891b2', '#15803d', '#6d28d9', '#b91c1c', '#b45309']

const HEX = /^#[0-9a-fA-F]{6}$/

export function VisualSettingsForm({ companyName }: { companyName: string }) {
  const { t } = useTranslation()
  const { data: branding, isLoading } = useProviderBranding()
  const saveAccent = useUpdateProviderAccent()
  const uploadLogo = useUploadProviderLogo()
  const removeLogo = useDeleteProviderLogo()
  const fileInput = useRef<HTMLInputElement>(null)

  const savedAccent = branding?.accentColor ?? null
  const [accent, setAccent] = useState<string>(savedAccent ?? DEFAULT_ACCENT)

  useEffect(() => {
    setAccent(savedAccent ?? DEFAULT_ACCENT)
  }, [savedAccent])

  const valid = HEX.test(accent)
  const dirty = valid && accent.toLowerCase() !== (savedAccent ?? DEFAULT_ACCENT).toLowerCase()
  const logoSrc = brandingLogoUrl(branding)

  const handleSaveAccent = async () => {
    try {
      // Storing the default as null keeps "never configured" and "configured back to
      // the default" the same thing, so a future default change reaches both.
      await saveAccent.mutateAsync(accent.toLowerCase() === DEFAULT_ACCENT.toLowerCase() ? null : accent)
      toast.success(t('visualSettings.saved'))
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('visualSettings.saveFailed')))
    }
  }

  const handleUpload = async (file: File | undefined) => {
    if (!file) return
    try {
      await uploadLogo.mutateAsync(file)
      toast.success(t('visualSettings.logoUpdated'))
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('visualSettings.saveFailed')))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const handleRemove = async () => {
    try {
      await removeLogo.mutateAsync()
      toast.success(t('visualSettings.logoRemoved'))
    } catch (err) {
      toast.error(getSrsErrorMessage(err, t('visualSettings.saveFailed')))
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg">{t('visualSettings.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('visualSettings.scope', { company: companyName })}
        </p>
      </CardHeader>

      <CardContent className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-8">
          <div className="space-y-3">
            <Label>{t('visualSettings.logo')}</Label>
            <div className="flex items-center gap-4 rounded-lg border border-dashed border-border p-4">
              <div className="flex h-12 w-28 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-white">
                {logoSrc ? (
                  <img src={logoSrc} alt={companyName} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">{t('visualSettings.noLogo')}</span>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer"
                    disabled={uploadLogo.isPending}
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    {t('visualSettings.replace')}
                  </Button>
                  {branding?.logoIsV0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      disabled={removeLogo.isPending}
                      onClick={() => void handleRemove()}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('visualSettings.remove')}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t('visualSettings.logoHint')}</p>
                {branding && !branding.logoIsV0 && branding.logoFile && (
                  <p className="text-xs text-muted-foreground">{t('visualSettings.logoLegacy')}</p>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="accent">{t('visualSettings.accent')}</Label>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  onClick={() => setAccent(color)}
                  style={{ background: color }}
                  className={cn(
                    'h-8 w-8 cursor-pointer rounded-md border border-border transition-all',
                    accent.toLowerCase() === color.toLowerCase() &&
                      'ring-2 ring-foreground ring-offset-2',
                  )}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="accent"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-32 font-mono"
                aria-invalid={!valid}
              />
              <span className="text-xs text-muted-foreground">{t('visualSettings.accentHint')}</span>
            </div>
            {!valid && <p className="text-xs text-destructive">{t('visualSettings.accentInvalid')}</p>}
          </div>

          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {t('visualSettings.chromeNote')}
          </p>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              disabled={!dirty || saveAccent.isPending}
              onClick={() => setAccent(savedAccent ?? DEFAULT_ACCENT)}
            >
              {t('visualSettings.discard')}
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              disabled={!dirty || saveAccent.isPending}
              onClick={() => void handleSaveAccent()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('visualSettings.preview')}</p>
          {/* Every alias has to be pinned, not just --client-accent: the aliases are
              declared on :root, so they resolve there and descendants inherit the
              resolved colour. Overriding the alias lower down is what actually repaints. */}
          <div
            style={
              valid
                ? ({
                    ['--client-accent' as string]: accent,
                    ['--primary' as string]: accent,
                    ['--sidebar-accent' as string]: accent,
                    ['--table-header' as string]: accent,
                  } as React.CSSProperties)
                : undefined
            }
            className="flex h-60 overflow-hidden rounded-xl border border-border bg-card"
          >
            <div className="flex w-24 flex-col gap-2 bg-[image:var(--sidebar-gradient)] p-2">
              <div className="flex h-6 items-center justify-center overflow-hidden rounded-sm bg-white">
                {logoSrc && <img src={logoSrc} alt="" className="max-h-full max-w-full object-contain" />}
              </div>
              <Logo size="compact" />
              <div className="h-px bg-white/15" />
              <div className="rounded-md bg-sidebar-accent px-2 py-1.5 text-[10px] font-semibold text-sidebar-accent-foreground ring-1 ring-white/25">
                {t('visualSettings.previewNav')}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-3 p-3">
              <div className="h-2 w-3/5 rounded-full bg-muted" />
              <div className="rounded-md bg-primary px-2 py-1.5 text-center text-[11px] font-medium text-primary-foreground">
                {t('visualSettings.previewButton')}
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-4 items-center justify-center rounded-[4px] bg-primary text-primary-foreground">
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('visualSettings.previewCheck')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-4 w-7 items-center justify-end rounded-full bg-primary px-0.5">
                  <span className="h-3 w-3 rounded-full bg-white" />
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {t('visualSettings.previewSwitch')}
                </span>
              </div>
              <div className="h-6 rounded bg-table-header" />
            </div>
          </div>
        </div>
      </CardContent>

      {isLoading && <div className="px-6 pb-6 text-sm text-muted-foreground">{t('common.loading')}</div>}
    </Card>
  )
}
