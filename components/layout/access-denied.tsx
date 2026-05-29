'use client'

import { ShieldAlert } from 'lucide-react'

export function AccessDenied() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        You need Time Tracking (Daily Punch) permissions to use this dashboard.
        Contact your administrator if you believe this is an error.
      </p>
    </div>
  )
}
