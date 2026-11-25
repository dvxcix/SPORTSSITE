import { NextResponse } from 'next/server'
import { writeAdminAudit } from '@/lib/adminAudit'
import { isAccountId } from '@/lib/blocks'
import { isOwnedNativeMedia } from '@/lib/nativeMedia'
import { nativeSocialTemplate, socialPlatformColumns, socialPlatformKey } from '@/lib/nativeSocialPlatforms'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

export async function GET(request: Request) {
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const { data, error } = await actor.supabase.from('social_platforms').select(socialPlatformColumns).order('sort_order').order('name').order('id')
  return error ? reply({ error: 'Social platforms couldn’t load' }, 503) : reply({ platforms: data ?? [] })
}

export async function POST(request: Request) {
  if (!request.headers.has('authorization')) return reply({ error: 'Sign in required' }, 401)
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const raw = await request.text()
  if (raw.length > 10_000) return reply({ error: 'The proposed change is too long' }, 400)
  const body = await new Response(raw).json().catch(() => null)
  const action = body?.action
  if (!['create', 'edit', 'delete'].includes(action)) return reply({ error: 'Choose a platform action' }, 400)
  const id = typeof body.id === 'string' && isAccountId(body.id) ? body.id : null
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const template = typeof body.template === 'string' ? body.template.trim() : ''
  const icon = typeof body.icon === 'string' ? body.icon : null
  const table = actor.supabase.from('social_platforms')
  if (action !== 'delete' && (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name) ||
    !nativeSocialTemplate(template) || icon && !isOwnedNativeMedia(icon, actor.user.id, 'social-platforms'))) {
    return reply({ error: 'Check the platform name, URL and image' }, 400)
  }

  let operation
  if (action === 'create') {
    const key = typeof body.key === 'string' ? body.key.trim().toLowerCase() : ''
    if (!socialPlatformKey.test(key) || !icon) return reply({ error: 'Choose a valid key and icon' }, 400)
    const { data: last, error } = await table.select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    if (error) return reply({ error: 'Social platforms couldn’t load' }, 503)
    operation = table.insert({ key, name, icon_url: icon, url_template: template || null, sort_order: (last?.sort_order ?? -1) + 1 })
  } else {
    const previous = body.expected
    const beforeName = typeof previous?.name === 'string' ? previous.name : null
    const beforeIcon = typeof previous?.icon === 'string' ? previous.icon : null
    const beforeTemplate = typeof previous?.template === 'string' ? previous.template : null
    if (!id || !beforeName || beforeName.length > 100 || !beforeIcon || beforeIcon.length > 2_048 ||
        (beforeTemplate?.length ?? 0) > 2_048) return reply({ error: 'Reload the platform before saving' }, 400)
    const query = action === 'delete' ? table.delete() : table.update({ name, url_template: template || null, ...(icon ? { icon_url: icon } : {}) })
    const matching = query.eq('id', id).eq('name', beforeName).eq('icon_url', beforeIcon)
    operation = beforeTemplate === null ? matching.is('url_template', null) : matching.eq('url_template', beforeTemplate)
  }

  const { data, error } = await operation.select('id').maybeSingle()
  if (error?.code === '23505') return reply({ error: 'That platform key already exists' }, 409)
  if (error) return reply({ error: 'The platform change couldn’t be confirmed' }, 503)
  if (!data) return reply({ error: 'The platform changed. Reload and try again.' }, 409)
  await writeAdminAudit(actor.admin, { actorUserId: actor.user.id, action: `social_platform_${action}`, targetType: 'social_platform', targetId: data.id, request })
  return reply({ ok: true })
}
