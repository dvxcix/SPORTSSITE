import 'server-only'
import {
  Environment, SignedDataVerifier, Status, Type, VerificationException, VerificationStatus,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library'
import { createAdminClient } from '@/lib/supabase/admin'
import { storeKitEnvironmentAllowed, ULTIMATE_STOREKIT_PRODUCT, type StoreKitEnvironment } from './storeKitEntitlements'

// Apple Root CA - G3, https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
const appleRoot = Buffer.from(`
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAt
IEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5j
LjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBs
ZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQK
DApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc
3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dv
MVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB
/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZL
uN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+Yhi
dDkLF1vLUagM6BgD56KyKA==
`, 'base64')
const production = new SignedDataVerifier([appleRoot], true, Environment.PRODUCTION, 'com.slipsurge.ios', 6839724521)
const sandbox = new SignedDataVerifier([appleRoot], true, Environment.SANDBOX, 'com.slipsurge.ios')

export class StoreKitRequestError extends Error {
  constructor(readonly responseStatus: number, message: string) { super(message) }
}

export async function readSignedStoreKitBody(request: Request, key: 'signedTransaction' | 'signedPayload') {
  const limit = key === 'signedPayload' ? 100_000 : 25_000
  if (Number(request.headers.get('content-length')) > limit) throw new StoreKitRequestError(413, 'Payload too large')
  const reader = request.body?.getReader()
  if (!reader) throw new StoreKitRequestError(400, 'Missing signed purchase data')
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new StoreKitRequestError(413, 'Payload too large')
    }
    chunks.push(value)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new StoreKitRequestError(400, 'Invalid signed purchase data') }
  const signed = value && typeof value === 'object' && key in value ? (value as Record<string, unknown>)[key] : null
  if (typeof signed !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(signed)) {
    throw new StoreKitRequestError(400, 'Invalid signed purchase data')
  }
  return signed
}

function verifierFor(signed: string, notification = false) {
  // The untrusted envelope is used only to select the verifier. The verifier
  // re-checks the environment, app identity, signature and certificate chain.
  let claimed: unknown
  try {
    const body = JSON.parse(Buffer.from(signed.split('.')[1], 'base64url').toString('utf8'))
    claimed = notification ? (body.data?.environment ?? body.summary?.environment) : body.environment
  } catch {
    throw new StoreKitRequestError(400, 'Invalid signed purchase data')
  }
  if (claimed === 'Production') return { environment: claimed, verifier: production } as const
  if (claimed === 'Sandbox') return { environment: claimed, verifier: sandbox } as const
  throw new StoreKitRequestError(400, 'Unknown App Store environment')
}

function date(value?: number) {
  if (!Number.isSafeInteger(value) || !value || value < 0 || value > 8.64e15) {
    throw new StoreKitRequestError(400, 'Missing or invalid Apple transaction timestamp')
  }
  return new Date(value).toISOString()
}

function validateUltimate(transaction: JWSTransactionDecodedPayload): asserts transaction is JWSTransactionDecodedPayload & {
  originalTransactionId: string
  transactionId: string
} {
  if (transaction.productId !== ULTIMATE_STOREKIT_PRODUCT || transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION) {
    throw new StoreKitRequestError(400, 'Unexpected Apple subscription product')
  }
  if (!transaction.originalTransactionId || !transaction.transactionId) throw new StoreKitRequestError(400, 'Missing Apple transaction identifier')
}

async function record(
  transaction: JWSTransactionDecodedPayload,
  environment: StoreKitEnvironment,
  userId: string,
  accessUntil: string | null,
  eventAt: string,
  fromNotification: boolean,
) {
  const { data, error } = await createAdminClient().rpc('record_native_storekit_subscription', {
    p_environment: environment,
    p_original_transaction_id: transaction.originalTransactionId,
    p_user_id: userId,
    p_transaction_id: transaction.transactionId,
    p_product_id: transaction.productId,
    p_purchased_at: date(transaction.purchaseDate),
    p_event_at: eventAt,
    p_from_notification: fromNotification,
    p_access_until: accessUntil,
  })
  if (error) throw new StoreKitRequestError(503, 'Apple subscription access unavailable')
  if (data !== true) throw new StoreKitRequestError(409, 'Apple subscription belongs to another SlipSurge account')
}

async function recordedSubscriptionOwner(environment: StoreKitEnvironment, originalTransactionId: string) {
  const { data, error } = await createAdminClient()
    .from('native_storekit_subscriptions')
    .select('user_id')
    .eq('environment', environment)
    .eq('original_transaction_id', originalTransactionId)
    .maybeSingle()
  if (error) throw new StoreKitRequestError(503, 'Apple subscription access unavailable')
  return data?.user_id as string | undefined
}

export async function redeemStoreKitTransaction(signed: string, userId: string) {
  const { verifier, environment } = verifierFor(signed)
  if (!storeKitEnvironmentAllowed(environment, userId)) throw new StoreKitRequestError(403, 'Apple purchases are unavailable for this account')
  const transaction = await verifier.verifyAndDecodeTransaction(signed)
  validateUltimate(transaction)
  if (transaction.appAccountToken?.toLowerCase() !== userId.toLowerCase()) {
    throw new StoreKitRequestError(409, 'Apple subscription belongs to another SlipSurge account')
  }
  const expiresAt = transaction.revocationDate ? null : date(transaction.expiresDate)
  await record(transaction, environment, userId, expiresAt, date(transaction.signedDate), false)
}

export async function receiveStoreKitNotification(signed: string) {
  const { verifier, environment } = verifierFor(signed, true)
  const payload = await verifier.verifyAndDecodeNotification(signed)
  const details = payload.data
  if (!details?.signedTransactionInfo) return
  const transaction = await verifier.verifyAndDecodeTransaction(details.signedTransactionInfo)
  if (transaction.productId !== ULTIMATE_STOREKIT_PRODUCT) return
  validateUltimate(transaction)
  const token = transaction.appAccountToken?.toLowerCase()
  if (token && !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(token)) return
  // Some Apple lifecycle events omit the app account token. They can update
  // an existing subscription but cannot establish an owner without a token.
  const userId = token ?? await recordedSubscriptionOwner(environment, transaction.originalTransactionId)
  if (!userId || !storeKitEnvironmentAllowed(environment, userId)) return

  let until: string | null = null
  if (!transaction.revocationDate && (details.status == null || details.status === Status.ACTIVE)) {
    until = date(transaction.expiresDate)
  } else if (!transaction.revocationDate && details.status === Status.BILLING_GRACE_PERIOD && details.signedRenewalInfo) {
    const renewal = await verifier.verifyAndDecodeRenewalInfo(details.signedRenewalInfo)
    if (renewal.originalTransactionId !== transaction.originalTransactionId) throw new StoreKitRequestError(400, 'Mismatched Apple renewal')
    until = date(renewal.gracePeriodExpiresDate)
  }
  await record(transaction, environment, userId, until, date(payload.signedDate), true)
}

export function storeKitError(error: unknown) {
  if (error instanceof StoreKitRequestError) return { message: error.message, status: error.responseStatus }
  if (error instanceof VerificationException && error.status !== VerificationStatus.RETRYABLE_VERIFICATION_FAILURE) {
    return { message: 'Apple could not verify this purchase', status: 400 }
  }
  return { message: 'Apple purchase verification is temporarily unavailable', status: 503 }
}
