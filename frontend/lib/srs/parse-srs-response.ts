import axios from 'axios'

export type SrsEnvelope<T> = {
  status?: string
  error?: { code?: string; message?: string | null }
  data?: T | null
}

const SESSION_EXPIRED_MESSAGE = 'Session expired — sign in again and retry.'

/** Detects legacy SRS login HTML mistakenly returned as an API response. */
export function isSrsLoginHtml(text: string): boolean {
  const sample = text.slice(0, 4000)
  return (
    sample.includes('SRS Suite - Login') ||
    sample.includes('Secure Sign In') ||
    sample.includes('id="js-login"')
  )
}

function parseEnvelope<T>(raw: unknown): SrsEnvelope<T> {
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (isSrsLoginHtml(trimmed) || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      throw new Error(SESSION_EXPIRED_MESSAGE)
    }
    try {
      return JSON.parse(raw) as SrsEnvelope<T>
    } catch {
      throw new Error(trimmed.slice(0, 200) || 'Invalid response from server')
    }
  }
  if (raw && typeof raw === 'object') {
    return raw as SrsEnvelope<T>
  }
  throw new Error('Invalid response from server')
}

/** Throws when the SRS envelope reports failure (works for ErrorManager responses). */
export function throwIfSrsFail(raw: unknown, fallbackMessage: string): void {
  const envelope = parseEnvelope(raw)
  if (envelope.status === 'fail' || envelope.error?.message?.trim()) {
    throw new Error(envelope.error?.message?.trim() || fallbackMessage)
  }
}

/** Parses the SRS `{ status, error, data }` envelope and returns `data` on success. */
export function assertSrsSuccess<T>(raw: unknown, fallbackMessage: string): T {
  throwIfSrsFail(raw, fallbackMessage)
  const envelope = parseEnvelope<T>(raw)

  if (envelope.data == null || envelope.data === 'null') {
    throw new Error(fallbackMessage)
  }

  return envelope.data
}

/** Extracts a human-readable message from axios / SRS errors. */
export function getSrsErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    try {
      const envelope = parseEnvelope<unknown>(error.response?.data)
      if (envelope.status === 'fail' || envelope.error?.message?.trim()) {
        return envelope.error?.message?.trim() || fallback
      }
    } catch (e) {
      if (e instanceof Error && e.message !== 'Invalid response from server') {
        return e.message
      }
    }
    return error.message || fallback
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

/** Validates a blob response is a PDF; throws a readable error for login HTML or JSON errors. */
export async function assertPdfBlob(blob: Blob, fallbackMessage: string): Promise<Blob> {
  const header = await blob.slice(0, 5).text()
  if (header.startsWith('%PDF')) {
    return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
  }

  const text = await blob.text()
  if (isSrsLoginHtml(text)) {
    throw new Error(SESSION_EXPIRED_MESSAGE)
  }
  if (text.trim().startsWith('{')) {
    try {
      const json = JSON.parse(text) as { error?: { message?: string } }
      throw new Error(json.error?.message || fallbackMessage)
    } catch (parseErr) {
      if (parseErr instanceof Error && parseErr.message !== fallbackMessage) {
        throw parseErr
      }
    }
  }
  throw new Error(fallbackMessage)
}

/** PDF or ZIP from print endpoint (separate_invoices_zip). */
export async function assertPdfOrZipBlob(
  blob: Blob,
  fallbackMessage: string,
): Promise<{ blob: Blob; kind: 'pdf' | 'zip' }> {
  const headerBytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  // ZIP local file header: PK\x03\x04
  if (headerBytes[0] === 0x50 && headerBytes[1] === 0x4b) {
    return {
      blob: blob.type === 'application/zip' ? blob : new Blob([blob], { type: 'application/zip' }),
      kind: 'zip',
    }
  }
  const pdf = await assertPdfBlob(blob, fallbackMessage)
  return { blob: pdf, kind: 'pdf' }
}

/** Opens a PDF blob in a new browser tab. */
export function openPdfBlobInNewTab(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    URL.revokeObjectURL(url)
    throw new Error('Pop-up blocked — allow pop-ups for this site to view the PDF')
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
}

/** Triggers a file download for a blob (ZIP or PDF). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
