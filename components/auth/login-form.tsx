'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  Clock,
  Users,
  BarChart3,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { APP_SUBTITLE, SRS_SUITE_TITLE } from '@/lib/branding'
import { RoleSelectionDialog } from '@/components/auth/role-selection-dialog'
import type { SrsLoginRoleOption } from '@/lib/auth/types'

const features = [
  {
    icon: Clock,
    title: 'Time tracking',
    description: 'Monitor punches, hours, and attendance in real time.',
  },
  {
    icon: Users,
    title: 'Team visibility',
    description: 'See who is on site and manage your workforce.',
  },
  {
    icon: BarChart3,
    title: 'Payroll insights',
    description: 'Dashboard KPIs and issue tracking at a glance.',
  },
]

interface LoginFormProps {
  phpLoginUrl: string
  srsPublicUrl: string
}

export function LoginForm({ phpLoginUrl, srsPublicUrl }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [roleOptions, setRoleOptions] = useState<SrsLoginRoleOption[] | null>(null)

  useEffect(() => {
    if (searchParams.get('error') !== 'forbidden') return
    setError(
      'You do not have access to the payroll dashboard. Contact your administrator if you believe this is an error.',
    )
  }, [searchParams])

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
      throw new Error(json?.error?.message || 'Invalid username or password')
    }
    if (json.needsRoleSelection && Array.isArray(json.rolesRel) && json.rolesRel.length > 0) {
      setRoleOptions(json.rolesRel)
      return
    }
    setRoleOptions(null)
    router.replace('/')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await completeLogin({ email, password })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleRoleSelect(idUsuarioRolrel: number) {
    setError(null)
    setLoading(true)
    try {
      await completeLogin({ email, password, idUsuarioRolrel })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <RoleSelectionDialog
        open={roleOptions !== null && roleOptions.length > 0}
        roles={roleOptions ?? []}
        srsPublicUrl={srsPublicUrl}
        loading={loading}
        onSelect={handleRoleSelect}
      />

      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1e3a8a] via-[#1e40af] to-[#0891b2] px-8 py-10 text-white lg:w-[48%] lg:px-12 lg:py-14"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.8) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 shadow-lg shadow-black/10 backdrop-blur-sm ring-1 ring-white/20">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight">{SRS_SUITE_TITLE}</p>
                <p className="text-xs font-medium text-white/70">{APP_SUBTITLE} Dashboard</p>
              </div>
            </div>
          </div>

          <div className="relative z-10 my-10 hidden flex-1 flex-col justify-center lg:flex">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="max-w-md text-3xl font-bold leading-tight tracking-tight xl:text-4xl"
            >
              Payroll &amp; attendance,{' '}
              <span className="text-cyan-200">all in one place</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="mt-4 max-w-sm text-sm leading-relaxed text-white/75"
            >
              Sign in with your SRS credentials to access the dashboard. Your session
              stays in sync with SRS Legacy.
            </motion.p>

            <ul className="mt-10 space-y-5">
              {features.map((feature, i) => (
                <motion.li
                  key={feature.title}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.1, duration: 0.4 }}
                  className="flex items-start gap-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <feature.icon className="h-5 w-5 text-cyan-200" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{feature.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/65">
                      {feature.description}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 hidden text-xs text-white/50 lg:block">
            &copy; {new Date().getFullYear()} {SRS_SUITE_TITLE}
          </p>
        </motion.div>

        <div className="flex flex-1 items-center justify-center bg-background px-6 py-12 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold tracking-tight">{SRS_SUITE_TITLE}</p>
                <p className="text-xs text-muted-foreground">{APP_SUBTITLE} Dashboard</p>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your SRS username and password to continue.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Username / Email</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading || roleOptions !== null}
                    className="h-11 pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
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
                    disabled={loading || roleOptions !== null}
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
                disabled={loading || roleOptions !== null}
                className={cn(
                  'h-11 w-full text-base font-semibold shadow-md shadow-primary/20',
                  'bg-gradient-to-r from-primary to-[#1d4ed8] hover:from-primary/90 hover:to-[#1d4ed8]/90'
                )}
              >
                {loading && !roleOptions ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-8 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Prefer the classic SRS interface?{' '}
                <a
                  href={phpLoginUrl}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  Sign in via SRS Legacy
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  )
}
