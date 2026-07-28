import type { AppLocale } from '@/lib/i18n/locale'

export type { AppLocale }

export interface SrsSessionUser {
  id: number
  nombre: string
  email: string
  codigoInterno: string
  idUsuarioRolrel: number | null
  idDealer: number | null
  dealerName: string | null
  idDealerProvider: number | null
  providerName?: string | null
  /** contratista.logo_img — tenant logo shown in the sidebar rail. */
  providerLogoImg?: string | null
  rolesRelCount?: number
  isCompanyTypeCompany?: boolean
  thumbnailUuid?: string | null
  logoImg?: string | null
  /** Legacy vhost where the user opened v0 (e.g. https://mooi.srssuite.com). */
  legacyOrigin?: string | null
}

export interface SrsMeUser {
  id: number
  nombre: string
  email: string
  codigoInterno: string
  thumbnailUuid: string | null
  logoImg: string | null
  idRolSystemV2: number | null
  rolSystemV2Name: string | null
  idDealer: number | null
  dealerName: string | null
  idDealerProvider: number | null
  providerName?: string | null
  /** contratista.logo_img — tenant logo shown in the sidebar rail. */
  providerLogoImg?: string | null
  isCompanyTypeCompany: boolean
  isSystemAdmin: boolean
  navTemplate?: 1 | 2
  locale?: AppLocale
}

export interface SrsPermission {
  id: number
  nombre: string
}

export interface SrsMeData {
  user: SrsMeUser
  permissionIds: number[]
  permissions: SrsPermission[]
}

export interface SrsMeResponse {
  status: 'success' | 'fail'
  error?: { code: string; message: string }
  data?: SrsMeData
}

export interface SrsMeApiResponse {
  authenticated: boolean
  user?: SrsMeUser
  permissionIds?: number[]
  permissions?: SrsPermission[]
  error?: string
}

export interface SrsSession {
  token: string
  user: SrsSessionUser
}

/** One row in the v0 dealer/role picker (matches Legacy modal). */
export interface SrsLoginRoleOption {
  id: number
  rolName: string
  dealerName: string
  companyName: string
  departmentName: string | null
  logoUrl: string | null
}

export interface SrsLoginSuccessData {
  token: string
  user: SrsSessionUser
}

export interface SrsLoginRoleSelectionData {
  needsRoleSelection: true
  rolesRel: SrsLoginRoleOption[]
}

export type SrsLoginData = SrsLoginSuccessData | SrsLoginRoleSelectionData

export function isLoginRoleSelection(
  data: SrsLoginData | undefined
): data is SrsLoginRoleSelectionData {
  return Boolean(data && 'needsRoleSelection' in data && data.needsRoleSelection)
}

export interface SrsExchangeResponse {
  status: 'success' | 'fail'
  error?: { code: string; message: string }
  data?: SrsLoginData
}
