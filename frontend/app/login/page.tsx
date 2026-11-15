import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/login-form'
import { LoginFormSkeleton } from '@/components/auth/login-form-skeleton'

export default function LoginPage() {
  const srsBase = (process.env.SRS_PUBLIC_URL ?? 'http://srs.com').replace(/\/$/, '')
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm phpLoginUrl={`${srsBase}/login.php`} srsPublicUrl={srsBase} />
    </Suspense>
  )
}
