'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AtSign, BadgeCheck, Check, ExternalLink, Loader2, Link2, Unlink, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { extractIdentityHandle, type VerifiedIdentity } from '@/lib/verifiedIdentity'
import { DiscordLogo, DISCORD_BRAND } from '@/components/brand/DiscordLogo'
import { WhopLogo } from '@/components/brand/WhopLogo'

type Provider = 'whop' | 'discord' | 'x'

const providers: Array<{
  id: Provider
  name: string
  description: string
  accent: string
  deep: string
  connectLabel: string
}> = [
  { id: 'whop', name: 'Whop', description: 'Bring your membership and purchase access into SlipSurge.', accent: '#fa4616', deep: '#a82408', connectLabel: 'Connect Whop' },
  { id: 'discord', name: 'Discord', description: 'Connect your community identity, access, and member roles.', accent: DISCORD_BRAND.accent, deep: DISCORD_BRAND.deep, connectLabel: 'Connect Discord' },
  { id: 'x', name: 'X', description: 'Add your verified X identity to your SlipSurge profile.', accent: '#f5f5f5', deep: '#050505', connectLabel: 'Connect X' },
]

function ProviderMark({ provider }: { provider: Provider }) {
  if (provider === 'whop') {
    return <WhopLogo/>
  }
  if (provider === 'x') return <span className="ss-connection-x-logo" aria-label="X">𝕏</span>
  return (
    <span className="ss-connection-discord-logo">
      <DiscordLogo/>
      <strong>Discord</strong>
    </span>
  )
}

export function ConnectedAccountsPanel({
  initialVerified,
  initialWhopConnected,
}: {
  initialVerified: Record<string, VerifiedIdentity>
  initialWhopConnected: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const linkError = searchParams.get('link_error') || searchParams.get('whop_link_error')
  const linkedWhop = searchParams.get('whop_linked')
  const supabase = useMemo(() => createClient(), [])
  const [verified, setVerified] = useState<Record<string, VerifiedIdentity>>(initialVerified)
  const [whopConnected, setWhopConnected] = useState(initialWhopConnected || Boolean(linkedWhop))
  const [busy, setBusy] = useState<Provider | null>(null)
  const [confirming, setConfirming] = useState<Provider | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(() =>
    linkError ? { tone: 'error', text: 'That account could not be connected. It may already belong to another SlipSurge account.' }
      : linkedWhop ? { tone: 'success', text: 'Whop connected.' } : null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (linkError || linkedWhop) {
      params.delete('link_error')
      params.delete('whop_link_error')
      params.delete('whop_linked')
      const query = params.toString()
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    }
  }, [linkError, linkedWhop])

  useEffect(() => {
    let cancelled = false
    async function refreshIdentities() {
      const { data, error } = await supabase.auth.getUserIdentities()
      if (cancelled) return
      if (error) {
        setMessage({ tone: 'error', text: 'Connected accounts could not be refreshed.' })
        return
      }
      const next = { ...initialVerified }
      delete next.discord
      delete next.x
      for (const identity of data?.identities ?? []) {
        if (identity.provider !== 'discord' && identity.provider !== 'x') continue
        const extracted = extractIdentityHandle(identity.provider, identity.identity_data ?? {})
        if (extracted) next[identity.provider] = extracted
      }
      setVerified(next)
      const response = await fetch('/api/account/verified-identities', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!cancelled && response.ok && body.identities) setVerified(body.identities)
    }
    refreshIdentities().catch(() => {
      if (!cancelled) setMessage({ tone: 'error', text: 'Connected accounts could not be refreshed.' })
    })
    return () => { cancelled = true }
  }, [initialVerified, supabase])

  function isConnected(provider: Provider) {
    return provider === 'whop' ? whopConnected : !!verified[provider]
  }

  async function connect(provider: Provider) {
    setBusy(provider)
    setMessage(null)
    if (provider === 'whop') {
      router.push(`/auth/whop/login?mode=link&next=${encodeURIComponent('/settings/connections')}`)
      return
    }
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/settings/connections')}` },
      })
      if (error) throw error
    } catch {
      setBusy(null)
      setMessage({ tone: 'error', text: `${provider === 'x' ? 'X' : 'Discord'} could not be connected. Try again.` })
    }
  }

  async function disconnect(provider: Provider) {
    setBusy(provider)
    setMessage(null)
    try {
      if (provider === 'whop') {
        const response = await fetch('/api/whop/unlink', { method: 'POST' })
        if (!response.ok) throw new Error('unlink failed')
        setWhopConnected(false)
        const next = { ...verified }
        delete next.whop
        setVerified(next)
      } else {
        const { data, error: readError } = await supabase.auth.getUserIdentities()
        if (readError) throw readError
        const identity = data?.identities.find(item => item.provider === provider)
        if (!identity) throw new Error('identity missing')
        if ((data?.identities.length ?? 0) <= 1) {
          setMessage({ tone: 'error', text: 'Connect another sign-in method before disconnecting this account.' })
          return
        }
        const { error } = await supabase.auth.unlinkIdentity(identity)
        if (error) throw error
        const response = await fetch('/api/account/verified-identities', { method: 'POST' })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'sync failed')
        setVerified(body.identities ?? {})
      }
      setConfirming(null)
      setMessage({ tone: 'success', text: `${providers.find(item => item.id === provider)?.name} disconnected.` })
      router.refresh()
    } catch {
      setMessage({ tone: 'error', text: 'That account could not be disconnected. Try again.' })
    } finally {
      setBusy(null)
    }
  }

  const connectionCount = providers.filter(provider => isConnected(provider.id)).length

  return (
    <div className="ss-connections">
      <p className="ss-connection-count">{connectionCount} of {providers.length} connected</p>

      {message && (
        <div className={`ss-connection-alert ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
          {message.tone === 'success' ? <Check size={16} /> : <X size={16} />}
          <span>{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message"><X size={14} /></button>
        </div>
      )}

      <section className="ss-connection-grid" aria-label="Available account connections">
        {providers.map(provider => {
          const connected = isConnected(provider.id)
          const identity = verified[provider.id]
          const isBusy = busy === provider.id
          const isConfirming = confirming === provider.id
          return (
            <article className={`ss-connection-card ${connected ? 'is-connected' : ''}`} data-provider={provider.id} key={provider.id} style={{ '--provider-accent': provider.accent, '--provider-deep': provider.deep } as React.CSSProperties}>
              <div className="ss-connection-brand-stage">
                <h2 className="ss-connection-provider-mark" aria-label={provider.name}><ProviderMark provider={provider.id} /></h2>
                <span className={`ss-connection-state ${connected ? 'is-connected' : ''}`}>
                  {connected ? <><BadgeCheck size={13} /> Connected</> : <><span /> Available</>}
                </span>
              </div>
              <div className="ss-connection-copy">
                <p>{provider.description}</p>
                {connected && <div className="ss-connection-identity is-connected">
                  <span><AtSign size={15} /></span>
                  <div>
                    <small>{connected ? 'Connected as' : 'Connection status'}</small>
                    {connected && identity?.profileUrl
                      ? <a href={identity.profileUrl} target="_blank" rel="noopener noreferrer">{identity.handle}<ExternalLink size={12} /></a>
                      : <strong>{connected ? 'Linked to SlipSurge' : 'Ready to connect'}</strong>}
                  </div>
                </div>}
              </div>
              <div className="ss-connection-actions">
                {!connected ? (
                  <button type="button" className="ss-connection-connect" onClick={() => connect(provider.id)} disabled={busy !== null}>
                    {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                    {isBusy ? 'Opening…' : provider.connectLabel}
                  </button>
                ) : isConfirming ? (
                  <div className="ss-connection-confirm">
                    <button type="button" className="ss-settings-secondary" onClick={() => setConfirming(null)} disabled={isBusy}>Keep</button>
                    <button type="button" className="ss-connection-danger" onClick={() => disconnect(provider.id)} disabled={isBusy}>
                      {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />}
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button type="button" className="ss-settings-secondary" onClick={() => setConfirming(provider.id)} disabled={busy !== null}>
                    <Unlink size={14} /> Disconnect
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
