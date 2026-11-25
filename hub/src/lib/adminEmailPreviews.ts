import 'server-only'
import { brandedEmailHtml } from './email'

const previews = {
  welcome: { eyebrow: 'Welcome to SlipSurge', heading: 'Your sharper sports workspace is ready', bodyHtml: '<p style="margin:0;">Track the board, build your Matrix, follow live movement, and keep every signal in one polished workspace.</p>', ctaLabel: 'Enter SlipSurge', ctaUrl: 'https://www.slipsurge.com/feed' },
  notification: { eyebrow: 'New notification', heading: 'Something new on SlipSurge', bodyHtml: '<p style="margin:0;color:#F5F5F5;">A creator you follow just shared a new pick.</p>', ctaLabel: 'View on SlipSurge', ctaUrl: 'https://www.slipsurge.com/notifications' },
  security: { eyebrow: 'Account security', heading: 'Your password was changed', bodyHtml: '<p style="margin:0;">Your SlipSurge password was updated. If this was not you, secure your account immediately.</p>', ctaLabel: 'Review security', ctaUrl: 'https://www.slipsurge.com/settings/security' },
  billing: { eyebrow: 'Membership update', heading: 'Your membership needs attention', bodyHtml: '<p style="margin:0;">Review your membership status and payment details to keep your access uninterrupted.</p>', ctaLabel: 'Review membership', ctaUrl: 'https://www.slipsurge.com/settings/membership' },
} as const

export function adminEmailPreview(name: string | null) {
  const preview = name && Object.hasOwn(previews, name) ? previews[name as keyof typeof previews] : previews.welcome
  return brandedEmailHtml({ ...preview, preheader: preview.heading })
}
