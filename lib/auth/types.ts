export interface SrsSessionUser {
  id: number
  nombre: string
  email: string
  codigoInterno: string
  idUsuarioRolrel: number | null
  idDealer: number | null
  dealerName: string | null
  idDealerProvider: number | null
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
