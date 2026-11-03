import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { SearchableCombobox } from '@/components/shared/searchable-combobox'

/** El combo común se monta antes de que lleguen los datos: `items` es `undefined` hasta que responde la consulta. */
describe('SearchableCombobox sin items todavía', () => {
  it('no se rompe mientras la lista no llegó', () => {
    const render = () =>
      renderToStaticMarkup(
        React.createElement(SearchableCombobox<{ id: number; name: string }>, {
          value: null,
          onChange: () => {},
          searchTerm: '',
          onSearchTermChange: () => {},
          items: undefined,
          isLoading: true,
          getItemKey: (r) => r.id,
          getItemLabel: (r) => r.name,
        }),
      )
    expect(render).not.toThrow()
  })
})
