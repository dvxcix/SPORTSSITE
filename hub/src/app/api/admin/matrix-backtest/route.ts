import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMatrixBacktest } from '@/lib/matrixBacktest'
import type { Matrix } from '@slipsurge/core/matrixEngine'

export const revalidate = 0
export const maxDuration = 300

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

const MAX_RANGE_DAYS = 14

function dateRange(start: string, end: string): string[] {
  const out: string[] = []
  let d = new Date(`${start}T00:00:00Z`)
  const endD = new Date(`${end}T00:00:00Z`)
  while (d <= endD && out.length < MAX_RANGE_DAYS) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86400000)
  }
  return out
}

// Runs a saved Matrix (classic or pipeline) against real completed slates
// and grades it against real box score home runs — see matrixBacktest.ts
// for the full data-reconstruction/grading logic this just wires up to an
// admin-gated request. Element code lookup lets an admin paste the same
// code a member would share, without needing that member's own user_id.
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  const body = await req.json().catch(() => null)
  const elementCode = typeof body?.element_code === 'string' ? body.element_code.trim().toUpperCase() : ''
  const startDate = typeof body?.start_date === 'string' ? body.start_date : ''
  const endDate = typeof body?.end_date === 'string' ? body.end_date : startDate
  if (!elementCode) return NextResponse.json({ error: 'Enter an Element Code.' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'Pass start_date/end_date as YYYY-MM-DD.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: matrixRow } = await admin
    .from('matrices')
    .select('id, name, color, priority, match_mode, match_any_count, matrix_type, pipeline_scope')
    .eq('element_code', elementCode)
    .maybeSingle()
  if (!matrixRow) return NextResponse.json({ error: 'No Matrix found for that Element Code.' }, { status: 404 })

  const isPipeline = matrixRow.matrix_type === 'pipeline'
  let factors: Matrix['factors'] = []
  let pipelineSteps: Matrix['pipeline_steps'] = []
  if (isPipeline) {
    const { data } = await admin
      .from('matrix_pipeline_steps')
      .select('kind, category, field_key, recency, book, books, books_min_count, operator, value, direction, tolerance')
      .eq('matrix_id', matrixRow.id)
      .order('position', { ascending: true })
    pipelineSteps = (data ?? []) as unknown as Matrix['pipeline_steps']
  } else {
    const { data } = await admin
      .from('matrix_factors')
      .select('id, category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count, tie_scope, tiebreakers')
      .eq('matrix_id', matrixRow.id)
      .order('position', { ascending: true })
    factors = (data ?? []) as unknown as Matrix['factors']
  }

  const matrix: Matrix = {
    id: matrixRow.id, name: matrixRow.name, color: matrixRow.color, priority: matrixRow.priority,
    match_mode: matrixRow.match_mode, match_any_count: matrixRow.match_any_count,
    matrix_type: matrixRow.matrix_type, pipeline_scope: matrixRow.pipeline_scope,
    factors, pipeline_steps: pipelineSteps,
  }

  const dates = dateRange(startDate, endDate)
  if (!dates.length) return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 })

  const result = await runMatrixBacktest(matrix, dates)
  return NextResponse.json({ matrix: { name: matrixRow.name, element_code: elementCode, matrix_type: matrixRow.matrix_type }, ...result })
}
