/**
 * El clic en el cuerpo de una caja que lleva a otra pantalla (tarjeta del Dashboard, fila de una tabla) pasa por su
 * enlace (plans/plan-buenas-practicas-v0, 4.4). La caja tiene adentro un `<AppLink>` real (título o primera celda) y
 * este helper decide qué hace un clic que cae en otra parte de la caja:
 *
 * - clic izquierdo sin modificadores → `anchor.click()`: navega en la misma pestaña y corre el `onNavigate` del enlace
 *   (que fija los filtros);
 * - con Ctrl, Cmd o Shift, o con el botón del medio (`auxclick`, `button === 1`) → `window.open(href, '_blank',
 *   'noopener')` **sin** `onNavigate`: la otra pestaña abre sin los filtros del clic y la actual no cambia (D12).
 *   `anchor.click()` no sirve acá: crea otro evento sin modificadores
 *   (https://html.spec.whatwg.org/multipage/interaction.html#dom-click) y Next navegaría en la misma pestaña;
 * - no navega si el clic cae sobre un botón, un enlace o un control propio (ayuda `?`, monto completo, el enlace mismo,
 *   que hace lo suyo de forma nativa), fuera de la caja (contenido en un portal, como un popover), con Alt (en un
 *   enlace es «descargar») o con texto seleccionado (se estaba copiando, no yendo).
 *
 * El enlace de la caja se marca con un atributo (`data-card-link`, `data-row-link`) y se busca con su selector.
 */

/** Lo que cuenta como control propio: un clic ahí no es de la caja. */
export const BOX_LINK_INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[contenteditable="true"]',
].join(', ')

/** El evento que recibe el helper: el `MouseEvent` de React o el del DOM. */
export interface BoxLinkEvent {
  button: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
  target: EventTarget | null
  currentTarget: EventTarget | null
}

export type BoxLinkAction = 'none' | 'same-tab' | 'new-tab'

/** Lo que se lee del navegador; los tests pasan el suyo. */
export interface BoxLinkEnv {
  selectedText: () => string
  openInNewTab: (href: string) => void
}

const browserEnv: BoxLinkEnv = {
  selectedText: () => (typeof window === 'undefined' ? '' : (window.getSelection()?.toString() ?? '')),
  openInNewTab: (href) => {
    window.open(href, '_blank', 'noopener')
  },
}

/** Qué hacer con el clic, sin tocar nada. `clickedOwnControl`: el clic cayó en un control propio o fuera de la caja. */
export function boxLinkAction(
  event: Pick<BoxLinkEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>,
  clickedOwnControl: boolean,
  selectedText: string,
): BoxLinkAction {
  if (event.defaultPrevented || clickedOwnControl) return 'none'
  if (event.button === 1) return 'new-tab'
  if (event.button !== 0 || event.altKey) return 'none'
  if (event.ctrlKey || event.metaKey || event.shiftKey) return 'new-tab'
  // Shift+clic extiende la selección por sí mismo; por eso la selección se mira recién acá.
  if (selectedText.trim() !== '') return 'none'
  return 'same-tab'
}

function isElement(value: EventTarget | null): value is Element {
  return value !== null && typeof (value as Element).closest === 'function'
}

/**
 * Lleva el clic (o el `auxclick`) en el cuerpo de la caja a su enlace. Se pone en `onClick` y en `onAuxClick` de la
 * caja. Devuelve lo que hizo.
 */
export function activateBoxLink(
  event: BoxLinkEvent,
  linkSelector: string,
  env: BoxLinkEnv = browserEnv,
): BoxLinkAction {
  const box = event.currentTarget
  if (!isElement(box)) return 'none'
  const target = event.target
  const control = isElement(target) ? target.closest(BOX_LINK_INTERACTIVE_SELECTOR) : null
  const outside = !isElement(target) || !box.contains(target)
  const ownControl = outside || (control !== null && control !== box && box.contains(control))
  const action = boxLinkAction(event, ownControl, env.selectedText())
  if (action === 'none') return 'none'
  const anchor = box.querySelector<HTMLAnchorElement>(linkSelector)
  if (!anchor) return 'none'
  if (action === 'same-tab') anchor.click()
  else env.openInNewTab(anchor.href)
  return action
}

/** Atributo del enlace de una tarjeta (`KPICard`). */
export const CARD_LINK_ATTR = 'data-card-link'
/** Atributo del enlace de una fila (`DataTable` con `rowLink`). */
export const ROW_LINK_ATTR = 'data-row-link'
export const CARD_LINK_SELECTOR = `a[${CARD_LINK_ATTR}]`
export const ROW_LINK_SELECTOR = `a[${ROW_LINK_ATTR}]`
