'use client'

import { useCallback } from 'react'
import {
  useForm,
  type FieldErrors,
  type FieldValues,
  type Path,
  type SubmitHandler,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form'

/**
 * Formulario común de Pro: al enviar con un campo con error, la pantalla va al PRIMER campo con
 * problema (en el orden del DOM), queda a la vista y recibe el foco. Vale también para los errores
 * que devuelve el backend (`validationErrors[{ field, message }]`) y para los botones fuera del
 * `<form>` (un `<button form="id">` dispara el mismo submit).
 *
 * Cómo encuentra el campo: `[name="path"]` (inputs de RHF) o `[data-field="path"]` (combos, tiles y
 * cualquier control que no sea un input nativo; el atributo va en el contenedor o en el trigger).
 * Regla global «Todo form lleva la pantalla al campo que falta» (Ignacio, 31/10/2026).
 */

function flattenErrorPaths(errors: FieldErrors, prefix = ''): string[] {
  const out: string[] = []
  for (const [key, value] of Object.entries(errors)) {
    if (!value) continue
    const path = prefix ? `${prefix}.${key}` : key
    const v = value as { message?: unknown; type?: unknown; ref?: unknown }
    if (typeof v.message === 'string' || v.ref !== undefined || typeof v.type === 'string') {
      out.push(path)
    }
    if (typeof value === 'object' && !('ref' in v && v.ref)) {
      // Nested object / array of errors (e.g. branches.12.percentage).
      const nested = value as unknown as FieldErrors
      const children = flattenErrorPaths(nested, path).filter((p) => p !== path)
      out.push(...children)
    }
  }
  return out
}

const FOCUSABLE = 'input, select, textarea, button, [tabindex]:not([tabindex="-1"]), [role="combobox"]'

function findFieldElement(path: string, root: ParentNode): HTMLElement | null {
  // `:not(meta)`: un campo «description» encontraba primero el `<meta name="description">` del head.
  const selector = `[name="${CSS.escape(path)}"]:not(meta), [data-field="${CSS.escape(path)}"]`
  const el = root.querySelector<HTMLElement>(selector)
  if (!el) return null
  if (el.matches(FOCUSABLE) && !el.matches('[disabled]')) return el
  return el.querySelector<HTMLElement>(FOCUSABLE) ?? el
}

/** Lleva la pantalla al primer campo con error (orden del DOM) y le da el foco. */
export function focusFirstInvalidField(errors: FieldErrors, root: ParentNode = document): boolean {
  if (typeof document === 'undefined') return false
  const paths = flattenErrorPaths(errors)
  if (paths.length === 0) return false
  const candidates = paths
    .map((p) => findFieldElement(p, root))
    .filter((el): el is HTMLElement => el !== null)
  if (candidates.length === 0) return false
  // Primer campo en el orden del DOM, no en el orden de los errores.
  const first = candidates.reduce((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? b : a,
  )
  // En el frame siguiente, con los mensajes de error ya pintados, y sin animación: un scroll suave que
  // arranca antes de que aparezcan los mensajes termina corrido y deja el campo fuera de la pantalla
  // (e2e de Expenses en celular, 12/11/2026).
  window.setTimeout(() => {
    first.scrollIntoView({ block: 'center' })
    // Después del scroll, así el foco no lo pisa (`preventScroll` mantiene el centrado).
    first.focus({ preventScroll: true })
    if (!first.matches(FOCUSABLE)) first.setAttribute('tabindex', '-1')
  }, 0)
  return true
}

export interface ServerValidationError {
  field: string
  message: string
}

export interface UseFormWithFocusReturn<T extends FieldValues> {
  form: UseFormReturn<T>
  /** `form.handleSubmit` con el `onInvalid` que enfoca el primer campo con error. */
  handleSubmit: (onValid: SubmitHandler<T>) => (e?: React.BaseSyntheticEvent) => Promise<void>
  /**
   * Asigna los errores del backend a sus campos (`setError`) y enfoca el primero. Devuelve true si
   * había errores de campo; false para que quien llama muestre el mensaje general (toast).
   */
  applyServerErrors: (errors: ServerValidationError[] | undefined, mapField?: (f: string) => string) => boolean
}

export function useFormWithFocus<T extends FieldValues>(props: UseFormProps<T>): UseFormWithFocusReturn<T> {
  // `shouldFocusError: false`: el foco propio de RHF corre después de `onInvalid` y se lleva el foco al
  // primer input registrado con ref, salteando los combos (Company vacío → foco en Total amount).
  const form = useForm<T>({ ...props, shouldFocusError: false })

  const handleSubmit = useCallback(
    (onValid: SubmitHandler<T>) =>
      form.handleSubmit(onValid, (errors) => {
        // Un error sin campo en pantalla deja Save mudo: que se vea en la consola al desarrollar.
        if (!focusFirstInvalidField(errors) && process.env.NODE_ENV !== 'production') {
          console.error('Form error on a field that is not on screen:', Object.keys(errors), errors)
        }
      }),
    [form],
  )

  const applyServerErrors = useCallback(
    (errors: ServerValidationError[] | undefined, mapField?: (f: string) => string) => {
      if (!errors || errors.length === 0) return false
      let applied = 0
      for (const err of errors) {
        const field = (mapField ? mapField(err.field) : err.field) as Path<T>
        if (!field) continue
        form.setError(field, { type: 'server', message: err.message })
        applied += 1
      }
      if (applied === 0) return false
      // Los errores ya están en el estado: enfocar en el siguiente frame, con el DOM pintado.
      window.setTimeout(() => focusFirstInvalidField(form.formState.errors), 0)
      return true
    },
    [form],
  )

  return { form, handleSubmit, applyServerErrors }
}
