'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'srs.hint.dismissed.'

/**
 * Ayudas que el usuario puede apagar con "no volver a mostrar".
 *
 * Va en `localStorage`, no en cookie ni en estado: tiene que sobrevivir a
 * recargas y a abrir otra pestaña, y no tiene por qué viajar al servidor en cada
 * request. Dura hasta que el usuario borre los datos del navegador.
 *
 * El evento `storage` sincroniza las pestañas YA abiertas (sólo se dispara en
 * las otras, no en la que escribió), así que apagar la ayuda en una la apaga en
 * todas sin recargar.
 */
export function useDismissibleHint(key: string) {
  const storageKey = `${STORAGE_PREFIX}${key}`

  // Arranca en `false` siempre: leer localStorage durante el render rompe la
  // hidratación (el server no lo tiene). Se lee después de montar.
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(readDismissed(storageKey))

    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return
      setDismissed(e.newValue === '1')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch {
      // Modo incógnito o storage bloqueado: la ayuda simplemente vuelve a
      // aparecer en la próxima sesión. No es motivo para romper nada.
    }
  }, [storageKey])

  const restore = useCallback(() => {
    setDismissed(false)
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* idem */
    }
  }, [storageKey])

  return { dismissed, dismiss, restore }
}

function readDismissed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}
