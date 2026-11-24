'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a debounced copy of `value` (default 400ms).
 *
 * `value` tiene que ser estable entre renders (un estado, o un `useMemo`): un objeto armado en el render es nuevo cada
 * vez, el efecto lo «cambia» a los 400 ms y la pantalla se redibuja sin parar (WO to be Billed, 24/11/2026: perdía la
 * selección de la tabla). Lo controla `e2e/wo-to-be-billed.spec.ts` (la pantalla quieta no cambia).
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
