import type { PaintBoard } from './nbaPaint'
import type { NbaPlay } from './nbaShots'

export function nbaOpeningSequence(plays: NbaPlay[], gameId: number) {
  const ordered = [...new Map(plays.filter(p => p.game_id === gameId && p.period === 1).map(p => [p.order, p])).values()].sort((a,b) => a.order-b.order)
  // An archive beginning mid-game cannot identify an opening event. Stop at
  // the first missing play so a later make never becomes an invented first.
  const prefix: NbaPlay[] = []
  for (const play of ordered) { if (play.order !== prefix.length + 1) break; prefix.push(play) }
  const fieldAttempts = prefix.filter(p => p.shooting_play && !/free throw/i.test(`${p.type} ${p.text}`))
  const firstScore = prefix.find(p => p.scoring_play && (p.score_value ?? 0) > 0)
  const firstFieldGoal = fieldAttempts.find(p => p.scoring_play && [2,3].includes(p.score_value ?? 0))
  const tip = prefix.find(p => /jump.?ball/i.test(p.type) && p.clock === '12:00')
  return { gameId, firstScore, firstFieldGoal, firstAttempt: fieldAttempts[0], tip, teamScores:[...new Map(prefix.filter(p=>p.scoring_play&&(p.score_value??0)>0).map(p=>[p.team?.id,p] as const).reverse()).values()], teamFieldGoals: [...new Map(fieldAttempts.filter(p => p.scoring_play && [2,3].includes(p.score_value ?? 0)).map(p => [p.team?.id, p] as const).reverse()).values()] }
}

export function nbaFirstBasketResearch(board: PaintBoard, plays: NbaPlay[], gameIds: number[]) {
  const sequences = gameIds.map(id => nbaOpeningSequence(plays, id))
  const covered = sequences.filter(s => s.firstFieldGoal?.participants[0] && s.firstFieldGoal.team?.id)
  const rows = board.players.map(player => {
    const games = new Set(player.logs.filter(log => log.player.id === player.id && log.team.id === player.team.id && log.game.date.slice(0,10) < board.game.date && log.game.postseason !== true).map(log => log.game.id))
    const sample = covered.filter(s => games.has(s.gameId))
    return { playerId: player.id, games: sample.length,
      firstFieldGoals: sample.filter(s => s.firstFieldGoal?.participants[0] === player.id).length,
      firstScores: sample.filter(s => s.firstScore?.participants[0] === player.id).length,
      firstAttempts: sample.filter(s => s.firstAttempt?.participants[0] === player.id).length,
      teamFirstFieldGoals: sample.filter(s => s.teamFieldGoals.some(p => p.team?.id === player.team.id && p.participants[0] === player.id)).length,
    }
  })
  return { requestedGames: gameIds.length, coveredGames: covered.length, rows,
    teams: [board.game.visitor_team, board.game.home_team].map(team => {
      const ids = new Set(board.players.flatMap(p => p.logs.filter(l => l.team.id === team.id).map(l => l.game.id)))
      const tips = covered.filter(s => ids.has(s.gameId) && s.tip?.team?.id)
      return { teamId: team.id, tips: tips.length, tipWins: tips.filter(s => s.tip!.team!.id === team.id).length }
    }),
  }
}
