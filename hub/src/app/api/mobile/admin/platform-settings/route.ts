import { NextResponse } from 'next/server'
import { writeAdminAudit } from '@/lib/adminAudit'
import { nativeHandoffKey } from '@/lib/nativeAuthHandoff'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const general = [
  ['site_name', 'Site name', 'text', 'SlipSurge'],
  ['site_tagline', 'Tagline', 'text', 'The Social Hub for Sports & Betting'],
  ['site_email', 'Contact email', 'email', ''],
  ['allow_registration', 'Allow new registrations', 'toggle', 'true'],
  ['email_verification', 'Require email verification', 'toggle', 'false'],
  ['maintenance_mode', 'Maintenance mode', 'toggle', 'false'],
  ['max_post_length', 'Maximum post length', 'number', '500'],
  ['posts_per_page', 'Posts per page', 'number', '30'],
] as const

const code = [
  ['custom_css', 'Custom CSS', 'code', ''],
  ['custom_js', 'Custom JavaScript', 'code', ''],
  ['custom_head_html', 'Custom head HTML', 'code', ''],
] as const

const fields = [...general, ...code]
const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const page = new URL(request.url).searchParams.get('page') ?? 'general'
  if (page === 'login') return reply({ login: { handoffReady: Boolean(nativeHandoffKey()), providers: ['whop', 'discord', 'x'] } })
  if (page === 'writing') return reply({ writing: { configured: Boolean(process.env.ANTHROPIC_API_KEY), model: 'claude-haiku-4-5-20251001', defaultTone: 'analytical' } })
  const selected = page === 'general' ? general : page === 'code' ? code : null
  if (!selected) return reply({ error: 'Choose a settings page' }, 400)
  const { data, error } = await actor.supabase.from('site_settings').select('key,value').in('key', selected.map(([key]) => key))
  if (error) return reply({ error: 'Settings couldn’t load' }, 503)
  const existing = new Map(data?.map(row => [row.key, row.value] as const))
  return reply({ fields: selected.map(([key, label, kind, fallback]) => ({
    key, label, kind, fallback, present: existing.has(key), stored: existing.get(key) ?? null,
  })) })
}

export async function POST(request: Request) {
  if (!request.headers.has('authorization')) return reply({ error: 'Sign in required' }, 401)
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const raw = await request.text()
  if (raw.length > 790_000) return reply({ error: 'The proposed change is too long' }, 400)
  const body = await new Response(raw).json().catch(() => null)
  const field = fields.find(([key]) => key === body?.key)
  if (!field || typeof body.present !== 'boolean' || !(body.stored === null || typeof body.stored === 'string') ||
      (!body.present && body.stored !== null) || typeof body.value !== 'string') {
    return reply({ error: 'Reload the setting before saving' }, 400)
  }
  const [key, , kind] = field
  const value: string = kind === 'code' ? body.value : body.value.trim()
  const valid = !value.includes('\u0000') && (
    kind === 'code' ? value.length <= 65_536 :
    kind === 'toggle' ? ['true', 'false'].includes(value) :
    kind === 'number' ? /^[1-9]\d{0,8}$/.test(value) :
    kind === 'email' ? value === '' || value.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(value) :
    value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value)
  )
  if (!valid) return reply({ error: 'Check the new setting value' }, 400)
  const { data, error } = await actor.supabase.rpc('save_native_platform_setting', {
    setting_key: key, had_row: body.present, previous_value: body.stored, new_value: value,
  })
  if (error) return reply({ error: 'The setting change couldn’t be confirmed' }, 503)
  if (data !== true) return reply({ error: 'This setting changed. Reload it before saving again.' }, 409)
  await writeAdminAudit(actor.admin, { actorUserId: actor.user.id, action: 'platform_setting_update', targetType: 'site_setting', targetId: key, request })
  return reply({ stored: value })
}
