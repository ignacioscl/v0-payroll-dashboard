'use client'

import { downloadBlob } from '@/lib/srs/parse-srs-response'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** File name from `Content-Disposition` (`filename*=UTF-8''…` first, then `filename="…"`). */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (star?.[1]) return decodeURIComponent(star[1])
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain?.[1] ?? fallback
}

/**
 * Baja un .xlsx que arma el Nest (con Report Info) desde una acción de fila (p. ej. «Export dealers»
 * de una regla). Para el export de una grilla va `ServerXlsxExportButton` en `exportAction`.
 */
export async function downloadServerXlsx(url: string, fallbackFileName: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-store' })
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.includes(XLSX_MIME)) throw new Error(`Export failed (${res.status})`)
  const blob = await res.blob()
  downloadBlob(blob, filenameFromDisposition(res.headers.get('content-disposition'), fallbackFileName))
}
