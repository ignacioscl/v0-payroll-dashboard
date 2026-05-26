export interface SrsSessionUser {
  id: number
  nombre: string
  email: string
  codigoInterno: string
  idUsuarioRolrel: number | null
  idDealer: number | null
  dealerName: string | null
  idDealerProvider: number | null
  rolesRelCount?: number
  isCompanyTypeCompany?: boolean
  thumbnailUuid?: string | null
  logoImg?: string | null
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
  isCompanyTypeCompany: boolean
  isSystemAdmin: boolean
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

export interface SrsExchangeResponse {
  status: 'success' | 'fail'
  error?: { code: string; message: string }
  data?: {
    token: string
    user: SrsSessionUser
  }
}
