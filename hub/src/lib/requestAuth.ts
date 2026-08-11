import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

export function hasBearerSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return false
  return timingSafeEqual(digest(authorization.slice(7)), digest(secret))
}
