import * as fs from 'fs'
import * as path from 'path'

import { InvoiceExportMailBodyDto, parseInvoiceExportEmails } from './dto/invoice-export.dto'
import {
  EMAIL_LIST_MESSAGES,
  EMAIL_OR_EMPTY_PATTERN,
  checkEmailList,
  checkOptionalEmail,
  type EmailListError,
} from './email-list'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'

/** Casos compartidos con el front (vitest lee el mismo archivo: frontend/lib/validation/email-list.test.ts). */
const CASES_PATH = path.resolve(__dirname, '../../../../shared/email-list-cases.json')

type Cases = {
  bad: { value: string; error: EmailListError }[]
  good: { value: string; emails: string[] }[]
  singleBad: string[]
  singleGood: string[]
}

const cases = JSON.parse(fs.readFileSync(CASES_PATH, 'utf8')) as Cases

describe('checkEmailList (pair of the front)', () => {
  it.each(cases.bad)('rejects $value as $error', ({ value, error }) => {
    expect(checkEmailList(value)).toEqual({ ok: false, error })
    expect(parseInvoiceExportEmails(value)).toBeNull()
  })
  it.each(cases.good)('accepts $value', ({ value, emails }) => {
    expect(checkEmailList(value)).toEqual({ ok: true, emails })
    expect(parseInvoiceExportEmails(value)).toEqual(emails)
  })
  it('every error has its message', () => {
    for (const c of cases.bad) expect(EMAIL_LIST_MESSAGES[c.error]).toBeTruthy()
  })
})

describe('Reply-To (checkOptionalEmail and the DTO pattern)', () => {
  it.each(cases.singleBad)('rejects %p', (value) => {
    expect(checkOptionalEmail(value)).not.toBeNull()
  })
  it.each(cases.singleGood)('accepts %p', (value) => {
    expect(checkOptionalEmail(value)).toBeNull()
    expect(EMAIL_OR_EMPTY_PATTERN.test(value)).toBe(true)
  })
  it('the DTO rejects an invalid Reply-To and accepts an empty one', () => {
    const errorsOf = (replyTo: string) =>
      validateSync(plainToInstance(InvoiceExportMailBodyDto, { exportType: 1, emailTo: 'a@b.com', replyTo })).filter(
        (e) => e.property === 'replyTo',
      )
    expect(errorsOf('a@b')).toHaveLength(1)
    expect(errorsOf('')).toHaveLength(0)
    expect(errorsOf('a@b.com')).toHaveLength(0)
  })
})
