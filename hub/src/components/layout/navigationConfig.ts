import type { LucideIcon } from 'lucide-react'
import {
  Activity, AtSign, Award, Bell, Bookmark, BookOpen, ChartSpline, CloudSun, Coins,
  Compass, Crosshair, Flame, FlaskConical, Hash, History, Home, Layers3,
  LayoutGrid, Link2, MessageCircle, MessagesSquare, Search, Settings2,
  ShoppingBag, Table2, TrendingUp, Trophy, Users, Zap,
} from 'lucide-react'

export type ProductArea = 'social' | 'research' | 'community' | 'account' | 'commerce'

export type ProductNavItem = {
  href: string
  label: string
  shortLabel?: string
  icon: LucideIcon
  badge?: string
  ultimateOnly?: boolean
  matches?: readonly string[]
}

export const productAreaMeta: Record<ProductArea, { label: string; eyebrow: string; icon: LucideIcon }> = {
  social: { label: 'Home', eyebrow: 'Your network', icon: Home },
  research: { label: 'Research', eyebrow: 'Sports intelligence', icon: FlaskConical },
  community: { label: 'Community', eyebrow: 'Live conversations', icon: MessagesSquare },
  account: { label: 'Account', eyebrow: 'Your SlipSurge', icon: Settings2 },
  commerce: { label: 'Marketplace', eyebrow: 'Creators & tools', icon: ShoppingBag },
}

export const primaryNavigation: ProductNavItem[] = [
  { href: '/feed', label: 'Home', icon: Home, matches: ['/feed', '/explore', '/search', '/hashtag', '/post', '/profile', '/notifications'] },
  { href: '/dugout', label: 'Research', icon: FlaskConical, matches: ['/dugout', '/the-sideline', '/workspace', '/sports', '/batter-cost', '/odds-terminal', '/slate-breakdown', '/pitcher-report', '/weather-lab', '/synergy', '/daily-recap', '/spray-charts', '/the-public', '/nfl'] },
  { href: '/community', label: 'Community', icon: MessagesSquare, badge: 'LIVE', matches: ['/community', '/channels', '/messages', '/groups', '/forum', '/pages', '/events', '/blog'] },
  { href: '/picks', label: 'Picks', icon: TrendingUp, matches: ['/picks', '/bookmarks', '/missions', '/activity'] },
]

export const areaNavigation: Record<ProductArea, ProductNavItem[]> = {
  social: [
    { href: '/feed', label: 'Community Feed', icon: Home },
    { href: '/explore', label: 'Explore', icon: Compass },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/bookmarks', label: 'Saved', icon: Bookmark },
    { href: '/missions', label: 'Missions', icon: Award },
    { href: '/activity', label: 'Activity Replay', icon: History },
  ],
  research: [
    { href: '/sports', label: 'Live Scores', icon: Activity, badge: 'LIVE' },
    { href: '/workspace', label: 'Research Workspace', icon: Layers3 },
    { href: '/dugout', label: 'The Dugout · MLB', shortLabel: 'Dugout', icon: FlaskConical },
    { href: '/the-sideline', label: 'The Sideline · NFL', shortLabel: 'Sideline', icon: Trophy },
    { href: '/the-public', label: 'The Public', shortLabel: 'Public', icon: Users },
    { href: '/batter-cost', label: 'Batter Cost', icon: Coins },
    { href: '/odds-terminal', label: 'Odds Terminal', shortLabel: 'Terminal', icon: ChartSpline, badge: 'ULT' },
    { href: '/slate-breakdown', label: 'Slate Breakdown', shortLabel: 'Slate', icon: Table2 },
    { href: '/pitcher-report', label: 'Pitcher Report', icon: Compass },
    { href: '/weather-lab', label: 'Weather Lab', icon: CloudSun },
    { href: '/synergy', label: 'Synergy', icon: Link2 },
    { href: '/daily-recap', label: 'Daily Recap', shortLabel: 'Recap', icon: Flame },
    { href: '/spray-charts', label: 'Spray Charts', icon: Crosshair, badge: 'ULT', ultimateOnly: true },
  ],
  community: [
    { href: '/community', label: 'Community Home', icon: LayoutGrid },
    { href: '/channels', label: 'Live Channels', icon: Zap, badge: 'LIVE' },
    { href: '/messages', label: 'Direct Messages', icon: MessageCircle },
    { href: '/groups', label: 'Groups', icon: Users },
    { href: '/forum', label: 'Discussions', icon: Hash },
    { href: '/pages', label: 'Pages', icon: LayoutGrid },
    { href: '/events', label: 'Events', icon: Activity },
    { href: '/blog', label: 'Articles', icon: BookOpen },
  ],
  account: [
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/bookmarks', label: 'Saved', icon: Bookmark },
    { href: '/settings/connections', label: 'Connected Accounts', icon: AtSign },
    { href: '/settings', label: 'Settings', icon: Settings2 },
  ],
  commerce: [
    { href: '/marketplace', label: 'Matrix Marketplace', icon: ShoppingBag, badge: 'ULT', ultimateOnly: true },
    { href: '/pricing', label: 'Membership', icon: Award },
  ],
}

const routeAreas: Array<{ area: ProductArea; prefixes: readonly string[] }> = [
  { area: 'community', prefixes: ['/community', '/channels', '/messages', '/groups', '/forum', '/pages', '/events', '/blog'] },
  { area: 'commerce', prefixes: ['/marketplace', '/creator', '/pricing'] },
  { area: 'account', prefixes: ['/settings'] },
  { area: 'social', prefixes: ['/feed', '/explore', '/search', '/hashtag', '/post', '/profile', '/bookmarks', '/missions', '/activity', '/notifications', '/picks', '/leaderboard'] },
]

export function routeMatches(pathname: string, item: Pick<ProductNavItem, 'href' | 'matches'>) {
  const candidates = item.matches?.length ? item.matches : [item.href]
  return candidates.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function getProductArea(pathname: string): ProductArea {
  return routeAreas.find(entry => entry.prefixes.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)))?.area ?? 'research'
}

export function getContextNavigation(pathname: string) {
  const area = getProductArea(pathname)
  return { area, meta: productAreaMeta[area], items: areaNavigation[area] }
}

export const accountQuickNavigation: ProductNavItem[] = [
  { href: '/search', label: 'Search', icon: Search },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/settings', label: 'Settings', icon: Settings2 },
]
