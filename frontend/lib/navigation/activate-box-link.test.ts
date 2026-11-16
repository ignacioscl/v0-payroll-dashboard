/**
 * El clic en el cuerpo de una caja pasa por su enlace (plans/plan-buenas-practicas-v0, 4.4): clic normal → la misma
 * pestaña con `onNavigate`; Ctrl/Cmd/Shift o el botón del medio → otra pestaña sin `onNavigate`; un control propio,
 * algo de afuera de la caja o texto seleccionado → nada.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  activateBoxLink,
  boxLinkAction,
  BOX_LINK_INTERACTIVE_SELECTOR,
  CARD_LINK_SELECTOR,
  type BoxLinkEvent,
} from './activate-box-link'

/** Un elemento de mentira: `closest` sube por `parent`, `contains` también; sin DOM (vitest corre en node). */
class FakeElement {
  children: FakeElement[] = []
  clicks = 0
  constructor(
    readonly tag: string,
    readonly attrs: Record<string, string> = {},
    readonly parent: FakeElement | null = null,
  ) {
    parent?.children.push(this)
  }
  get href() {
    return `http://pro.srs.com${this.attrs.href ?? ''}`
  }
  click() {
    this.clicks++
  }
  matches(selector: string): boolean {
    return selector.split(',').some((part) => {
      const s = part.trim()
      const m = /^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/.exec(s)
      if (!m) return false
      const [, tag, attr, value] = m
      if (tag && tag !== this.tag) return false
      if (attr && !(attr in this.attrs)) return false
      if (attr && value !== undefined && this.attrs[attr] !== value) return false
      return true
    })
  }
  closest(selector: string): FakeElement | null {
    if (this.matches(selector)) return this
    return this.parent ? this.parent.closest(selector) : null
  }
  contains(other: FakeElement | null): boolean {
    for (let el = other; el; el = el.parent) if (el === this) return true
    return false
  }
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (child.matches(selector)) return child
      const found = child.querySelector(selector)
      if (found) return found
    }
    return null
  }
}

function card() {
  const box = new FakeElement('div')
  const title = new FakeElement('p', {}, box)
  const link = new FakeElement('a', { href: '/issues', 'data-card-link': '' }, title)
  const body = new FakeElement('span', {}, box)
  const help = new FakeElement('button', {}, box)
  const helpIcon = new FakeElement('svg', {}, help)
  return { box, link, body, help, helpIcon }
}

function evt(box: FakeElement, target: FakeElement, over: Partial<BoxLinkEvent> = {}): BoxLinkEvent {
  return {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    currentTarget: box as unknown as EventTarget,
    target: target as unknown as EventTarget,
    ...over,
  }
}

function env(selected = '') {
  return { selectedText: () => selected, openInNewTab: vi.fn<(href: string) => void>() }
}

describe('boxLinkAction', () => {
  const base = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false }

  it('plain left click → same tab', () => {
    expect(boxLinkAction(base, false, '')).toBe('same-tab')
  })
  it('Ctrl, Cmd or Shift → new tab', () => {
    expect(boxLinkAction({ ...base, ctrlKey: true }, false, '')).toBe('new-tab')
    expect(boxLinkAction({ ...base, metaKey: true }, false, '')).toBe('new-tab')
    expect(boxLinkAction({ ...base, shiftKey: true }, false, 'text selected by the shift click')).toBe('new-tab')
  })
  it('middle button → new tab', () => {
    expect(boxLinkAction({ ...base, button: 1 }, false, '')).toBe('new-tab')
  })
  it('right button, Alt, own control, prevented or selected text → nothing', () => {
    expect(boxLinkAction({ ...base, button: 2 }, false, '')).toBe('none')
    expect(boxLinkAction({ ...base, altKey: true }, false, '')).toBe('none')
    expect(boxLinkAction(base, true, '')).toBe('none')
    expect(boxLinkAction({ ...base, button: 1 }, true, '')).toBe('none')
    expect(boxLinkAction({ ...base, defaultPrevented: true }, false, '')).toBe('none')
    expect(boxLinkAction(base, false, 'Mike Rezi Nissan')).toBe('none')
  })
})

describe('activateBoxLink', () => {
  it('a plain click on the body clicks the link (same tab, runs onNavigate)', () => {
    const { box, link, body } = card()
    const e = env()
    expect(activateBoxLink(evt(box, body), CARD_LINK_SELECTOR, e)).toBe('same-tab')
    expect(link.clicks).toBe(1)
    expect(e.openInNewTab).not.toHaveBeenCalled()
  })

  it('Cmd/Ctrl or middle click on the body opens the href in a new tab without clicking the link', () => {
    for (const over of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
      const { box, link, body } = card()
      const e = env()
      expect(activateBoxLink(evt(box, body, over), CARD_LINK_SELECTOR, e)).toBe('new-tab')
      expect(e.openInNewTab).toHaveBeenCalledWith('http://pro.srs.com/issues')
      expect(link.clicks).toBe(0)
    }
  })

  it('a click on the link itself is left to the link (no double navigation)', () => {
    const { box, link } = card()
    const e = env()
    expect(activateBoxLink(evt(box, link), CARD_LINK_SELECTOR, e)).toBe('none')
    expect(activateBoxLink(evt(box, link, { metaKey: true }), CARD_LINK_SELECTOR, e)).toBe('none')
    expect(link.clicks).toBe(0)
    expect(e.openInNewTab).not.toHaveBeenCalled()
  })

  it('a click on an own button (help ?, full amount) does not navigate', () => {
    const { box, link, helpIcon } = card()
    const e = env()
    expect(activateBoxLink(evt(box, helpIcon), CARD_LINK_SELECTOR, e)).toBe('none')
    expect(activateBoxLink(evt(box, helpIcon, { button: 1 }), CARD_LINK_SELECTOR, e)).toBe('none')
    expect(link.clicks).toBe(0)
    expect(e.openInNewTab).not.toHaveBeenCalled()
  })

  it('a click from outside the box (a portal, e.g. a popover) does not navigate', () => {
    const { box, link } = card()
    const portal = new FakeElement('div')
    const e = env()
    expect(activateBoxLink(evt(box, portal), CARD_LINK_SELECTOR, e)).toBe('none')
    expect(link.clicks).toBe(0)
  })

  it('with text selected the plain click does not navigate', () => {
    const { box, link, body } = card()
    expect(activateBoxLink(evt(box, body), CARD_LINK_SELECTOR, env('49'))).toBe('none')
    expect(link.clicks).toBe(0)
  })

  it('without a link in the box it does nothing', () => {
    const box = new FakeElement('tr')
    const cell = new FakeElement('td', {}, box)
    expect(activateBoxLink(evt(box, cell), CARD_LINK_SELECTOR, env())).toBe('none')
  })

  it('a box that is itself inside a role=button does not count that ancestor as an own control', () => {
    const outer = new FakeElement('div', { role: 'button' })
    const { box, link, body } = card()
    Object.assign(box, { parent: outer })
    expect(activateBoxLink(evt(box, body), CARD_LINK_SELECTOR, env())).toBe('same-tab')
    expect(link.clicks).toBe(1)
  })

  it('the own-control selector covers buttons, links and form controls', () => {
    for (const s of ['a[href]', 'button', 'input', 'label', '[role="button"]']) {
      expect(BOX_LINK_INTERACTIVE_SELECTOR).toContain(s)
    }
  })
})
