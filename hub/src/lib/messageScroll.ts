/** Scroll only the conversation pane, preserving the page header and composer. */
export function scrollMessagePane(viewport: HTMLElement | null, target?: HTMLElement | null, behavior: ScrollBehavior = 'auto') {
  if (!viewport || target === null || target && !viewport.contains(target)) return
  const reduced = viewport.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const top = target
    ? viewport.scrollTop + target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (viewport.clientHeight - target.clientHeight) / 2
    : viewport.scrollHeight
  const boundedTop = Math.max(0, top)
  if (typeof viewport.scrollTo === 'function') viewport.scrollTo({ top: boundedTop, behavior: reduced ? 'auto' : behavior })
  else viewport.scrollTop = boundedTop
}
