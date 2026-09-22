// Independent of subscription tiers and the general beta override.
export function hasNflAccess(accountType: string | null | undefined, granted: boolean): boolean {
  return accountType === 'admin' || granted === true
}

export function isNflToolHref(href: string): boolean {
  const path = href.split('?')[0]
  return path === '/the-sideline' || path.startsWith('/the-sideline/')
}
