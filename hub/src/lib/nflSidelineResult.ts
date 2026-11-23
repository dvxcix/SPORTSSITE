import { matchesResultPlayer, type NflPublicResult } from './nflPublicResults'

export type SidelineResultIdentity = { id: string | number; name: string; team: string; gsisId?: string | null; position?: string }
const labels: Record<string, string> = { passing_yards:'pass yds', rushing_yards:'rush yds', receiving_yards:'rec yds', receptions:'rec', rushing_attempts:'carries', passing_attempts:'att', completions:'cmp', passing_tds:'pass TD', interceptions:'INT', anytime_td:'TD', kicking_points:'kick pts', field_goals:'FG', longest_reception:'long rec', longest_rush:'long rush', rushing_receiving_yards:'rush + rec yds', passing_rushing_yards:'pass + rush yds' }

/** Only one verified matching player's actual game counts; absence is never zero. */
export function nflSidelineResult(result: NflPublicResult | null, player: SidelineResultIdentity, market?: string) {
  if (result?.status !== 'final') return []
  const numericId = typeof player.id === 'number' ? player.id : /^bdl-\d+$/.test(player.id) ? Number(player.id.slice(4)) : -1
  const identity = { ...player, id:numericId, gsisId:player.gsisId ?? (typeof player.id === 'string' && !player.id.startsWith('bdl-') ? player.id : null) }
  if (market === 'first_td') return result.firstTdKnown ? [{ value:result.firstTd && matchesResultPlayer(identity, result.firstTd) ? 1 : 0, label:'first TD' }] : []
  const rows = result.players.filter(row => matchesResultPlayer(identity, row))
  if (rows.length !== 1) return []
  const stats = rows[0].stats
  const key = market === 'passing_touchdowns' ? 'passing_tds' : market === 'passing_completions' ? 'completions' : market && ['two_plus_td','three_plus_td'].includes(market) ? 'anytime_td' : market
  const primary = /QB/.test(player.position ?? '') ? 'passing_yards' : /RB|FB/.test(player.position ?? '') ? 'rushing_yards' : /^(K|P|PK)$/.test(player.position ?? '') ? 'kicking_points' : 'receiving_yards'
  const keys = key ? [key] : [primary, primary === 'kicking_points' ? 'field_goals' : 'anytime_td']
  return keys.flatMap(stat => {
    const combined = stat === 'passing_rushing_yards' ? ['passing_yards','rushing_yards'] : stat === 'rushing_receiving_yards' ? ['rushing_yards','receiving_yards'] : null
    const value = combined && combined.every(item => stats[item] != null && Number.isFinite(stats[item])) ? combined.reduce((sum,item) => sum + stats[item]!,0) : stats[stat]
    return value != null && Number.isFinite(value) ? [{ value, label:labels[stat] ?? stat.replaceAll('_',' ') }] : []
  })
}

export function nflCompactDesignation(label: string) {
  const key = label.toLowerCase()
  const codes: Record<string,string> = { questionable:'Q', doubtful:'D', out:'OUT', 'injured reserve':'IR', 'physically unable to perform':'PUP', 'non-football injury':'NFI', suspended:'SUS', inactive:'INA', 'did not play':'DNP', 'practice squad':'PS', 'not with team':'NWT', released:'RLS', 'status unconfirmed':'?' }
  return { text:codes[key] ?? label, attention:!['active','starter'].includes(key) }
}
