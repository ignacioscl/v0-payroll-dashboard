import axios from 'axios'

export type SrsEnvelope<T> = {
  status?: string
  error?: { code?: string; message?: string | null }
  data?: T | null
}

function parseEnvelope<T>(raw: unknown): SrsEnvelope<T> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as SrsEnvelope<T>
    } catch {
      throw new Error(raw.trim() || 'Invalid response from server')
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
