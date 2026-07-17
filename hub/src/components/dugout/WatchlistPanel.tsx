'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { BookLogo } from '@/components/BookLogo'
import { type WatchlistItem } from '@/lib/watchlist'
import { useWatchlist } from '@/context/WatchlistContext'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PostBetModal } from './PostBetModal'

const oStr = (v: number | null | undefined) => v != null ? (v > 0 ? `+${v}` : String(v)) : '—'

function WatchlistRow({ item, wl, selectMode, selected, onToggleSelect, onPostSingle }: {
  item: WatchlistItem; wl: ReturnType<typeof useWatchlist>
  selectMode: boolean; selected: boolean
  onToggleSelect: (id: string) => void
  onPostSingle: (item: WatchlistItem) => void
}) {
  const [removing, setRemoving] = useState(false)

  const bestBook = Object.entries(item.odds_by_book || {}).length > 0
    ? Object.entries(item.odds_by_book).reduce((best, [book, odds]) =>
        best == null || Math.abs(odds) < Math.abs(best[1]) ? [book, odds] as [string, number] : best, null as [string, number] | null)
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      borderBottom: '1px solid var(--border)',
      opacity: item.status === 'posted' ? 0.55 : 1,
      background: selected ? 'var(--accent-dim)' : 'transparent',
    }}>
      {selectMode && item.status === 'pending' && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
      )}
      <PlayerAvatar
        headshot={item.headshot_url}
        teamLogo={getTeamLogoUrl(item.team)}
        teamAbbr={item.team}
        name={item.player_name}
        size={34}
        showTeam={!!getTeamLogoUrl(item.team)}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        {item.mlb_id ? (
          <Link
            href={`/players/${item.mlb_id}`}
            style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', width: 'fit-content', maxWidth: '100%' }}
          >
            {item.player_name} {item.team && <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>· {item.team}</span>}
          </Link>
        ) : (
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.player_name} {item.team && <span style={{ color: 'var(--text-3)', fontWeight: 600 }}>· {item.team}</span>}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 1 }}>{item.prop_label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {item.book && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-2)', background: 'var(--surface-2)', borderRadius: 5, padding: '2px 6px' }}>
              <BookLogo vendor={item.book} size={13} /> {oStr(item.odds)}
            </span>
          )}
          {Object.entries(item.odds_by_book || {}).filter(([b]) => b !== item.book).map(([book, odds]) => (
            <span key={book} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)' }}>
              <BookLogo vendor={book} size={11} /> {oStr(odds)}
            </span>
          ))}
        </div>
        {item.status === 'posted' && (
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', marginTop: 4, letterSpacing: '0.04em' }}>POSTED TO FEED</div>
        )}
      </div>
      {!selectMode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          {item.status === 'pending' && (
            <button
              onClick={() => onPostSingle(item)}
              style={{
                fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
                background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', cursor: 'pointer',
              }}
            >
              Post
            </button>
          )}
          <button
            disabled={removing}
            onClick={async () => { setRemoving(true); try { await wl.remove(item.id) } finally { setRemoving(false) } }}
            style={{
              fontSize: 10, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
              background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}

export function WatchlistButton() {
  const wl = useWatchlist()
  const [open, setOpen] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modalLegs, setModalLegs] = useState<WatchlistItem[] | null>(null)

  if (!wl.signedIn) return null

  const pendingItems = wl.items.filter(i => i.status === 'pending')
  const selectedItems = pendingItems.filter(i => selectedIds.has(i.id))
  const selectedBooks = new Set(selectedItems.map(i => i.book).filter(Boolean))
  const booksMismatch = selectedItems.length > 1 && selectedBooks.size > 1

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  return (
    <>
      <style>{`
        .wl-fab { position: fixed; right: 20px; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 50; }
      `}</style>
      <button
        className="wl-fab"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px', borderRadius: 999,
          background: 'var(--accent)', color: 'var(--accent-fg)',
          border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: 800,
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}
      >
        <span style={{ fontSize: 15 }}>★</span> Watchlist
        {wl.pendingCount > 0 && (
          <span style={{
            background: 'rgba(0,0,0,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11,
          }}>{wl.pendingCount}</span>
        )}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(420px, 100vw)', height: '100%', background: 'var(--bg)',
              borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
              animation: 'slideIn 0.2s ease-out',
            }}
          >
            <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>★ My Watchlist</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{wl.pendingCount} pending</span>
              {pendingItems.length >= 2 && (
                <button
                  onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
                  style={{
                    marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                    background: selectMode ? 'var(--surface-2)' : 'var(--accent-dim)',
                    color: selectMode ? 'var(--text-2)' : 'var(--accent)',
                    border: '1px solid var(--border-2)', cursor: 'pointer',
                  }}
                >
                  {selectMode ? 'Cancel' : 'Build Parlay'}
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ marginLeft: selectMode || pendingItems.length < 2 ? 'auto' : 0, background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {wl.loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading…</div>
              ) : wl.items.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                  No picks saved yet.<br />Click any odds cell in The Dugout to add it here.
                </div>
              ) : (
                wl.items.map(item => (
                  <WatchlistRow
                    key={item.id} item={item} wl={wl}
                    selectMode={selectMode} selected={selectedIds.has(item.id)}
                    onToggleSelect={toggleSelect}
                    onPostSingle={i => setModalLegs([i])}
                  />
                ))
              )}
            </div>
            {selectMode && selectedItems.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                {booksMismatch ? (
                  <p style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 8 }}>
                    All parlay legs must be from the same sportsbook — you've selected {[...selectedBooks].join(', ')}.
                  </p>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>
                    {selectedItems.length} leg{selectedItems.length > 1 ? 's' : ''} selected{selectedItems.length === 1 ? ' — pick at least one more' : ''}
                  </p>
                )}
                <button
                  disabled={booksMismatch || selectedItems.length < 2}
                  onClick={() => setModalLegs(selectedItems)}
                  style={{
                    width: '100%', padding: '9px', borderRadius: 8, border: 'none',
                    background: booksMismatch || selectedItems.length < 2 ? 'var(--surface-3)' : 'var(--accent)',
                    color: booksMismatch || selectedItems.length < 2 ? 'var(--text-3)' : 'var(--accent-fg)',
                    fontWeight: 800, fontSize: 12, cursor: booksMismatch || selectedItems.length < 2 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Build {selectedItems.length}-Leg Parlay
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {modalLegs && (
        <PostBetModal
          legs={modalLegs}
          onClose={() => setModalLegs(null)}
          onPosted={() => { exitSelectMode() }}
        />
      )}
    </>
  )
}
