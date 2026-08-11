import { brandedEmailHtml } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'

const previews = {
  welcome: { eyebrow: 'Welcome to SlipSurge', heading: 'Your sharper sports workspace is ready', bodyHtml: '<p style="margin:0;">Track the board, build your Matrix, follow live movement, and keep every signal in one polished workspace.</p>', ctaLabel: 'Enter SlipSurge', ctaUrl: 'https://www.slipsurge.com/feed' },
  notification: { eyebrow: 'New notification', heading: 'Something new on SlipSurge', bodyHtml: '<p style="margin:0;color:#F5F5F5;">A creator you follow just shared a new pick.</p>', ctaLabel: 'View on SlipSurge', ctaUrl: 'https://www.slipsurge.com/notifications' },
  security: { eyebrow: 'Account security', heading: 'Your password was changed', bodyHtml: '<p style="margin:0;">Your SlipSurge password was updated. If this was not you, secure your account immediately.</p>', ctaLabel: 'Review security', ctaUrl: 'https://www.slipsurge.com/settings/security' },
  billing: { eyebrow: 'Membership update', heading: 'Your membership needs attention', bodyHtml: '<p style="margin:0;">Review your membership status and payment details to keep your access uninterrupted.</p>', ctaLabel: 'Review membership', ctaUrl: 'https://www.slipsurge.com/settings/membership' },
} as const

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Not signed in', { status: 401 })
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return new Response('Forbidden', { status: 403 })

  const name = new URL(request.url).searchParams.get('template') as keyof typeof previews | null
  const preview = name && previews[name] ? previews[name] : previews.welcome
  return new Response(brandedEmailHtml({ ...preview, preheader: preview.heading }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  })
}
