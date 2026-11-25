import 'server-only'
import { createPrivateKey, type KeyObject } from 'node:crypto'

export type AppleEnvironment = 'development' | 'production'
export type ApplePushConfig = { topic: string; teamId: string; keyId: string; key: KeyObject; environment: AppleEnvironment }

export const appleToken = (token: unknown): token is string => typeof token === 'string' && /^[0-9a-f]{32,512}$/.test(token) && token.length % 2 === 0

export function isAppleEnvironment(value: unknown): value is AppleEnvironment {
  return value === 'development' || value === 'production'
}

export function applePushConfig(environment: AppleEnvironment): ApplePushConfig | null {
  const prefix = environment === 'development' ? 'SLIPSURGE_APNS_DEVELOPMENT_' : 'SLIPSURGE_APNS_PRODUCTION_'
  const topic = process.env[prefix + 'TOPIC'], teamId = process.env[prefix + 'TEAM_ID'], keyId = process.env[prefix + 'KEY_ID']
  const pem = process.env[prefix + 'PRIVATE_KEY']?.replaceAll('\\n', '\n')
  if (!topic || !/^[A-Za-z0-9.-]{3,150}$/.test(topic) || !teamId || !/^[A-Z0-9]{10}$/.test(teamId) ||
      !keyId || !/^[A-Z0-9]{10}$/.test(keyId) || !pem) return null
  try {
    const key = createPrivateKey(pem)
    return key.asymmetricKeyType === 'ec' && ['prime256v1', 'secp256r1'].includes(key.asymmetricKeyDetails?.namedCurve ?? '')
      ? { topic, teamId, keyId, key, environment } : null
  } catch {
    return null
  }
}
