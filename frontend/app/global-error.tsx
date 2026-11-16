'use client'

import './globals.css'

/**
 * Error del layout raíz: reemplaza a todo el documento, así que no hay providers ni traducciones (textos fijos de D1,
 * solo inglés). Repite el marcado de `components/layout/page-state.tsx` sin usarlo: si cambia allá, cambia acá.
 * plans/plan-buenas-practicas-v0, 2.9; doc de Next 16.2 `03-file-conventions/error.md` («Global Error»).
 */
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en" className="bg-background">
      <body className="font-sans antialiased">
        <title>SRS Suite Pro</title>
        <main className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
              <svg
                aria-hidden
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-7 w-7"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              This page could not be loaded. Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="mt-5 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
            >
              <svg
                aria-hidden
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
