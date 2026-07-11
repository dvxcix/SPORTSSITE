'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { PostCardClient } from '@/components/social/PostCardClient'
import { BaseDiamond } from '@/components/sports/BaseDiamond'
import { StrikeZonePlot } from '@/components/sports/StrikeZonePlot'
import { createClient } from '@/lib/supabase/client'
import { mlbHeadshot, mlbTeamLogo, pitchColor, pitchLabel, pitchOutcomeColor, pitchOutcomeLabel } from '@/lib/mlb-api'
import type { MLBGameFeed, MLBPlay, MLBBoxPlayer } from '@/lib/mlb-api'

// ─── Helpers ────────────────────────────────────────────────────
function fmt(n: number | undefined, dec = 0): string {
  if (n === undefined || n === null) return '-'
  return n.toFixed(dec)
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ─── Props ───────────────────────────────────────────────────────
interface Props {
  gamePk: number
  feed: MLBGameFeed
  communityPicks: any[]
  initialReactions: Record<string, Record<string, { count: number; mine: boolean }>>
  isLoggedIn: boolean
}

// ─── Sub-components ──────────────────────────────────────────────

function TeamLogo({ id, name, size = 36 }: { id: number; name: string; size?: number }) {
  const [err, setErr] = useState(false)
  if (err || !id) return (
    <div style={{ width: size, height: size, borderRadius: size * 0.22, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.35, fontWeight: 800, color: 'var(--text-3)', flexShrink: 0 }}>
      {name?.[0]}
    </div>
  )
  return <img src={mlbTeamLogo(id)} alt={name} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} />
}

// Scoreboard at top
function Scoreboard({ feed }: { feed: MLBGameFeed }) {
  const { gameData, liveData } = feed
  const away = gameData.teams.away
  const home = gameData.teams.home
  const ls = liveData.linescore
  const isLive = gameData.status.abstractGameState === 'Live'
  const isFinal = gameData.status.abstractGameState === 'Final'
  const awayRuns = ls.teams.away.runs
  const homeRuns = ls.teams.home.runs

  const inningLabel = isLive && ls.currentInningOrdinal
    ? `${ls.inningHalf === 'Bottom' ? '▼' : '▲'} ${ls.currentInningOrdinal}`
    : isFinal ? 'Final' : gameData.status.detailedState

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Away */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
          <TeamLogo id={away.id} name={away.name} size={52} />
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', textAlign: 'center' }}>
            {away.teamName || away.name}
          </p>
          {away.record && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{away.record.wins}-{away.record.losses}</p>}
        </div>

        {/* Score */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
          {(isLive || isFinal) ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 44, fontWeight: 900, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{awayRuns}</span>
              <span style={{ fontSize: 20, color: 'var(--text-3)', fontWeight: 300 }}>-</span>
              <span style={{ fontSize: 44, fontWeight: 900, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{homeRuns}</span>
            </div>
          ) : (
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>vs</p>
          )}
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: isLive ? 'rgba(255,77,106,0.12)' : 'var(--surface-2)', color: isLive ? 'var(--red)' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />}
            {inningLabel}
          </span>
          {isLive && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {ls.balls ?? 0}-{ls.strikes ?? 0} · {ls.outs ?? 0} out{ls.outs !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Home */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
          <TeamLogo id={home.id} name={home.name} size={52} />
          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', textAlign: 'center' }}>
            {home.teamName || home.name}
          </p>
          {home.record && <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{home.record.wins}-{home.record.losses}</p>}
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {gameData.venue?.name && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>📍 {gameData.venue.name}</span>
        )}
        {gameData.weather && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>🌤 {gameData.weather.temp}°F · {gameData.weather.condition}</span>
        )}
        {gameData.weather?.wind && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>💨 {gameData.weather.wind}</span>
        )}
        {gameData.probablePitchers?.away && (
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Pitchers: {gameData.probablePitchers.away.fullName} vs {gameData.probablePitchers.home?.fullName}</span>
        )}
      </div>
    </div>
  )
}

// Inning linescore table
function Linescore({ feed }: { feed: MLBGameFeed }) {
  const ls = feed.liveData.linescore
  const innings = ls.innings ?? []
  const awayAbbr = feed.gameData.teams.away.abbreviation ?? 'AWY'
  const homeAbbr = feed.gameData.teams.home.abbreviation ?? 'HME'
  const awayId = feed.gameData.teams.away.id
  const homeId = feed.gameData.teams.home.id

  return (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 700, width: 80 }}>Team</th>
            {innings.map(inn => (
              <th key={inn.num} style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-3)', fontWeight: 700, minWidth: 28 }}>{inn.num}</th>
            ))}
            <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-3)', fontWeight: 800 }}>R</th>
            <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>H</th>
            <th style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-3)', fontWeight: 700 }}>E</th>
          </tr>
        </thead>
        <tbody>
          {(['away', 'home'] as const).map(side => {
            const teamId = side === 'away' ? awayId : homeId
            const abbr = side === 'away' ? awayAbbr : homeAbbr
            const totals = ls.teams[side]
            return (
              <tr key={side} style={{ borderBottom: side === 'away' ? '1px solid var(--border)' : 'none' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TeamLogo id={teamId} name={abbr} size={20} />
                    <span style={{ fontWeight: 800, color: 'var(--text-1)' }}>{abbr}</span>
                  </div>
                </td>
                {innings.map(inn => {
                  const half = inn[side]
                  return (
                    <td key={inn.num} style={{ padding: '8px 6px', textAlign: 'center', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {half.runs !== undefined ? half.runs > 0 ? <strong style={{ color: 'var(--accent)' }}>{half.runs}</strong> : '0' : <span style={{ color: 'var(--text-3)' }}>-</span>}
                    </td>
                  )
                })}
                <td style={{ padding: '8px 8px', textAlign: 'center', fontWeight: 900, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{totals.runs}</td>
                <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-2)' }}>{totals.hits}</td>
                <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--text-2)' }}>{totals.errors}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Current at-bat live panel
function CurrentAtBat({ feed }: { feed: MLBGameFeed }) {
  const ls = feed.liveData.linescore
  const currentPlay = feed.liveData.plays.currentPlay
  if (!currentPlay || feed.gameData.status.abstractGameState !== 'Live') return null

  const batter = currentPlay.matchup.batter
  const pitcher = currentPlay.matchup.pitcher
  const offense = ls.offense
  const hasFirst = !!offense?.first
  const hasSecond = !!offense?.second
  const hasThird = !!offense?.third
  const count = currentPlay.count

  // Last pitch
  const pitches = currentPlay.playEvents.filter(e => e.type === 'pitch')
  const lastPitch = pitches[pitches.length - 1]
  const pitchCode = lastPitch?.details?.type?.code ?? ''

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(180,255,77,0.2)', borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
      <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Current At-Bat</p>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Batter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PlayerAvatar
            headshot={mlbHeadshot(batter.id)}
            teamLogo={mlbTeamLogo(feed.gameData.teams[currentPlay.about.isTopInning ? 'away' : 'home'].id)}
            teamAbbr={feed.gameData.teams[currentPlay.about.isTopInning ? 'away' : 'home'].abbreviation}
            name={batter.fullName}
            size={44}
          />
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{batter.fullName}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Batting</p>
          </div>
        </div>

        {/* vs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>vs</span>
          <PlayerAvatar
            headshot={mlbHeadshot(pitcher.id)}
            teamLogo={mlbTeamLogo(feed.gameData.teams[currentPlay.about.isTopInning ? 'home' : 'away'].id)}
            teamAbbr={feed.gameData.teams[currentPlay.about.isTopInning ? 'home' : 'away'].abbreviation}
            name={pitcher.fullName}
            size={44}
          />
          <div>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{pitcher.fullName}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)' }}>Pitching</p>
          </div>
        </div>

        {/* Count + Base diamond + live strike zone */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginLeft: 'auto' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>
              {count.balls}-{count.strikes}
            </p>
            <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{count.outs} out{count.outs !== 1 ? 's' : ''}</p>
          </div>
          <BaseDiamond
            first={hasFirst} second={hasSecond} third={hasThird}
            runnerFirst={currentPlay.matchup.postOnFirst}
            runnerSecond={currentPlay.matchup.postOnSecond}
            runnerThird={currentPlay.matchup.postOnThird}
            offenseTeamAbbr={feed.gameData.teams[currentPlay.about.isTopInning ? 'away' : 'home'].abbreviation}
            size={56}
          />
          <StrikeZonePlot pitches={pitches} batSide={currentPlay.matchup.batSide?.code as 'L' | 'R'} width={100} height={130} />
        </div>
      </div>

      {/* Last pitch — biggest, most prominent */}
      {lastPitch && pitchCode && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: pitchColor(pitchCode), display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{pitchLabel(pitchCode)}</span>
          </div>
          {lastPitch.pitchData?.startSpeed && (
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{fmt(lastPitch.pitchData.startSpeed, 1)} mph</span>
          )}
          {lastPitch.pitchData?.spinRate && (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{Math.round(lastPitch.pitchData.spinRate)} rpm</span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pitchOutcomeLabel(lastPitch)}</span>
        </div>
      )}

      {/* Every pitch this at-bat, live — grows pitch by pitch as the feed refreshes */}
      {pitches.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[...pitches].reverse().map((p, ri) => {
            const i = pitches.length - 1 - ri
            const code = p.details.type?.code ?? ''
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, fontWeight: 800, color: '#fff',
                  background: pitchOutcomeColor(p),
                }}>{i + 1}</span>
                <span style={{ color: 'var(--text-2)', fontWeight: 600, width: 70, flexShrink: 0 }}>{pitchLabel(code)}</span>
                {p.pitchData?.startSpeed && <span style={{ color: 'var(--text-2)', width: 56, flexShrink: 0 }}>{fmt(p.pitchData.startSpeed, 1)} mph</span>}
                <span style={{ color: 'var(--text-3)' }}>{pitchOutcomeLabel(p)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Due up / on deck */}
      {(offense?.onDeck || offense?.inHole) && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 20 }}>
          {offense?.onDeck && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlayerAvatar
                headshot={mlbHeadshot(offense.onDeck.id)}
                teamAbbr={feed.gameData.teams[currentPlay.about.isTopInning ? 'away' : 'home'].abbreviation}
                name={offense.onDeck.fullName}
                size={28}
                showTeam={false}
              />
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>On deck</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>{offense.onDeck.fullName}</p>
              </div>
            </div>
          )}
          {offense?.inHole && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlayerAvatar
                headshot={mlbHeadshot(offense.inHole.id)}
                teamAbbr={feed.gameData.teams[currentPlay.about.isTopInning ? 'away' : 'home'].abbreviation}
                name={offense.inHole.fullName}
                size={28}
                showTeam={false}
              />
              <div>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>In the hole</p>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>{offense.inHole.fullName}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Single play row in play-by-play
function PlayRow({
  play, feed, reactions, onReact, isLoggedIn,
}: {
  play: MLBPlay
  feed: MLBGameFeed
  reactions: Record<string, { count: number; mine: boolean }>
  onReact: (playId: string, emoji: string) => void
  isLoggedIn: boolean
}) {
  const batter = play.matchup.batter
  const pitcher = play.matchup.pitcher
  const isScoringPlay = play.about.isScoringPlay
  const playId = `${play.about.atBatIndex}`
  const awayTeamId = feed.gameData.teams.away.id
  const homeTeamId = feed.gameData.teams.home.id
  const batterTeamId = play.about.isTopInning ? awayTeamId : homeTeamId
  const pitcherTeamId = play.about.isTopInning ? homeTeamId : awayTeamId

  // pitches for this play
  const pitches = play.playEvents.filter(e => e.type === 'pitch')
  const lastPitch = pitches[pitches.length - 1]
  const pitchCode = lastPitch?.details?.type?.code ?? ''

  // Batter game stats from boxscore
  const side = play.about.isTopInning ? 'away' : 'home'
  const playerKey = `ID${batter.id}`
  const batterStats = feed.liveData.boxscore.teams[side].players[playerKey]?.stats.batting
  const pitcherKey = `ID${pitcher.id}`
  const pitcherSide = play.about.isTopInning ? 'home' : 'away'
  const pitcherStats = feed.liveData.boxscore.teams[pitcherSide].players[pitcherKey]?.stats.pitching

  // Season milestone badges from data we already have in the feed
  const batterSeasonStats = feed.liveData.boxscore.teams[side].players[playerKey]?.seasonStats?.batting
  const milestones: string[] = []
  const event = play.result.event
  if (batterSeasonStats) {
    if (event === 'Home Run' || event === 'Grand Slam') {
      const seasonHR = batterSeasonStats.homeRuns
      if (seasonHR !== undefined && seasonHR > 0) milestones.push(`${seasonHR}th HR of season`)
      const rbi = play.result.rbi
      if (rbi >= 2) milestones.push(`${rbi}-run ${event === 'Grand Slam' ? 'grand slam' : 'homer'}`)
    }
    if (event && ['Single', 'Double', 'Triple', 'Home Run', 'Grand Slam'].includes(event)) {
      const avg = batterSeasonStats.avg
      if (avg) milestones.push(`BA ${avg}`)
    }
    // Cycle watch: if player has 3 of {1B, 2B, 3B, HR} in today's game already
    const bs = feed.liveData.boxscore.teams[side].players[playerKey]?.stats.batting
    if (bs) {
      const hitTypes = [bs.doubles, bs.triples, bs.homeRuns].filter((n): n is number => (n ?? 0) > 0).length
      const hasSingle = (bs.hits ?? 0) - (bs.doubles ?? 0) - (bs.triples ?? 0) - (bs.homeRuns ?? 0) > 0
      if (hasSingle) {
        const totalHitTypes = hitTypes + 1
        if (totalHitTypes >= 3 && (bs.hits ?? 0) >= 3) milestones.push('Cycle watch 👀')
      }
    }
  }
  if (event === 'Grand Slam' && !milestones.some(m => m.includes('grand slam'))) milestones.push('Grand Slam')

  const EMOJI_OPTIONS = ['🔥', '💀', '😱', '👏', '🎯']
  const [expanded, setExpanded] = useState(false)
  const hasRunnerMovement = (play.runners?.length ?? 0) > 0

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        borderBottom: '1px solid var(--border)',
        padding: '14px 0',
        background: isScoringPlay ? 'rgba(180,255,77,0.03)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      {/* Inning header — score state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: isScoringPlay ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.04em' }}>
          {play.about.isTopInning ? '▲' : '▼'} {play.about.inning}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>·</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
          {play.result.awayScore}–{play.result.homeScore}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>·</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
          {play.count.outs} out{play.count.outs !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>{expanded ? '▲ less' : '▼ details'}</span>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Batter avatar */}
        <PlayerAvatar
          headshot={mlbHeadshot(batter.id)}
          teamLogo={mlbTeamLogo(batterTeamId)}
          teamAbbr={feed.gameData.teams[side].abbreviation}
          name={batter.fullName}
          size={52}
          showTeam={true}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Event title — lime green for scoring plays */}
          <p style={{ fontSize: 14, fontWeight: 900, color: isScoringPlay ? 'var(--accent)' : 'var(--text-1)', marginBottom: 3, lineHeight: 1.25 }}>
            {(play.result.description ?? '').length > 80
              ? play.result.description!.slice(0, 80).trimEnd() + '…'
              : (play.result.description ?? 'In progress…')}
          </p>

          {/* Milestone badges */}
          {milestones.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              {milestones.map((m, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(180,255,77,0.1)', color: 'var(--accent)', border: '1px solid rgba(180,255,77,0.25)' }}>
                  {m}
                </span>
              ))}
            </div>
          )}

          {/* Batter stats line */}
          {batterStats && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6 }}>
              <strong style={{ color: 'var(--text-2)' }}>{batter.fullName.split(' ').pop()}</strong>
              {' '}·{' '}
              {batterStats.hits ?? 0}/{batterStats.atBats ?? 0}
              {(batterStats.homeRuns ?? 0) > 0 && `, ${batterStats.homeRuns} HR`}
              {(batterStats.rbi ?? 0) > 0 && `, ${batterStats.rbi} RBI`}
              {(batterStats.strikeOuts ?? 0) > 0 && `, ${batterStats.strikeOuts} K`}
            </p>
          )}

          {/* Pitcher mini-row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={mlbHeadshot(pitcher.id)}
              alt={pitcher.fullName}
              style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--surface-2)' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>
              <strong style={{ color: 'var(--text-2)' }}>{pitcher.fullName.split(' ').pop()}</strong>
              {pitcherStats && (
                <>
                  {' '}· {pitcherStats.inningsPitched ?? '0'} ip
                  {(pitcherStats.strikeOuts ?? 0) > 0 && `, ${pitcherStats.strikeOuts} k`}
                  {pitcherStats.pitchesThrown && `, ${pitcherStats.pitchesThrown} p`}
                  {pitcherStats.earnedRuns !== undefined && pitcherStats.earnedRuns > 0 && `, ${pitcherStats.earnedRuns} er`}
                </>
              )}
            </p>
          </div>

          {/* Last pitch Statcast */}
          {lastPitch && pitchCode && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: pitchColor(pitchCode), display: 'inline-block' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{pitchLabel(pitchCode)}</span>
              </div>
              {lastPitch.pitchData?.startSpeed && (
                <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{fmt(lastPitch.pitchData.startSpeed, 1)} mph</span>
              )}
              {lastPitch.pitchData?.spinRate && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{Math.round(lastPitch.pitchData.spinRate)} rpm</span>
              )}
              {lastPitch.hitData?.launchSpeed && (
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>EV {fmt(lastPitch.hitData.launchSpeed, 1)} mph</span>
              )}
              {lastPitch.hitData?.launchAngle !== undefined && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>LA {fmt(lastPitch.hitData.launchAngle, 1)}°</span>
              )}
              {lastPitch.hitData?.totalDistance && (
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{Math.round(lastPitch.hitData.totalDistance)} ft</span>
              )}
            </div>
          )}

          {/* Pitch sequence dots — colored by outcome (ball=green, strike=red, in-play=blue),
              with a small pitch-type-colored ring so both signals stay visible. */}
          {pitches.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {pitches.map((p, i) => {
                const code = p.details.type?.code ?? ''
                const call = pitchOutcomeLabel(p)
                return (
                  <div key={i} title={`${i + 1}. ${pitchLabel(code)} · ${call}${p.pitchData?.startSpeed ? ` · ${fmt(p.pitchData.startSpeed, 1)} mph` : ''}`}
                    style={{
                      width: 11, height: 11, borderRadius: '50%', cursor: 'help',
                      background: pitchOutcomeColor(p),
                      border: `2px solid ${pitchColor(code)}`,
                      boxSizing: 'border-box',
                    }}
                  />
                )
              })}
              <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 4 }}>
                {pitches.length} pitch{pitches.length !== 1 ? 'es' : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Reactions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
        {EMOJI_OPTIONS.map(emoji => {
          const r = reactions?.[emoji]
          const active = r?.mine ?? false
          return (
            <button key={emoji} onClick={() => isLoggedIn && onReact(playId, emoji)} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 99, fontSize: 12,
              background: active ? 'rgba(180,255,77,0.12)' : 'var(--surface)',
              border: `1px solid ${active ? 'rgba(180,255,77,0.4)' : 'var(--border)'}`,
              color: active ? 'var(--accent)' : 'var(--text-3)',
              cursor: isLoggedIn ? 'pointer' : 'default',
              transition: 'all 120ms',
            }}>
              <span>{emoji}</span>
              {(r?.count ?? 0) > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{r!.count}</span>}
            </button>
          )
        })}
      </div>

      {/* Expanded detail: baserunners at the time, full pitch-location plot,
          per-pitch list, baserunner movement during this play */}
      {expanded && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {(play.matchup.postOnFirst || play.matchup.postOnSecond || play.matchup.postOnThird) && (
            <div>
              <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Runners on base
              </p>
              <BaseDiamond
                first={!!play.matchup.postOnFirst} second={!!play.matchup.postOnSecond} third={!!play.matchup.postOnThird}
                runnerFirst={play.matchup.postOnFirst} runnerSecond={play.matchup.postOnSecond} runnerThird={play.matchup.postOnThird}
                offenseTeamAbbr={feed.gameData.teams[side].abbreviation}
                size={90}
              />
            </div>
          )}
          {pitches.length > 0 && (
            <div>
              <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Pitch locations
              </p>
              <StrikeZonePlot pitches={pitches} batSide={play.matchup.batSide?.code as 'L' | 'R'} width={110} height={135} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 200 }}>
            {pitches.length > 0 && (
              <>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Every pitch
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                  {pitches.map((p, i) => {
                    const code = p.details.type?.code ?? ''
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 800, color: '#fff',
                          background: pitchOutcomeColor(p),
                        }}>{i + 1}</span>
                        <span style={{ color: 'var(--text-2)', fontWeight: 600, width: 70, flexShrink: 0 }}>{pitchLabel(code)}</span>
                        {p.pitchData?.startSpeed && <span style={{ color: 'var(--text-2)', width: 56, flexShrink: 0 }}>{fmt(p.pitchData.startSpeed, 1)} mph</span>}
                        <span style={{ color: 'var(--text-3)' }}>{pitchOutcomeLabel(p)}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {hasRunnerMovement && (
              <>
                <p style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Baserunners
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {play.runners!.map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      <strong style={{ color: 'var(--text-1)' }}>{r.details.runner.fullName}</strong>
                      {': '}{r.details.event}
                      {r.movement.isOut && <span style={{ color: '#f87171', fontWeight: 700 }}> (out)</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Play-by-play tab
function PlayByPlay({
  feed, reactions, onReact, isLoggedIn,
}: {
  feed: MLBGameFeed
  reactions: Record<string, Record<string, { count: number; mine: boolean }>>
  onReact: (playId: string, emoji: string) => void
  isLoggedIn: boolean
}) {
  const [filter, setFilter] = useState<'all' | 'scoring'>('all')
  const allPlays = [...(feed.liveData.plays.allPlays ?? [])].reverse()
  const scoringIndices = new Set(feed.liveData.plays.scoringPlays ?? [])

  const plays = filter === 'scoring'
    ? allPlays.filter(p => scoringIndices.has(p.about.atBatIndex) || p.about.isScoringPlay)
    : allPlays

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'scoring'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
            background: filter === f ? 'var(--accent)' : 'var(--surface)',
            color: filter === f ? 'var(--accent-fg)' : 'var(--text-3)',
            border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
            cursor: 'pointer',
          }}>
            {f === 'all' ? 'All Plays' : 'Scoring Only'}
          </button>
        ))}
      </div>
      {plays.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>No plays yet</div>
      ) : plays.map(play => (
        <PlayRow
          key={play.about.atBatIndex}
          play={play}
          feed={feed}
          reactions={reactions[String(play.about.atBatIndex)] ?? {}}
          onReact={onReact}
          isLoggedIn={isLoggedIn}
        />
      ))}
    </div>
  )
}

// Box score tab
function BoxScore({ feed }: { feed: MLBGameFeed }) {
  const [side, setSide] = useState<'away' | 'home'>('away')
  const teams = feed.liveData.boxscore.teams
  const gameTeams = feed.gameData.teams

  const awayId = gameTeams.away.id
  const homeId = gameTeams.home.id
  const awayAbbr = gameTeams.away.abbreviation ?? 'AWY'
  const homeAbbr = gameTeams.home.abbreviation ?? 'HME'

  const boxTeam = teams[side]
  const battingOrder = boxTeam.battingOrder ?? []
  const batters = battingOrder.map(id => boxTeam.players[`ID${id}`]).filter(Boolean)

  const pitcherIds = boxTeam.pitchers ?? []
  const pitchers = pitcherIds.map(id => boxTeam.players[`ID${id}`]).filter(Boolean)

  const BAT_COLS = ['AB', 'R', 'H', 'RBI', 'BB', 'SO', 'AVG']
  const BAT_KEYS: (keyof NonNullable<MLBBoxPlayer['stats']['batting']>)[] = ['atBats', 'runs', 'hits', 'rbi', 'baseOnBalls', 'strikeOuts', 'avg']
  const PITCH_COLS = ['IP', 'H', 'R', 'ER', 'BB', 'K', 'PC-ST']
  const PITCH_KEYS: (keyof NonNullable<MLBBoxPlayer['stats']['pitching']>)[] = ['inningsPitched', 'hits', 'runs', 'earnedRuns', 'baseOnBalls', 'strikeOuts', 'pitchesThrown']

  return (
    <div>
      {/* Team selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['away', 'home'] as const).map(s => {
          const teamId = s === 'away' ? awayId : homeId
          const abbr = s === 'away' ? awayAbbr : homeAbbr
          return (
            <button key={s} onClick={() => setSide(s)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
              background: side === s ? 'var(--accent)' : 'var(--surface)',
              color: side === s ? 'var(--accent-fg)' : 'var(--text-2)',
              border: `1px solid ${side === s ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}>
              <TeamLogo id={teamId} name={abbr} size={18} />
              {abbr}
            </button>
          )
        })}
      </div>

      {/* Batting */}
      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Batting</p>
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700, width: 160 }}>Player</th>
              {BAT_COLS.map(c => (
                <th key={c} style={{ textAlign: 'center', padding: '6px 6px', color: 'var(--text-3)', fontWeight: 700, minWidth: 36 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batters.map(p => {
              const bs = p.stats.batting ?? {}
              const isCurrentBatter = p.gameStatus?.isCurrentBatter
              return (
                <tr key={p.person.id} style={{ borderBottom: '1px solid var(--border)', background: isCurrentBatter ? 'rgba(180,255,77,0.04)' : 'transparent' }}>
                  <td style={{ padding: '7px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar
                        headshot={mlbHeadshot(p.person.id)}
                        teamLogo={undefined}
                        teamAbbr={side === 'away' ? awayAbbr : homeAbbr}
                        name={p.person.fullName}
                        size={28}
                        showTeam={false}
                      />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: isCurrentBatter ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {p.person.fullName}
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.position?.abbreviation}</p>
                      </div>
                    </div>
                  </td>
                  {BAT_KEYS.map((k, i) => (
                    <td key={i} style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {bs[k] !== undefined ? String(bs[k]) : '-'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pitching */}
      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Pitching</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700, width: 160 }}>Pitcher</th>
              {PITCH_COLS.map(c => (
                <th key={c} style={{ textAlign: 'center', padding: '6px 6px', color: 'var(--text-3)', fontWeight: 700, minWidth: 40 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pitchers.map(p => {
              const ps = p.stats.pitching ?? {}
              const isCurrentPitcher = p.gameStatus?.isCurrentPitcher
              const pitchStrikeStat = ps.pitchesThrown !== undefined && ps.strikes !== undefined
                ? `${ps.pitchesThrown}-${ps.strikes}`
                : ps.pitchesThrown !== undefined ? String(ps.pitchesThrown) : '-'
              return (
                <tr key={p.person.id} style={{ borderBottom: '1px solid var(--border)', background: isCurrentPitcher ? 'rgba(180,255,77,0.04)' : 'transparent' }}>
                  <td style={{ padding: '7px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar
                        headshot={mlbHeadshot(p.person.id)}
                        teamLogo={undefined}
                        teamAbbr={side === 'away' ? awayAbbr : homeAbbr}
                        name={p.person.fullName}
                        size={28}
                        showTeam={false}
                      />
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: isCurrentPitcher ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap' }}>
                          {p.person.fullName}
                        </p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.seasonStats?.pitching?.era ? `ERA ${p.seasonStats.pitching.era}` : ''}</p>
                      </div>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-2)' }}>{ps.inningsPitched ?? '-'}</td>
                  <td style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-2)' }}>{ps.hits ?? '-'}</td>
                  <td style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-2)' }}>{ps.runs ?? '-'}</td>
                  <td style={{ textAlign: 'center', padding: '7px 6px', color: (ps.earnedRuns ?? 0) > 0 ? 'var(--red)' : 'var(--text-2)' }}>{ps.earnedRuns ?? '-'}</td>
                  <td style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-2)' }}>{ps.baseOnBalls ?? '-'}</td>
                  <td style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-2)' }}>{ps.strikeOuts ?? '-'}</td>
                  <td style={{ textAlign: 'center', padding: '7px 6px', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{pitchStrikeStat}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Decisions */}
      {feed.liveData.decisions && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 12, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {feed.liveData.decisions.winner && (
            <span style={{ color: 'var(--text-2)' }}>W: <strong style={{ color: '#4ade80' }}>{feed.liveData.decisions.winner.fullName}</strong></span>
          )}
          {feed.liveData.decisions.loser && (
            <span style={{ color: 'var(--text-2)' }}>L: <strong style={{ color: 'var(--red)' }}>{feed.liveData.decisions.loser.fullName}</strong></span>
          )}
          {feed.liveData.decisions.save && (
            <span style={{ color: 'var(--text-2)' }}>SV: <strong style={{ color: 'var(--accent)' }}>{feed.liveData.decisions.save.fullName}</strong></span>
          )}
        </div>
      )}
    </div>
  )
}

// Community picks tab
function CommunityPicks({ picks }: { picks: any[] }) {
  if (picks.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)' }}>
      <p style={{ fontSize: 32, marginBottom: 8 }}>🎯</p>
      <p>No community picks for this game yet</p>
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {picks.map((p: any) => <PostCardClient key={p.id} post={p} />)}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────
const TABS = ['Summary', 'Play-by-Play', 'Box Score', 'Picks'] as const
type Tab = typeof TABS[number]

export function MLBGameClient({ gamePk, feed: initialFeed, communityPicks, initialReactions, isLoggedIn }: Props) {
  const [tab, setTab] = useState<Tab>('Summary')
  const [feed, setFeed] = useState(initialFeed)
  const [reactions, setReactions] = useState(initialReactions)

  const isLive = feed.gameData.status.abstractGameState === 'Live'

  // Auto-refresh for live games
  useEffect(() => {
    if (!isLive) return
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/mlb/game-feed?gamePk=${gamePk}`)
        if (res.ok) {
          const data = await res.json()
          if (data.feed) setFeed(data.feed)
        }
      } catch {}
    }, 8_000)
    return () => clearInterval(id)
  }, [isLive, gamePk])

  // Live-updating reaction counts: any insert/delete on play_reactions for
  // this game (from any user, any tab) refetches the aggregated counts —
  // avoids trying to hand-merge Postgres change payloads into per-emoji
  // count/mine state, which is easy to get subtly wrong.
  const reactionsSyncing = useRef(false)
  useEffect(() => {
    const supabase = createClient()
    const refetch = async () => {
      if (reactionsSyncing.current) return
      reactionsSyncing.current = true
      try {
        const res = await fetch(`/api/play-reactions?game_id=${gamePk}`)
        if (res.ok) setReactions(await res.json())
      } catch {} finally {
        reactionsSyncing.current = false
      }
    }
    const channel = supabase
      .channel(`play-reactions-${gamePk}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_reactions', filter: `game_id=eq.${gamePk}` }, refetch)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gamePk])

  const handleReact = useCallback(async (playId: string, emoji: string) => {
    if (!isLoggedIn) return
    setReactions(prev => {
      const copy = { ...prev }
      const playReactions = { ...(copy[playId] ?? {}) }
      const current = playReactions[emoji]
      if (current?.mine) {
        playReactions[emoji] = { count: Math.max(0, current.count - 1), mine: false }
      } else {
        // Remove any other emoji I had
        for (const em in playReactions) {
          if (playReactions[em]?.mine) {
            playReactions[em] = { count: Math.max(0, playReactions[em].count - 1), mine: false }
          }
        }
        playReactions[emoji] = { count: (current?.count ?? 0) + 1, mine: true }
      }
      copy[playId] = playReactions
      return copy
    })
    try {
      await fetch('/api/play-reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: String(gamePk), play_id: playId, emoji }),
      })
    } catch {}
  }, [isLoggedIn, gamePk])

  const away = feed.gameData.teams.away
  const home = feed.gameData.teams.home

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 16px' }}>
      {/* Breadcrumb */}
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
        <Link href="/sports" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Sports</Link>
        {' / '}
        <Link href="/sports" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>MLB</Link>
        {' / '}
        <span style={{ color: 'var(--text-2)' }}>{away.abbreviation} vs {home.abbreviation}</span>
      </p>

      <Scoreboard feed={feed} />

      {/* Live at-bat panel */}
      <CurrentAtBat feed={feed} />

      {/* Linescore (always show if has data) */}
      {(feed.liveData.linescore.innings?.length ?? 0) > 0 && <Linescore feed={feed} />}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 16px', fontSize: 13, fontWeight: 700,
            background: 'none', border: 'none', cursor: 'pointer',
            color: tab === t ? 'var(--text-1)' : 'var(--text-3)',
            borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
            marginBottom: -1, transition: 'color 120ms',
          }}>
            {t}{t === 'Picks' && communityPicks.length > 0 ? ` (${communityPicks.length})` : ''}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Summary' && (
        <div>
          {/* Probable pitchers / decisions */}
          {feed.liveData.decisions?.winner && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Decisions</p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {feed.liveData.decisions.winner && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PlayerAvatar headshot={mlbHeadshot(feed.liveData.decisions.winner.id)} teamLogo={undefined} name={feed.liveData.decisions.winner.fullName} size={36} showTeam={false} />
                    <div>
                      <p style={{ fontSize: 11, color: '#4ade80', fontWeight: 800 }}>WIN</p>
                      <p style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 700 }}>{feed.liveData.decisions.winner.fullName}</p>
                    </div>
                  </div>
                )}
                {feed.liveData.decisions.loser && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PlayerAvatar headshot={mlbHeadshot(feed.liveData.decisions.loser.id)} teamLogo={undefined} name={feed.liveData.decisions.loser.fullName} size={36} showTeam={false} />
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--red)', fontWeight: 800 }}>LOSS</p>
                      <p style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 700 }}>{feed.liveData.decisions.loser.fullName}</p>
                    </div>
                  </div>
                )}
                {feed.liveData.decisions.save && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PlayerAvatar headshot={mlbHeadshot(feed.liveData.decisions.save.id)} teamLogo={undefined} name={feed.liveData.decisions.save.fullName} size={36} showTeam={false} />
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 800 }}>SAVE</p>
                      <p style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 700 }}>{feed.liveData.decisions.save.fullName}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Last 5 scoring plays */}
          {(feed.liveData.plays.scoringPlays?.length ?? 0) > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Scoring Plays</p>
              {(feed.liveData.plays.scoringPlays ?? []).map(idx => {
                const play = feed.liveData.plays.allPlays[idx]
                if (!play) return null
                return (
                  <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 4 }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>
                        {play.about.isTopInning ? '▲' : '▼'}{play.about.inning} · {play.result.awayScore}-{play.result.homeScore}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>{play.result.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-3)', fontSize: 13 }}>
            <button onClick={() => setTab('Play-by-Play')} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 20px', color: 'var(--text-2)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              View Full Play-by-Play →
            </button>
          </div>
        </div>
      )}

      {tab === 'Play-by-Play' && (
        <PlayByPlay feed={feed} reactions={reactions} onReact={handleReact} isLoggedIn={isLoggedIn} />
      )}
      {tab === 'Box Score' && <BoxScore feed={feed} />}
      {tab === 'Picks' && <CommunityPicks picks={communityPicks} />}
    </div>
  )
}
