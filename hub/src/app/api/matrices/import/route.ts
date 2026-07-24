import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTier } from '@/lib/requireTier'
import { insertWithUniqueElementCode } from '@/lib/elementCode'

export const revalidate = 0

// Importing a shared Element Code clones the source Matrix (name/color/
// Factors) into the CALLER's own account as an independent copy — not a
// live link back to the original. That's the only sane semantics once a
// Matrix can be edited or deleted: the original owner renaming or deleting
// theirs later must never silently change or break something someone else
// already imported.
export async function POST(req: Request) {
  const gate = await requireTier('ultimate')
  if (gate.error) return gate.error

  const body = await req.json().catch(() => null)
  const code = typeof body?.element_code === 'string' ? body.element_code.trim().toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'Enter an Element Code.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: source } = await admin
    .from('matrices')
    .select('id, name, color, match_mode, match_any_count')
    .eq('element_code', code)
    .maybeSingle()
  if (!source) return NextResponse.json({ error: 'No Matrix found for that Element Code.' }, { status: 404 })

  // books/books_min_count/tie_scope/tiebreakers included — real bug,
  // confirmed live for books/books_min_count: this select used to omit
  // them, so importing a Matrix with a book-scoped odds Factor (e.g. "3+ of
  // FHR's books moved up") silently cloned it as a plain single-book
  // Factor (null/empty defaults to ['fanduel'] — see matrixEngine.ts),
  // matching different players than the original for anyone who imported
  // it. tie_scope/tiebreakers added proactively so a 'tied' Factor scoped
  // to "Either team," or one with a tiebreaker chain, doesn't silently
  // clone as the bare default the same way.
  const { data: sourceFactors, error: factorsError } = await admin
    .from('matrix_factors')
    .select('position, category, field_key, operator, value, recency, recency_start, recency_end, books, books_min_count, tie_scope, tiebreakers')
    .eq('matrix_id', source.id)
    .order('position', { ascending: true })
  if (factorsError) return NextResponse.json({ error: factorsError.message }, { status: 500 })
  if (!sourceFactors?.length) return NextResponse.json({ error: 'That Matrix has no Factors to import.' }, { status: 400 })

  const { count: existingCount } = await admin.from('matrices').select('id', { count: 'exact', head: true }).eq('user_id', gate.userId!)
  if ((existingCount ?? 0) >= 10) return NextResponse.json({ error: 'You can save up to 10 Matrices — delete one to make room before importing.' }, { status: 400 })

  const inserted = await insertWithUniqueElementCode(admin, 'matrices', elementCode => ({
    user_id: gate.userId!, name: source.name, color: source.color,
    priority: 1, match_mode: source.match_mode, match_any_count: source.match_any_count,
    element_code: elementCode,
  }))
  if (inserted.error || !inserted.data) {
    const message = inserted.error ?? 'Could not import this Matrix.'
    const capHit = message.includes('MATRIX_CAP_REACHED')
    return NextResponse.json({ error: capHit ? 'You can save up to 10 Matrices — delete one to make room.' : message }, { status: capHit ? 400 : 500 })
  }

  const newMatrixId = inserted.data.id as string
  const { error: cloneError } = await admin.from('matrix_factors').insert(
    sourceFactors.map(f => ({ ...f, matrix_id: newMatrixId }))
  )
  if (cloneError) {
    await admin.from('matrices').delete().eq('id', newMatrixId)
    return NextResponse.json({ error: cloneError.message }, { status: 500 })
  }

  return NextResponse.json({ matrix: inserted.data })
}
