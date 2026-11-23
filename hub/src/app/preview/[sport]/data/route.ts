import { NextRequest, NextResponse } from 'next/server'
import { isPreviewSport } from '@/lib/publicResearchPreview'
import { publicWorkspaceRequest, PUBLIC_WORKSPACE_RESOURCES } from '@/lib/publicWorkspacePolicy'
import { resolvePublicWorkspace } from '@/lib/publicWorkspaceData'
import { withPublicWorkspace } from '@/lib/publicWorkspaceScope'
import { PUBLIC_WORKSPACE_READERS } from '@/lib/publicWorkspaceRoutes'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: NextRequest, { params }: { params: Promise<{ sport: string }> }) {
  if (!['GET','HEAD'].includes(request.method)) return NextResponse.json({ error: 'Read-only preview' }, { status: 405 })
  const { sport } = await params
  if (!isPreviewSport(sport)) return NextResponse.json({ error: 'Unknown preview' }, { status: 404 })
  if (!(PUBLIC_WORKSPACE_RESOURCES[sport] as readonly string[]).includes(request.nextUrl.searchParams.get('resource') ?? '')) return NextResponse.json({ error: 'This tool requires membership', code: 'PREVIEW_SCOPE' }, { status: 403 })
  const scope = await resolvePublicWorkspace(sport)
  const input = publicWorkspaceRequest(sport, scope, request.nextUrl.searchParams)
  if (!input) return NextResponse.json({ error: 'This preview unlocks one matchup. Membership includes the full slate.', code: 'PREVIEW_SCOPE' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
  const reader = PUBLIC_WORKSPACE_READERS[input.resource]
  if (!reader) return NextResponse.json({ error: 'This tool requires membership' }, { status: 403 })
  const url = new URL(input.resource, request.url)
  url.search = input.query.toString()
  const headers = new Headers({ accept: 'application/json' })
  const etag = request.headers.get('if-none-match')
  if (etag) headers.set('if-none-match', etag)
  const response = await withPublicWorkspace(scope, async () => (await reader()).GET(new NextRequest(url, { headers })))
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
