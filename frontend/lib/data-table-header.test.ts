/**
 * Todas las tablas con la misma letra en los títulos de columna (24/11/2026: WO to be Billed salió con títulos en otra
 * letra que Invoices, porque pasaba el título como texto suelto y el encabezado común, sin orden ni ocultar, lo dibujaba
 * sin mayúsculas). Dos controles:
 * - el encabezado común (`DataTableColumnHeader`) dibuja el título igual en todos sus casos;
 * - `DataTable` pasa un título de texto suelto por ese encabezado.
 */
import fs from 'node:fs'
import path from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DataTableColumnHeader } from '../components/shared/data-table/data-table-column-header'

const TITLE = ['text-xs', 'font-semibold', 'uppercase', 'tracking-wide']

function fakeColumn(opts: { sort?: boolean; hide?: boolean }) {
  return {
    columnDef: { meta: {} },
    getCanSort: () => Boolean(opts.sort),
    getCanHide: () => Boolean(opts.hide),
    getIsSorted: () => false,
    toggleSorting: () => undefined,
    clearSorting: () => undefined,
    toggleVisibility: () => undefined,
  } as never
}

/** Las clases del elemento que contiene el título. */
function titleClasses(html: string, title: string): string[] {
  const re = new RegExp(`<(\\w+)[^>]*class="([^"]*)"[^>]*>(?:<span>)?${title}<`)
  const m = re.exec(html)
  return m ? m[2].split(/\s+/) : []
}

describe('títulos de columna', () => {
  for (const [name, opts] of [
    ['sin orden ni ocultar', {}],
    ['con orden', { sort: true }],
    ['solo ocultar', { hide: true }],
  ] as const) {
    it(`${name}: misma letra (${TITLE.join(' ')})`, () => {
      const html = renderToStaticMarkup(React.createElement(DataTableColumnHeader, { column: fakeColumn(opts), title: 'Price' }))
      const classes = titleClasses(html, 'Price')
      for (const c of TITLE) expect(classes, html).toContain(c)
    })
  }

  it('DataTable pasa un título de texto suelto por el encabezado común', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../components/shared/data-table/data-table.tsx'), 'utf8')
    expect(src).toMatch(/typeof header\.column\.columnDef\.header === 'string' \? \(\s*(?:\/\/[^\n]*\n\s*)*<DataTableColumnHeader/)
  })
})
