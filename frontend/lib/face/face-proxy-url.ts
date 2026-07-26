/** Same-origin URL for face-recognition via `/api/face/[...path]`. */
export function faceProxyUrl(path: string) {
  const normalized = path.replace(/^\//, '')
  return `/api/face/${normalized}`
}

/** SRS default employee avatar (muñequito gris). */
export const DEFAULT_EMPLOYEE_AVATAR_URL = '/api/srs/img/foto-perfil.jpg'

export function legacyLogoUrl(logoImg: string | null | undefined): string | null {
  if (!logoImg || !logoImg.trim()) {
    return null
  }
  return `/api/srs/uploads/${encodeURIComponent(logoImg.trim())}`
}

/** Tenant logo (contratista.logo_img). Null when the tenant has none loaded. */
export function providerLogoUrl(
  user: { providerLogoImg?: string | null } | null | undefined,
): string | null {
  return legacyLogoUrl(user?.providerLogoImg)
}

export function userAvatarUrl(user: {
  thumbnailUuid?: string | null
  logoImg?: string | null
} | null | undefined): string {
  if (!user) {
    return DEFAULT_EMPLOYEE_AVATAR_URL
  }
  if (user.thumbnailUuid) {
    return employeeThumbnailUrl(user.thumbnailUuid)
  }
  return legacyLogoUrl(user.logoImg) ?? DEFAULT_EMPLOYEE_AVATAR_URL
}

export function employeeThumbnailUrl(thumbnailUuid: string | null | undefined): string {
  if (!thumbnailUuid) {
    return DEFAULT_EMPLOYEE_AVATAR_URL
  }
  return faceProxyUrl(`api/employeeThumbnail/${encodeURIComponent(thumbnailUuid)}`)
}

export function employeePunchPreviewUrl(logId: number | string): string {
  return faceProxyUrl(`api/employeePunchPreview/${encodeURIComponent(String(logId))}`)
}

/** Legacy `ttk_main` → `node-face-recognition…/images/getImagePunch/{validationLogId}`. */
export function facePunchImageUrl(validationLogId: number | string): string {
  return faceProxyUrl(`images/getImagePunch/${encodeURIComponent(String(validationLogId))}`)
}
