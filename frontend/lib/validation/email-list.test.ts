/**
 * Pareja de backend/src/srs/billing/email-list.spec.ts (jest): los dos leen shared/email-list-cases.json.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkEmailList, checkOptionalEmail, type EmailListError } from './email-list'

type Cases = {
  bad: { value: string; error: EmailListError }[]
  good: { value: string; emails: string[] }[]
  singleBad: string[]
  singleGood: string[]
}

const cases = JSON.parse(readFileSync(resolve(__dirname, '../../../shared/email-list-cases.json'), 'utf8')) as Cases

describe('checkEmailList', () => {
  it.each(cases.bad)('rejects $value as $error', ({ value, error }) => {
    expect(checkEmailList(value)).toEqual({ ok: false, error })
  })
  it.each(cases.good)('accepts $value', ({ value, emails }) => {
    expect(checkEmailList(value)).toEqual({ ok: true, emails })
  })
  it('null or undefined is required', () => {
    expect(checkEmailList(null)).toEqual({ ok: false, error: 'required' })
    expect(checkEmailList(undefined)).toEqual({ ok: false, error: 'required' })
  })
})

describe('checkOptionalEmail (Reply-To)', () => {
  it.each(cases.singleBad)('rejects %p', (value) => {
    expect(checkOptionalEmail(value)).not.toBeNull()
  })
  it.each(cases.singleGood)('accepts %p', (value) => {
    expect(checkOptionalEmail(value)).toBeNull()
  })
})
