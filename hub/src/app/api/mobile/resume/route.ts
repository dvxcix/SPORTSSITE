import { NextResponse } from 'next/server'
import { requireNativeAccount } from '@/lib/supabase/nativeAccount'

const headers = { 'Cache-Control': 'private, no-store' }
const columns = 'path,page_title,scroll_y,updated_at'
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const privateQueryKeys = /^(code|token|access_token|refresh_token|state|secret|receipt|password|nonce|signature|checkout_?id|session_?id|payment_?id)$/i

function productPath(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      value.length > 900 || /[\u0000-\u001f\u007f\\]/.test(value)) return false
  try {
    const url = new URL(value, 'https://www.slipsurge.com')
    const pathname = decodeURIComponent(url.pathname)
    return url.origin === 'https://www.slipsurge.com' && url.pathname === value.split(/[?#]/, 1)[0] &&
      !/^\/(api|auth|admin)(\/|$)/i.test(pathname) && !/[\\\u0000-\u001f\u007f]/.test(pathname) &&
      ![...url.searchParams.keys(), ...new URLSearchParams(url.hash.slice(1)).keys()].some(key => privateQueryKeys.test(key))
  } catch { return false }
}

export async function GET(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const { data, error } = await account.supabase.from('member_context_handoff').select(columns)
    .eq('user_id', account.userId).maybeSingle()
  if (error) return reply({ error: 'Your previous session couldn’t load' }, 503)
  return reply({ saved: data && productPath(data.path) ? data : null, version: data?.updated_at ?? null })
}

export async function POST(request: Request) {
  const account = await requireNativeAccount(request)
  if (account.error) return account.error
  const raw = await request.text()
  if (raw.length > 4_096) return reply({ error: 'The session selection is too long' }, 400)
  const body = await new Response(raw).json().catch(() => null)
  const path = body?.path, title = body?.pageTitle, scroll = body?.scrollY, version = body?.expectedVersion ?? null
  if (!productPath(path) || typeof title !== 'string' || title.trim().length < 1 || title.length > 160 ||
      /[\u0000-\u001f\u007f]/.test(title) || !Number.isInteger(scroll) || scroll < 0 || scroll > 10_000_000 ||
      version != null && (typeof version !== 'string' || version.length > 40 || !Number.isFinite(Date.parse(version)))) {
    return reply({ error: 'Choose a valid session destination' }, 400)
  }
  const update = { path, page_title: title.trim(), scroll_y: scroll, updated_at: new Date().toISOString() }
  const table = account.supabase.from('member_context_handoff')
  const query = version == null ? table.insert({ ...update, user_id: account.userId }) :
    table.update(update).eq('user_id', account.userId).eq('updated_at', version)
  const { data, error } = await query.select(columns).maybeSingle()
  if (error?.code === '23505') return reply({ error: 'Another device saved a newer session' }, 409)
  if (error) return reply({ error: 'Your session couldn’t be saved' }, 503)
  if (!data) return reply({ error: 'Another device saved a newer session' }, 409)
  return reply({ saved: data, version: data.updated_at })
}
