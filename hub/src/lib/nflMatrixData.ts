import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NflMatrix } from './nflMatrix'

/** Callers must supply the verified and entitled member ID. */
export function loadNflMatrices(userId: string) {
  return createAdminClient().from('nfl_matrices')
    .select('id, name, color, priority, enabled, matrix_type, match_mode, match_any_count, pipeline_scope, definition, element_code, created_at, updated_at')
    .eq('user_id', userId).order('priority').order('created_at').returns<NflMatrix[]>()
}
