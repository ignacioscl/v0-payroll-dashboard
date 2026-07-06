/** Fixed dashboard header height (`h-16`). */
export const DASHBOARD_NAV_HEIGHT = 64

/**
 * Scrolls the page so `element` sits flush below the fixed nav, letting a
 * bounded table fill the remaining viewport height.
 */
export function scrollElementBelowNav(
  element: HTMLElement,
  navHeight = DASHBOARD_NAV_HEIGHT,
  behavior: ScrollBehavior = 'smooth',
): void {
  const top = element.getBoundingClientRect().top + window.scrollY - navHeight
  window.scrollTo({ top: Math.max(0, top), behavior })
}
