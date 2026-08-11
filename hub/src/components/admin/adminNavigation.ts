import {
  Activity,
  AtSign,
  Award,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Calendar,
  CreditCard,
  FileText,
  Flag,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Palette,
  Radio,
  ScrollText,
  Settings,
  ShoppingBag,
  Smile,
  Sparkles,
  Upload,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export type AdminNavLink = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  keywords?: string[]
}

export type AdminNavGroup = {
  label: string
  description: string
  links: AdminNavLink[]
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'Overview',
    description: 'Platform status and daily operations',
    links: [
      { href: '/admin', label: 'Control center', description: 'Platform overview and action queues', icon: LayoutDashboard, keywords: ['dashboard', 'home'] },
      { href: '/admin/pipeline-health', label: 'Pipeline health', description: 'Data, billing, and notification jobs', icon: Activity, keywords: ['cron', 'jobs', 'telemetry'] },
      { href: '/admin/audit', label: 'Audit log', description: 'Administrative activity history', icon: ScrollText, keywords: ['security', 'history'] },
    ],
  },
  {
    label: 'People & community',
    description: 'Members, content, and moderation',
    links: [
      { href: '/admin/users', label: 'Members', description: 'Accounts, access, and membership tiers', icon: Users, keywords: ['users', 'accounts'] },
      { href: '/admin/users/online', label: 'Online now', description: 'Current member activity', icon: Gauge, keywords: ['presence', 'active'] },
      { href: '/admin/users/banned', label: 'Restricted accounts', description: 'Bans and enforcement', icon: Flag, keywords: ['banned', 'moderation'] },
      { href: '/admin/users/deletions', label: 'Deletion requests', description: 'Privacy and account removal queue', icon: Users, keywords: ['privacy', 'gdpr', 'delete'] },
      { href: '/admin/content/posts', label: 'Posts', description: 'Published feed content', icon: FileText, keywords: ['feed', 'content'] },
      { href: '/admin/content/stories', label: 'Stories', description: 'Community stories', icon: Sparkles },
      { href: '/admin/content/blogs', label: 'Blogs', description: 'Long-form editorial content', icon: BookOpen },
      { href: '/admin/reports', label: 'Moderation reports', description: 'Reported users and content', icon: Flag, keywords: ['review', 'abuse'] },
      { href: '/admin/groups', label: 'Groups', description: 'Community spaces and memberships', icon: MessageSquare },
      { href: '/admin/forum', label: 'Forum', description: 'Categories, threads, and replies', icon: BookOpen },
      { href: '/admin/pages', label: 'Pages', description: 'Public community pages', icon: Sparkles },
      { href: '/admin/events', label: 'Events', description: 'Community events and schedules', icon: Calendar },
    ],
  },
  {
    label: 'Creators & revenue',
    description: 'Creator commerce and platform earnings',
    links: [
      { href: '/admin/creators', label: 'Creator operations', description: 'Applications, offers, members, and payouts', icon: Zap, keywords: ['whop', 'applications', 'payouts'] },
      { href: '/admin/marketplace', label: 'Marketplace', description: 'Listings and marketplace activity', icon: ShoppingBag },
      { href: '/admin/monetization', label: 'Monetization', description: 'Revenue and membership controls', icon: CreditCard, keywords: ['billing', 'whop'] },
      { href: '/admin/ads', label: 'Advertising', description: 'Campaigns and placements', icon: Megaphone },
      { href: '/admin/jobs', label: 'Jobs board', description: 'Listings and applications', icon: Briefcase },
    ],
  },
  {
    label: 'Data & research',
    description: 'Imports, models, and research operations',
    links: [
      { href: '/admin/fanduel-import', label: 'FanDuel markets', description: 'Browser-imported market data', icon: Upload, keywords: ['odds', 'fhr'] },
      { href: '/admin/mgm-import', label: 'BetMGM odds', description: 'BetMGM market ingestion', icon: Upload, keywords: ['odds'] },
      { href: '/admin/pikkit-import', label: 'Pikkit import', description: 'Bet history ingestion', icon: Upload },
      { href: '/admin/matrix-backtest', label: 'Matrix backtest', description: 'Historical Matrix validation', icon: FlaskConical, keywords: ['research', 'models'] },
    ],
  },
  {
    label: 'Engagement',
    description: 'Messaging, live tools, and releases',
    links: [
      { href: '/admin/notifications', label: 'Notifications', description: 'Push and in-app broadcasts', icon: Bell, keywords: ['alerts', 'push'] },
      { href: '/admin/live', label: 'Live streaming', description: 'Live rooms and broadcasts', icon: Radio },
      { href: '/admin/site-banner', label: 'Site banner', description: 'Global announcements', icon: Megaphone },
      { href: '/admin/changelog', label: 'Changelog', description: 'Product release announcements', icon: Sparkles, keywords: ['updates', 'releases'] },
      { href: '/admin/badges', label: 'Badges', description: 'Member identity and recognition', icon: Award },
      { href: '/admin/emojis', label: 'Custom emojis', description: 'Community reaction assets', icon: Smile },
    ],
  },
  {
    label: 'Platform',
    description: 'Integrations, appearance, and configuration',
    links: [
      { href: '/admin/social-platforms', label: 'Connected accounts', description: 'Social platform integrations', icon: AtSign },
      { href: '/admin/discord', label: 'Discord', description: 'Bot, roles, and messages', icon: Bot },
      { href: '/admin/design-system', label: 'Design system', description: 'Production components and tokens', icon: Palette, keywords: ['ui', 'ux'] },
      { href: '/admin/settings/general', label: 'General settings', description: 'Core platform configuration', icon: Settings },
      { href: '/admin/settings/features', label: 'Feature controls', description: 'Feature availability and rollout', icon: Settings, keywords: ['flags'] },
      { href: '/admin/settings/email', label: 'Email templates', description: 'Transactional email content', icon: FileText },
      { href: '/admin/settings/social-login', label: 'Social login', description: 'Authentication providers', icon: AtSign },
      { href: '/admin/settings/payments', label: 'Whop payments', description: 'Membership and billing configuration', icon: CreditCard, keywords: ['billing'] },
      { href: '/admin/settings/ai', label: 'AI settings', description: 'AI-assisted product configuration', icon: Sparkles },
      { href: '/admin/settings/custom-code', label: 'Custom code', description: 'Custom CSS and JavaScript', icon: FileText },
    ],
  },
]

export const ADMIN_NAV_LINKS = ADMIN_NAV_GROUPS.flatMap(group =>
  group.links.map(link => ({ ...link, group: group.label })),
)

export function adminPathIsActive(path: string, href: string) {
  return path === href || (href !== '/admin' && path.startsWith(`${href}/`))
}

export function adminRouteForPath(path: string) {
  return ADMIN_NAV_LINKS
    .filter(link => adminPathIsActive(path, link.href))
    .sort((a, b) => b.href.length - a.href.length)[0]
}
