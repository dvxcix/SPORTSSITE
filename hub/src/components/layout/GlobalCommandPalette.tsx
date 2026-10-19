'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNflAccess } from '@/lib/useNflAccess'
import { isNflToolHref } from '@/lib/nflAccessPolicy'
import { hasNbaAccess, isNbaToolHref } from '@/lib/nbaAccessPolicy'
import { useAuth } from '@/context/AuthContext'
import { ChevronRight, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { SafeImage } from '@/components/ui/SafeImage'
import type { NbaSearchPlayer, NbaSearchTeam } from '@/lib/nbaEntities'
import { areaNavigation, productAreaMeta, type ProductArea } from './navigationConfig'
import styles from './GlobalCommandPalette.module.css'

type CommandItem = { id: string; label: string; detail: string; href: string; icon: typeof Search; image?: string | null; keywords?: string }
const destinationDetails: Record<string, string> = {
  '/feed': 'Posts, picks, and live conversations',
  '/explore': 'People, games, creators, and communities',
  '/community': 'Groups, channels, forums, and live rooms',
  '/messages': 'Direct and group conversations',
  '/dugout': 'MLB markets and game intelligence',
  '/the-sideline': 'NFL markets and matchup intelligence',
  '/the-paint': 'NBA markets and matchup intelligence',
  '/workspace': 'Watchlists, Matrices, comparisons, and notes',
  '/settings': 'Account, profile, privacy, and membership',
  '/settings/connections': 'Connect or disconnect Whop, Discord, and X',
}

const destinations: CommandItem[] = (() => {
  const seen = new Set<string>()
  return (Object.entries(areaNavigation) as Array<[ProductArea, typeof areaNavigation[ProductArea]]>).flatMap(([area, items]) =>
    items.flatMap(item => {
      if (item.ultimateOnly || seen.has(item.href)) return []
      seen.add(item.href)
      return [{
        id: `${area}-${item.href}`,
        label: item.label,
        detail: destinationDetails[item.href] ?? `${productAreaMeta[area].label} · ${productAreaMeta[area].eyebrow}`,
        href: item.href,
        icon: item.icon,
        keywords: `${area} ${item.shortLabel ?? ''} ${productAreaMeta[area].eyebrow}`,
      }]
    }),
  )
})()
type SportsResults = { players?: Array<{ mlbId: number; name: string; position?: string | null; teamName?: string | null }>; teams?: Array<{ id: number; name: string; abbr: string }> }
type NflResults = { players?: Array<{ gsis_id: string; display_name: string; position?: string | null; latest_team?: string | null }>; teams?: Array<{ team_abbr: string; team_name: string }> }
type NbaResults = { players?: NbaSearchPlayer[]; teams?: NbaSearchTeam[] }

export function GlobalCommandPalette() {
  const router = useRouter()
  const { allowed: nflAccess } = useNflAccess()
  const { profile } = useAuth()
  const nbaAccess = hasNbaAccess(profile?.account_type)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sports, setSports] = useState<{ query: string; items: CommandItem[] }>({ query: '', items: [] })
  const [active, setActive] = useState(0)

  useEffect(() => {
    const show = () => { setActive(0); setOpen(true) }
    const keydown = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setActive(0); setOpen(value => !value) } }
    window.addEventListener('slipsurge:open-command', show); window.addEventListener('keydown', keydown)
    return () => { window.removeEventListener('slipsurge:open-command', show); window.removeEventListener('keydown', keydown) }
  }, [])
  useEffect(() => {
    const value = query.trim()
    if (!open || value.length < 2) return
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const [mlb, nfl, nba] = await Promise.all([
        fetch(`/api/search/sports?q=${encodeURIComponent(value)}`, { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<SportsResults> : Promise.resolve({} as SportsResults)).catch(() => ({} as SportsResults)),
        fetch(`/api/search/nfl?q=${encodeURIComponent(value)}`, { signal: controller.signal }).then(response => response.ok ? response.json() as Promise<NflResults> : Promise.resolve({} as NflResults)).catch(() => ({} as NflResults)),
        nbaAccess ? fetch(`/api/search/nba?q=${encodeURIComponent(value)}`, { cache: 'no-store', signal: controller.signal }).then(response => response.ok ? response.json() as Promise<NbaResults> : Promise.resolve({} as NbaResults)).catch(() => ({} as NbaResults)) : Promise.resolve({} as NbaResults),
      ])
      if (cancelled) return
      setSports({ query: value, items: [
        ...(mlb.players ?? []).slice(0, 4).map(player => ({ id: `mlb-${player.mlbId}`, label: player.name, detail: [player.teamName, player.position, 'MLB'].filter(Boolean).join(' · '), href: `/players/${player.mlbId}`, icon: UserRound })),
        ...(nfl.players ?? []).slice(0, 4).map(player => ({ id: `nfl-${player.gsis_id}`, label: player.display_name, detail: [player.latest_team, player.position, 'NFL'].filter(Boolean).join(' · '), href: `/nfl/players/${player.gsis_id}`, icon: UserRound })),
        ...(nba.players ?? []).slice(0, 4).map(player => ({ id: `nba-${player.id}`, label: player.name, detail: [player.teamName, player.position, 'NBA'].filter(Boolean).join(' · '), href: `/nba/players/${player.id}`, icon: UserRound, image: player.headshot ?? player.teamLogo })),
        ...(mlb.teams ?? []).slice(0, 2).map(team => ({ id: `mlb-team-${team.id}`, label: team.name, detail: `${team.abbr} · MLB`, href: `/search?q=${encodeURIComponent(team.name)}`, icon: ShieldCheck })),
        ...(nfl.teams ?? []).slice(0, 2).map(team => ({ id: `nfl-team-${team.team_abbr}`, label: team.team_name, detail: `${team.team_abbr} · NFL`, href: `/search?q=${encodeURIComponent(team.team_name)}`, icon: ShieldCheck })),
        ...(nba.teams ?? []).slice(0, 2).map(team => ({ id: `nba-team-${team.id}`, label: team.name, detail: 'NBA team', href: `/nba/teams/${team.id}`, icon: ShieldCheck, image: team.logo })),
      ] })
    }, 180)
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer) }
  }, [query, nbaAccess, open])
  const local = useMemo(() => {
    const value = query.trim().toLowerCase()
    return destinations.filter(item => (!isNflToolHref(item.href) || nflAccess) && (!isNbaToolHref(item.href) || nbaAccess)
      && (!value || `${item.label} ${item.detail} ${item.keywords ?? ''}`.toLowerCase().includes(value)))
  }, [query, nflAccess, nbaAccess])
  const items = useMemo(() => [...local, ...(sports.query === query.trim() ? sports.items.filter(item => nbaAccess || !isNbaToolHref(item.href)) : [])], [local, sports, query, nbaAccess])
  function close() { setOpen(false); setQuery(''); setSports({ query: '', items: [] }) }
  function navigate(href: string) { close(); router.push(href) }
  if (!open) return null
  return <Modal onClose={close} maxWidth={650} label="Search SlipSurge"><div className={styles.shell}>
    <div className={styles.header}><Search size={18}/><input autoFocus className={styles.input} value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.max(0, Math.min(items.length - 1, index + 1))) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)) }
      if (event.key === 'Enter') { event.preventDefault(); if (items[active]) navigate(items[active].href); else if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`) }
      if (event.key === 'Escape') close()
    }} placeholder="Search people, players, teams, tools…" aria-label="Search SlipSurge" autoComplete="off"/>{query ? <button type="button" className={styles.key} onClick={() => { setQuery(''); setActive(0) }} aria-label="Clear search"><X size={12}/></button> : <kbd className={styles.key}>ESC</kbd>}</div>
    <div className={styles.body} role="listbox" aria-label="Search results">{items.length ? <div className={styles.section}><span className={styles.label}>{query ? 'Results' : 'Navigate'}</span>{items.map((item, index) => { const Icon = item.icon; return <button key={item.id} type="button" className={styles.item} data-active={active === index} onMouseEnter={() => setActive(index)} onClick={() => navigate(item.href)} role="option" aria-selected={active === index}><span className={styles.icon}>{item.image ? <SafeImage src={item.image} alt="" width={28} height={28} style={{ objectFit: 'contain', borderRadius: 6 }} fallback={<Icon size={16}/>}/> : <Icon size={16}/>}</span><span className={styles.copy}><strong>{item.label}</strong><span>{item.detail}</span></span><ChevronRight className={styles.arrow} size={15}/></button> })}</div> : <div className={styles.empty}><Search size={24}/><strong>No matching results</strong><span>Press Enter to search the full network.</span></div>}</div>
    <div className={styles.footer}><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>ESC</kbd> Close</span></div>
  </div></Modal>
}
