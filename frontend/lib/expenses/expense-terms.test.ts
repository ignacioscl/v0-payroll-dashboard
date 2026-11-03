import { describe, expect, it } from 'vitest'

import { en } from '@/lib/i18n/messages/en'

function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(texts)
  return []
}

describe('textos de Pro en inglés', () => {
  it('dicen «dealer», nunca «branch» (regla form-dialog-layout)', () => {
    expect(texts(en).filter((text) => /\bbranch(es)?\b/i.test(text))).toEqual([])
  })
})
