import type { SrsMeData, SrsMeUser, SrsPermission } from './types'

/**
 * Clave y forma de los datos de `/me` en la caché de TanStack Query (plans/plan-buenas-practicas-v0, 4.5). Sin
 * `'use client'`: la usa también el layout del panel (servidor) para sembrar la caché con la respuesta de `me.php` que
 * ya pidió, así el menú llega lleno y el navegador no vuelve a pedir `/api/auth/me` al cargar.
 */
export const meQueryKey = ['auth', 'me'] as const

export interface MeQueryData {
  user: SrsMeUser
  permissionIds: number[]
  permissions: SrsPermission[]
}

export function toMeQueryData(data: {
  user: SrsMeUser
  permissionIds?: number[] | null
  permissions?: SrsPermission[] | null
}): MeQueryData {
  return {
    user: data.user,
    permissionIds: data.permissionIds ?? [],
    permissions: data.permissions ?? [],
  }
}

export type { SrsMeData }
