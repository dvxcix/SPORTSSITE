/** NBA research remains admin-only while the product is being polished. */
export function hasNbaAccess(accountType: string | null | undefined) {
  return accountType === 'admin'
}

/** Shared by navigation/search visibility; server routes still authorize independently. */
export function isNbaToolHref(href: string) {
  const path = href.split(/[?#]/, 1)[0]
  return path === '/the-paint' || path.startsWith('/the-paint/') || path === '/nba' || path.startsWith('/nba/')
}
