import type { SupabaseClient } from '@supabase/supabase-js'

type AuditInput = {
  actorUserId: string
  action: string
  targetType: string
  targetId?: string | null
  details?: Record<string, unknown>
  request?: Request
}

function requestMetadata(request?: Request) {
  if (!request) return { request_id: null, ip_address: null, user_agent: null }
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return {
    request_id: request.headers.get('x-vercel-id') || request.headers.get('x-request-id'),
    ip_address: forwarded || request.headers.get('x-real-ip'),
    user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
  }
}

export async function writeAdminAudit(admin: SupabaseClient, input: AuditInput) {
  const { error } = await admin.from('admin_audit_logs').insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    details: input.details ?? {},
    ...requestMetadata(input.request),
  })
  if (error) console.error('[admin-audit] failed to persist audit event', error)
  return error
}
