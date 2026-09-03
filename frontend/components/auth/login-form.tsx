'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  Clock,
  Users,
  BarChart3,
  AlertCircle,
  ExternalLink,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTranslation } from '@/lib/i18n/locale-context'
import { Logo } from '@/components/brand/logo'

const FEATURE_KEYS = [
  { icon: Clock, titleKey: 'auth.featurePunchTitle', descKey: 'auth.featurePunchDesc' },
  { icon: Users, titleKey: 'auth.featureTeamTitle', descKey: 'auth.featureTeamDesc' },
  { icon: BarChart3, titleKey: 'auth.featureReportsTitle', descKey: 'auth.featureReportsDesc' },
  { icon: Wallet, titleKey: 'auth.featureBillingTitle', descKey: 'auth.featureBillingDesc' },
] as const

interface LoginFormProps {
  phpLoginUrl: string
  srsPublicUrl: string
}

export function LoginForm({ phpLoginUrl }: LoginFormProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    if (searchParams.get('error') !== 'forbidden') return
    setError(t('auth.noAccess'))
  }, [searchParams, t])

  async function completeLogin(payload: {
    email: string
    password: string
    idUsuarioRolrel?: number
  }) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok || json.status !== 'success') {
      throw new Error(json?.error?.message || t('auth.invalidCredentials'))
    }
    // Non-admin with several USUARIO_ROL_REL: auto-pick the first (v0 role is idRolSystemV2).
    // Admin Company never gets needsRoleSelection from PHP.
    if (
      !payload.idUsuarioRolrel &&
      json.needsRoleSelection &&
      Array.isArray(json.rolesRel) &&
      json.rolesRel.length > 0
    ) {
      const firstId = Number(json.rolesRel[0]?.id)
      if (firstId > 0) {
        await completeLogin({ ...payload, idUsuarioRolrel: firstId })
        return
      }
    }
    router.replace('/')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    setLoading(true)
    try {
      await completeLogin({ email, password })
    } catch (err) {
      inFlight.current = false
      setError(err instanceof Error ? err.message : t('auth.loginFailed'))
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col lg:flex-row">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative flex flex-col justify-between overflow-hidden bg-[image:var(--sidebar-gradient)] px-8 py-10 text-white lg:w-[48%] lg:px-12 lg:py-14"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'radial-gradient(circle at 85% 10%, rgba(255,255,255,0.06), transparent 45%)',
            }}
          />

          <div className="relative z-10">
            <Logo size="md" />
          </div>

          <div className="relative z-10 my-10 hidden flex-1 flex-col justify-center lg:flex">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="max-w-md text-3xl font-bold leading-tight tracking-tight xl:text-4xl"
            >
              {t('auth.heroTitle')}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="mt-4 max-w-sm text-sm leading-relaxed text-white/75"
            >
              {t('auth.heroSubtitle')}
            </motion.p>

            <ul className="mt-10 space-y-5">
              {FEATURE_KEYS.map((feature, i) => (
                <motion.li
                  key={feature.titleKey}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.1, duration: 0.4 }}
                  className="flex items-start gap-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <feature.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t(feature.titleKey)}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/65">
                      {t(feature.descKey)}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 hidden text-xs text-white/50 lg:block">
            &copy; {new Date().getFullYear()} {t('auth.suiteTitle')}
          </p>
        </motion.div>

        <div className="flex flex-1 items-center justify-center bg-background px-6 py-12 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-8 flex items-center lg:hidden">
              <Logo size="sidebar" tone="light" />
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                {t('auth.welcomeBack')}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{t('auth.signInPrompt')}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">{t('auth.usernameEmail')}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    placeholder={t('auth.usernamePlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </motion.div>
              )}

              <Button
                type="submit"
                size="lg"
                disabled={loading}
                aria-busy={loading}
                className="h-11 w-full text-base font-semibold shadow-md shadow-primary/20"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                {t('auth.signIn')}
              </Button>
            </form>

            <div className="mt-8 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t('auth.preferClassic')}{' '}
                <a
                  href={phpLoginUrl}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {t('auth.signInLegacy')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
  )
}
