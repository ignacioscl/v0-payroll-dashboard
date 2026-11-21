import { describe, expect, it } from 'vitest'

import { attachmentTypeFromName, withUploadedFile } from './expense-attachments'

describe('withUploadedFile', () => {
  it('adds the uploaded file to a list that does not have it yet', () => {
    expect(withUploadedFile(['a.pdf'], 'b.pdf')).toEqual(['a.pdf', 'b.pdf'])
    expect(withUploadedFile([], 'b.pdf')).toEqual(['b.pdf'])
    expect(withUploadedFile(undefined, 'b.pdf')).toEqual(['b.pdf'])
  })

  it('does not repeat a file already in the list', () => {
    expect(withUploadedFile(['b.pdf'], 'b.pdf')).toEqual(['b.pdf'])
  })
})

describe('attachmentTypeFromName (Duplicate, tema 9)', () => {
  it('pdf, png y el resto como JPEG, que es como el Node guarda las imágenes', () => {
    expect(attachmentTypeFromName('ticket.PDF')).toBe('application/pdf')
    expect(attachmentTypeFromName('a.png')).toBe('image/png')
    expect(attachmentTypeFromName('1731000000.jpg')).toBe('image/jpeg')
    expect(attachmentTypeFromName('sin-extension')).toBe('image/jpeg')
  })
})
