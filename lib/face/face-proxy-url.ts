/** Same-origin URL for face-recognition via `/api/face/[...path]`. */
export function faceProxyUrl(path: string) {
  const normalized = path.replace(/^\//, '')
  return `/api/face/${normalized}`
}

/** SRS default employee avatar (muñequito gris). */
export const DEFAULT_EMPLOYEE_AVATAR_URL = '/api/srs/img/foto-perfil.jpg'

export function employeeThumbnailUrl(thumbnailUuid: string | null | undefined): string {
  if (!thumbnailUuid) {
    return DEFAULT_EMPLOYEE_AVATAR_URL
  }
  return faceProxyUrl(`api/employeeThumbnail/${encodeURIComponent(thumbnailUuid)}`)
}

export function employeePunchPreviewUrl(logId: number | string): string {
  return faceProxyUrl(`api/employeePunchPreview/${encodeURIComponent(String(logId))}`)
}
