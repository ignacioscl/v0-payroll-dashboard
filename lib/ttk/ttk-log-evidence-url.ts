import { srsProxyUrl } from '@/lib/srs-proxy-url'

/** Same-origin proxy URL for an uploaded TTK change-log evidence file. */
export function ttkLogEvidenceUrl(fileLog: string): string {
  const name = fileLog.replace(/^\/+/, '').split('/').pop() ?? fileLog
  return srsProxyUrl(`uploads/ttk_log/${encodeURIComponent(name)}`)
}
