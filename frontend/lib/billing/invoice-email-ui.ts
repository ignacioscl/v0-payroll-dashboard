/** Append an email to a comma-separated list (legacy addEmailTo). */
export function appendEmailToField(current: string, email: string): string {
  const next = email.trim()
  if (!next) return current
  const parts = current
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.some((p) => p.toLowerCase() === next.toLowerCase())) {
    return current
  }
  return parts.length === 0 ? next : `${parts.join(', ')}, ${next}`
}

export function formatInvoiceEmailDate(value?: string | null): string {
  if (!value) return '—'
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const DEFAULT_INVOICE_EMAIL_FILE_NAME = 'Invoice Details'
