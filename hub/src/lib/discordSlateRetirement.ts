/** Global Discord command inspection is deliberately separate from the bulk
 * registration helper. A failed/uncertain DELETE is never retried here. */
type Command = { id: string; name: string; type: number }
type Fetcher = typeof fetch
const idPattern = /^\d{17,20}$/

function configuration() {
  const appId = process.env.DISCORD_APPLICATION_ID
  const token = process.env.DISCORD_BOT_TOKEN
  if (!appId || !idPattern.test(appId) || !token) throw new Error('Discord is not configured')
  return { appId, token }
}

async function commands(fetcher: Fetcher): Promise<Command[]> {
  const { appId, token } = configuration()
  const response = await fetcher(`https://discord.com/api/v10/applications/${appId}/commands`, {
    headers: { Authorization: `Bot ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error('Could not inspect Discord commands')
  const value: unknown = await response.json()
  if (!Array.isArray(value) || value.length > 300 || value.some(row => !row || typeof row !== 'object' || typeof row.id !== 'string' || !idPattern.test(row.id) || typeof row.name !== 'string' || typeof row.type !== 'number')) throw new Error('Discord command list was invalid')
  const rows = value as Command[]
  if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Discord command list was ambiguous')
  return rows
}

function slate(rows: Command[]): Command | null {
  const matches = rows.filter(row => row.name === 'slate' && row.type === 1)
  if (matches.length > 1) throw new Error('Discord slate command was ambiguous')
  return matches[0] ?? null
}

function otherIdentity(rows: Command[], excludedId: string) {
  return rows.filter(row => row.id !== excludedId).map(row => JSON.stringify([row.id, row.name, row.type])).sort().join('\n')
}

export async function inspectDiscordSlate(fetcher: Fetcher = fetch) {
  const rows = await commands(fetcher)
  return { slateId: slate(rows)?.id ?? null, otherCount: rows.length - (slate(rows) ? 1 : 0) }
}

export async function retireDiscordSlate(expectedId: string, fetcher: Fetcher = fetch) {
  if (!idPattern.test(expectedId)) throw new Error('Inspect the command before removing it')
  const before = await commands(fetcher)
  const current = slate(before)
  if (!current || current.id !== expectedId) throw new Error('The command changed; inspect it again')
  const { appId, token } = configuration()
  const response = await fetcher(`https://discord.com/api/v10/applications/${appId}/commands/${current.id}`, {
    method: 'DELETE', headers: { Authorization: `Bot ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error('Removal could not be confirmed; inspect before trying again')
  const after = await commands(fetcher).catch(() => { throw new Error('Removal was submitted; inspect again to confirm') })
  if (slate(after) || otherIdentity(before, current.id) !== otherIdentity(after, current.id)) throw new Error('Removal was submitted; command list changed during verification')
  return { removed: true, otherCount: after.length }
}
