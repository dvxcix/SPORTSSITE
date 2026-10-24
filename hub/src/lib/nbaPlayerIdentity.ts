import { nbaName, type PaintRoster } from './nbaPaint'

type PlayerIdentity = Pick<PaintRoster, 'id' | 'first_name' | 'last_name'>

// Verified display aliases require both the provider ID and canonical roster
// identity. Callers must still require one match within the exact game roster.
const playerAliases = [
  { id: 38017716, canonical: 'Ousmane Dieng', alias: 'Ousmane', firstOnly: true },
  { id: 1028028405, canonical: 'Alexandre Sarr', alias: 'Alex Sarr', firstOnly: false },
  { id: 1057260888, canonical: 'Airious Bailey', alias: 'Ace Bailey', firstOnly: false },
  { id: 56677830, canonical: 'GG Jackson', alias: 'Gregory Jackson', firstOnly: false },
] as const

export function nbaPlayerIdentities<T extends PlayerIdentity>(roster: T[]) {
  return roster.map(player => {
    const canonical = nbaName(`${player.first_name} ${player.last_name}`)
    const aliases = playerAliases.filter(alias => alias.id === player.id && nbaName(alias.canonical) === canonical
      && (!alias.firstOnly || roster.filter(other => nbaName(other.first_name) === nbaName(alias.alias)).length === 1))
      .map(alias => nbaName(alias.alias))
    return { player, names: [canonical, ...aliases] }
  })
}
