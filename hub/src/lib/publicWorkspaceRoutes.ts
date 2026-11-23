import 'server-only'
import type { NextRequest } from 'next/server'

type Reader = () => Promise<{ GET: (request: NextRequest) => Promise<Response> }>
/** Static import targets only. No URL forwarding, write handlers, account
 * endpoints, operational reports or visitor-controlled module paths. */
export const PUBLIC_WORKSPACE_READERS: Record<string, Reader> = {
  '/the-paint/board': () => import('@/app/the-paint/board/route'),
  '/the-paint/profile': () => import('@/app/the-paint/profile/route'),
  '/the-paint/shots': () => import('@/app/the-paint/shots/route'),
  '/the-paint/scouting': () => import('@/app/the-paint/scouting/route'),
  '/the-paint/tracking': () => import('@/app/the-paint/tracking/route'),
  '/the-paint/history': () => import('@/app/the-paint/history/route'),
  '/the-paint/public': () => import('@/app/the-paint/public/route'),
  '/the-paint/results': () => import('@/app/the-paint/results/route'),
  '/the-paint/game-overview': () => import('@/app/the-paint/game-overview/route'),
  '/the-paint/lineups': () => import('@/app/the-paint/lineups/route'),
  '/the-paint/first-basket': () => import('@/app/the-paint/first-basket/route'),
  '/the-paint/first-basket/odds': () => import('@/app/the-paint/first-basket/odds/route'),
  '/the-paint/odds-board': () => import('@/app/the-paint/odds-board/route'),
  '/the-paint/final-results': () => import('@/app/the-paint/final-results/route'),
  '/the-paint/schedule': () => import('@/app/the-paint/schedule/route'),
  '/the-paint/intelligence': () => import('@/app/the-paint/intelligence/route'),
  '/the-paint/divergence': () => import('@/app/the-paint/divergence/route'),
  '/the-paint/estimate': () => import('@/app/the-paint/estimate/route'),
  '/the-sideline/market': () => import('@/app/the-sideline/market/route'),
  '/api/the-sideline/odds-board': () => import('@/app/api/the-sideline/odds-board/route'),
}
