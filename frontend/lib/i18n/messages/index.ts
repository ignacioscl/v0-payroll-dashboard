import { en, type Messages } from './en'
import { es } from './es'
import type { AppLocale } from '../locale'

const catalogs: Record<AppLocale, Messages> = { en, es }

/** Dot-separated path into the message catalog, e.g. `punch.report`. */
export type MessageKey = string

export function getMessages(locale: AppLocale): Messages {
  return catalogs[locale] ?? en
}

function getNestedString(obj: unknown, path: string): string | undefined {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || !(part in current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

/** Replace `{name}`-style placeholders in translated strings. */
export function formatMessage(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`,
  )
}

export function translate(
  locale: AppLocale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const messages = getMessages(locale)
  const value = getNestedString(messages, key)
  if (value === undefined) return key
  return formatMessage(value, params)
}

export type { Messages }
