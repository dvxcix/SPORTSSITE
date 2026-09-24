// NFL tools include Ultimate memberships and explicit NFL beta grants.
// The general beta flag and account-type strings must not imply a paid tier.
export function hasNflAccess(accountType: string | null | undefined, granted: boolean, tier?: string | null): boolean {
  return accountType === 'admin' || granted === true || tier === 'ultimate'
}

export function isNflToolHref(href: string): boolean {
  const path = href.split('?')[0]
  return path === '/the-sideline' || path.startsWith('/the-sideline/')
}
