import { describe, expect, it } from 'vitest'

import { withUploadedFile } from './expense-attachments'

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
