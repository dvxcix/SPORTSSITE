import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function readRows(admin: ReturnType<typeof createAdminClient>, table: string, column: string, userId: string) {
  const rows: unknown[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from(table).select('*').eq(column, userId).range(from, from + pageSize - 1)
    if (error) return { rows, error: error.message }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return { rows, error: null }
  }
}

export async function GET(_request: Request, context: { params: Promise<{ requestId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 })

  const { requestId } = await context.params
  const admin = createAdminClient()
  const { data: exportRequest } = await admin.from('data_export_requests')
    .select('id,status,expires_at').eq('id', requestId).eq('user_id', user.id).maybeSingle()
  if (!exportRequest || exportRequest.status !== 'ready') return Response.json({ error: 'Export is not available' }, { status: 404 })
  if (exportRequest.expires_at && new Date(exportRequest.expires_at) < new Date()) {
    return Response.json({ error: 'Export link has expired. Request a new copy.' }, { status: 410 })
  }

  const sources = [
    ['posts', 'author_id'], ['comments', 'author_id'], ['picks', 'user_id'],
    ['bookmarks', 'user_id'], ['follows', 'follower_id'], ['group_members', 'user_id'],
    ['notifications', 'user_id'], ['creator_applications', 'user_id'],
    ['creator_products', 'creator_id'], ['creator_entitlements', 'user_id'],
  ] as const
  const [profileResult, authResult, ...collections] = await Promise.all([
    admin.from('users').select('*').eq('id', user.id).maybeSingle(),
    admin.auth.admin.getUserById(user.id),
    ...sources.map(([table, column]) => readRows(admin, table, column, user.id)),
  ])
  const data: Record<string, unknown> = {}
  const warnings: string[] = []
  sources.forEach(([table], index) => {
    const result = collections[index]
    data[table] = result.rows
    if (result.error) warnings.push(`${table}: ${result.error}`)
  })

  const payload = {
    exported_at: new Date().toISOString(),
    account: {
      id: user.id,
      auth: {
        email: authResult.data.user?.email ?? null,
        created_at: authResult.data.user?.created_at ?? null,
        last_sign_in_at: authResult.data.user?.last_sign_in_at ?? null,
        identities: authResult.data.user?.identities?.map(identity => ({ provider: identity.provider, created_at: identity.created_at })) ?? [],
      },
      profile: profileResult.data,
    },
    data,
    warnings,
  }

  await admin.from('data_export_requests').update({ status: 'delivered' }).eq('id', requestId)
  const filename = `slipsurge-data-${new Date().toISOString().slice(0, 10)}.json`
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
