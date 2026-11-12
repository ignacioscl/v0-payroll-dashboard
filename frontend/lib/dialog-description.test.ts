/**
 * Diálogos sin descripción (plans/plan-buenas-practicas-v0, etapa 1, T9).
 *
 * Radix avisa en la consola por cada `DialogContent` / `SheetContent` / `AlertDialogContent` sin su
 * `…Description`. La doc (https://www.radix-ui.com/primitives/docs/components/dialog) indica pasar
 * `aria-describedby={undefined}` cuando no hay descripción. Este test lee el código y falla si un archivo fuera
 * de `components/ui/` abre uno de esos `…Content` sin `…Description` ni `aria-describedby`.
 */
import { describe, expect, it } from 'vitest'

import { listSourceFiles, readSource } from './testing/import-graph'

const CONTENT_TAG = /<(DialogContent|SheetContent|AlertDialogContent)\b([^>]*)>/g

/** `…Content` que no llevan descripción, con archivo y línea. */
export function contentsWithoutDescription(code: string): number[] {
  const lines: number[] = []
  for (const m of code.matchAll(CONTENT_TAG)) {
    const tag = m[1]
    const attrs = m[2]
    if (/aria-describedby\s*=/.test(attrs)) continue
    const closing = `</${tag}>`
    const end = code.indexOf(closing, m.index!)
    const body = end === -1 ? '' : code.slice(m.index!, end)
    const descriptionTag = tag.replace('Content', 'Description')
    if (new RegExp(`<${descriptionTag}\\b`).test(body)) continue
    lines.push(code.slice(0, m.index!).split('\n').length)
  }
  return lines
}

describe('diálogos sin descripción', () => {
  it('todo DialogContent / SheetContent / AlertDialogContent tiene su descripción o aria-describedby', () => {
    const missing: string[] = []
    for (const file of listSourceFiles()) {
      if (!file.endsWith('.tsx') || file.startsWith('components/ui/')) continue
      for (const line of contentsWithoutDescription(readSource(file))) missing.push(`${file}:${line}`)
    }
    expect(missing).toEqual([])
  })
})

describe('el detector', () => {
  it('marca el Content sin descripción y deja pasar los que la tienen', () => {
    const code = [
      '<DialogContent className="x">',
      '  <DialogTitle>A</DialogTitle>',
      '</DialogContent>',
      '<SheetContent side="right">',
      '  <SheetTitle>B</SheetTitle>',
      '  <SheetDescription>b</SheetDescription>',
      '</SheetContent>',
      '<AlertDialogContent aria-describedby={undefined}>',
      '  <AlertDialogTitle>C</AlertDialogTitle>',
      '</AlertDialogContent>',
    ].join('\n')
    expect(contentsWithoutDescription(code)).toEqual([1])
  })

  it('una descripción de otro diálogo más abajo no cuenta', () => {
    const code = [
      '<DialogContent>',
      '  <DialogTitle>A</DialogTitle>',
      '</DialogContent>',
      '<DialogContent>',
      '  <DialogDescription>b</DialogDescription>',
      '</DialogContent>',
    ].join('\n')
    expect(contentsWithoutDescription(code)).toEqual([1])
  })
})
