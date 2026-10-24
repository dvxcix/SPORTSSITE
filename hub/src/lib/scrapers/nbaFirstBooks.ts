import 'server-only'
import type { Page } from 'playwright-core'
import { BETMGM_PROXY_DOMAIN_PATTERN, openSession } from '../browserbase'
import { nbaName } from '../nbaPaint'
import { nbaPregameOpen } from '../nbaOddsMode'
import { readDkFirstBoards, readMgmFirstIdentity, readMgmFirstRows } from './nbaFirstBookDom'
import { nbaFirstBookMissing, nbaFirstBookTeam, nbaNormalizeFirstBook, type NbaFirstBook, type NbaFirstBookBoard, type NbaFirstBookGame, type NbaFirstBookInput } from './nbaFirstBookQuotes'
import { collectMgmProps } from './nbaMgmProps'
import { nbaUnresolvedBookCoverage, type NbaBookPropCapture, type NbaBookPropCoverage } from './nbaBookPropQuotes'

// The rendered "1st Point" league link includes this exact navigation value.
const DK_LEAGUE = 'https://sportsbook.draftkings.com/leagues/basketball/nba?category=games&subcategory=quick-hits&nav_1=1st-point'
const MGM_LEAGUE = 'https://www.nc.betmgm.com/en/sports/basketball-7/betting/usa-9/nba-6004'
type Failure = { gameId?: number; code: 'session-unavailable' | 'navigation-failed' | 'challenge' | 'layout-unavailable' | 'deadline' }
export type NbaFirstBookCapture = { book: NbaFirstBook; observedAt: string; complete: boolean; games: NbaFirstBookGame[]; errors: Failure[]; regular?: NbaBookPropCapture[]; regularCoverage?: NbaBookPropCoverage[] }
const remaining = (deadline: number, cap = 15_000) => Math.max(1, Math.min(cap, deadline - Date.now()))
async function preparePage(page: Page) {
  page.setDefaultTimeout(10_000)
  await page.route('**/*', route => ['image', 'media', 'font'].includes(route.request().resourceType()) ? route.abort() : route.continue())
}
async function extraPage(page: Page, deadline: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const opening = page.context().newPage()
  try { return await Promise.race([opening, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('deadline')), remaining(deadline, 5000)) })]) }
  catch { void opening.then(late => late.close()).catch(() => {}); return null }
  finally { if (timer) clearTimeout(timer) }
}

async function blocked(page: Page) {
  return page.evaluate(() => {
    const text = document.body?.innerText ?? ''
    return /verify you are human|complete the security check|access denied|unusual traffic|checking your browser/i.test(text.slice(0, 20_000))
      || [...document.querySelectorAll('iframe[title]')].some(frame => /challenge|captcha/i.test(frame.getAttribute('title') ?? '') && frame.getBoundingClientRect().height > 100)
  })
}
async function openPage(page: Page, url: string, deadline: number) {
  if (Date.now() >= deadline) throw new Error('deadline')
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining(deadline, 25_000) })
  await page.waitForTimeout(Math.min(750, remaining(deadline)))
  if (await blocked(page)) throw new Error('challenge')
}
function safeFailure(error: unknown): Failure['code'] {
  return error instanceof Error && (error.message === 'challenge' || error.message === 'deadline' || error.message === 'layout-unavailable') ? error.message : 'navigation-failed'
}
async function dkBoards(page: Page, deadline: number) {
  await openPage(page, DK_LEAGUE, deadline)
  await page.locator('.cb-non-collapsible').first().waitFor({ state: 'visible', timeout: remaining(deadline) })
  // Expansion is confined to each market card; odds controls are never clicked.
  const cards = page.locator('.cb-non-collapsible'), count = Math.min(await cards.count(), 200)
  for (let i = 0; i < count && Date.now() < deadline; i++) {
    const card = cards.nth(i)
    if (!(await card.locator('.cb-market__label-name__text').filter({ hasText: /^1st Points Scorer$/ }).count())) continue
    await card.scrollIntoViewIfNeeded({ timeout: remaining(deadline, 2000) }).catch(() => {})
    for (let click = 0; click < 5; click++) {
      const more = card.getByText(/^(?:show|see|view) more$/i, { exact: true }).first()
      if (!(await more.count()) || !(await more.isVisible())) break
      await more.click({ timeout: remaining(deadline, 2000) })
      await page.waitForTimeout(300)
    }
  }
  let previous = '', boards: NbaFirstBookBoard[] = []
  for (let poll = 0; poll < 12 && Date.now() < deadline; poll++) {
    boards = await page.evaluate(readDkFirstBoards)
    const signature = JSON.stringify(boards.map(board => ({ ...board, observedAt: '' })))
    if (boards.length && signature === previous) return boards
    previous = signature
    await page.waitForTimeout(500)
  }
  return boards.map(board => ({ ...board, expanded: false }))
}

async function mgmEvent(page: Page, eventUrl: string, deadline: number) {
  await openPage(page, eventUrl, deadline)
  await page.locator('ms-scoreboard-participant .participant-name-value').first().waitFor({ state: 'visible', timeout: remaining(deadline) })
  const identity = await page.evaluate(readMgmFirstIdentity)
  if (!identity) throw new Error('layout-unavailable')
  const all = page.getByRole('button', { name: 'All', exact: true })
  await all.first().waitFor({ state: 'visible', timeout: remaining(deadline, 7000) }).catch(() => {})
  if (await all.count() !== 1) throw new Error('layout-unavailable')
  await all.click({ timeout: remaining(deadline, 3000) })
  const marketHeaders = page.locator('button[aria-controls][aria-expanded]').filter({ has: page.locator('[slot="title"]') })
  await marketHeaders.first().waitFor({ state: 'visible', timeout: remaining(deadline, 7000) }).catch(() => {})
  if (!(await marketHeaders.count())) throw new Error('layout-unavailable')
  return identity
}
async function mgmBoard(page: Page, eventUrl: string, deadline: number): Promise<NbaFirstBookBoard | null> {
  const identity = await mgmEvent(page, eventUrl, deadline)
  const header = page.locator('button[aria-controls]').filter({ has: page.locator('[slot="title"]').filter({ hasText: /^\s*First field goal scorer\s*$/ }) })
  // Wait for the markets to settle after the event header loads. Absence is
  // unavailable, never a successful empty board or a withdrawal signal.
  await header.first().waitFor({ state: 'visible', timeout: remaining(deadline, 7000) }).catch(() => {})
  if (await header.count() !== 1) return null
  if (await header.getAttribute('aria-expanded') !== 'true') await header.click({ timeout: remaining(deadline, 3000) })
  const panelId = await header.getAttribute('aria-controls')
  if (!panelId || !/^[a-zA-Z0-9_-]+$/.test(panelId)) throw new Error('layout-unavailable')
  const panel = page.locator(`#${panelId}`)
  await panel.waitFor({ state: 'visible', timeout: remaining(deadline, 5000) })
  for (let click = 0; click < 5 && Date.now() < deadline; click++) {
    const more = panel.getByText(/^(?:show|see) more$/i, { exact: true }).first()
    if (!(await more.count()) || !(await more.isVisible())) break
    await more.click({ timeout: remaining(deadline, 2000) })
    await page.waitForTimeout(350)
  }
  let prior = '', observed = { rows: [] as { name: string; odds: string }[], expanded: false }
  for (let poll = 0; poll < 8 && Date.now() < deadline; poll++) {
    observed = await page.evaluate(readMgmFirstRows, panelId)
    const signature = JSON.stringify(observed)
    if (observed.rows.length && signature === prior) {
      const currentIdentity = await page.evaluate(readMgmFirstIdentity)
      if (JSON.stringify(identity) !== JSON.stringify(currentIdentity)) throw new Error('layout-unavailable')
      return { ...identity, ...observed, observedAt: new Date().toISOString(), market: 'First field goal scorer' }
    }
    prior = signature
    await page.waitForTimeout(500)
  }
  return { ...identity, ...observed, expanded: false, observedAt: new Date().toISOString(), market: 'First field goal scorer' }
}

/** Cloud scheduled capture only. It owns one fresh, nonpersistent session and
 * releases it on every path. No collector is created from a member page read. */
export async function collectNbaFirstBooks(book: NbaFirstBook, inputs: NbaFirstBookInput[], deadlineAt?: number): Promise<NbaFirstBookCapture> {
  if (inputs.length > 30 || new Set(inputs.map(input => input.game.id)).size !== inputs.length
    || new Set(inputs.map(({ game }) => `${game.date}:${game.visitor_team.id}:${game.home_team.id}`)).size !== inputs.length) throw new Error('Invalid NBA capture slate')
  const result: NbaFirstBookCapture = { book, observedAt: new Date().toISOString(), complete: false, games: [], errors: [] }
  const active = inputs.filter(input => nbaPregameOpen(input.game))
  result.games = inputs.filter(input => !nbaPregameOpen(input.game)).map(input => nbaFirstBookMissing(input.game.id, 'closed'))
  if (!active.length) return result
  let session: Awaited<ReturnType<typeof openSession>> | undefined
  const deadline = Math.min(Date.now() + 240_000, Number.isFinite(deadlineAt) ? deadlineAt! : Infinity)
  if (deadline - Date.now() < 20_000) return { ...result, games: [...result.games, ...active.map(input => nbaFirstBookMissing(input.game.id, 'deadline'))], errors: [{ code: 'deadline' }] }
  try {
    session = await openSession({ timeoutSeconds: 300, requestTimeoutMs: 20_000, solveCaptchas: false, geoState: 'NC',
      proxyDomainPattern: book === 'betmgm' ? BETMGM_PROXY_DOMAIN_PATTERN : '^([a-zA-Z0-9-]+\\.)*draftkings\\.com$', metadata: { sport: 'nba', book, mode: 'first-market-dom' } })
    const page = session.page
    await preparePage(page)
    if (book === 'draftkings') {
      const boards = await dkBoards(page, deadline)
      for (const input of active) {
        const matching = boards.filter(board => nbaFirstBookTeam(board.away, input.game.visitor_team) && nbaFirstBookTeam(board.home, input.game.home_team))
        const evaluated = matching.map(board => nbaNormalizeFirstBook(book, input, board)), valid = evaluated.filter(item => item.status !== 'identity-mismatch')
        result.games.push(valid.length === 1 ? valid[0] : nbaFirstBookMissing(input.game.id, matching.length ? 'identity-mismatch' : 'unlisted'))
      }
    } else {
      await openPage(page, MGM_LEAGUE, deadline)
      const events = page.getByRole('tab', { name: /^Events$/i })
      await events.first().waitFor({ state: 'visible', timeout: remaining(deadline, 7000) }).catch(() => {})
      if (await events.count()) await events.first().click({ timeout: remaining(deadline, 3000) })
      await page.locator('a[href*="/en/sports/events/"]').first().waitFor({ state: 'attached', timeout: remaining(deadline) })
      const links = await page.locator('a[href*="/en/sports/events/"]').evaluateAll(anchors => [...new Set(anchors.map(anchor => (anchor as HTMLAnchorElement).href))])
      const tasks: { input: NbaFirstBookInput; url: string }[] = []
      for (const input of active) {
        if (Date.now() >= deadline) { result.games.push(nbaFirstBookMissing(input.game.id, 'deadline')); result.errors.push({ gameId: input.game.id, code: 'deadline' }); continue }
        // The current league's rendered links are discovery only. The event's
        // visible oriented teams and date must independently pass normalization.
        const labels = [input.game.visitor_team, input.game.home_team].map(team => [nbaName(team.full_name), ...(team.abbreviation === 'LAC' ? [nbaName('Los Angeles Clippers')] : [])])
        const candidates = links.filter(href => { const url = new URL(href); return url.origin === 'https://www.nc.betmgm.com' && url.pathname.startsWith('/en/sports/events/') && labels.every(names => names.some(name => nbaName(url.pathname).includes(name))) })
        if (candidates.length !== 1) { result.games.push(nbaFirstBookMissing(input.game.id, candidates.length ? 'identity-mismatch' : 'unlisted')); continue }
        tasks.push({ input, url: candidates[0] })
      }
      const pages = [page]
      while (pages.length < Math.min(4, tasks.length) && deadline - Date.now() > 20_000) {
        const extra = await extraPage(page, deadline)
        if (!extra) break
        await preparePage(extra); pages.push(extra)
      }
      result.regular = []; result.regularCoverage = []
      let next = 0, challenged = false
      const regularTasks: typeof tasks = [], currentUrls = new Map<Page, string>()
      await Promise.all(pages.map(async worker => {
        while (next < tasks.length && !challenged) {
          const { input, url } = tasks[next++]
          if (Date.now() >= deadline) { result.games.push(nbaFirstBookMissing(input.game.id, 'deadline')); result.regularCoverage!.push(...nbaUnresolvedBookCoverage(input.game.id)); continue }
          try {
            const board = await mgmBoard(worker, url, deadline)
            currentUrls.set(worker, url)
            const first = board ? nbaNormalizeFirstBook(book, input, board) : nbaFirstBookMissing(input.game.id, 'unavailable')
            result.games.push(first)
            if (first.status !== 'closed' && first.status !== 'identity-mismatch') regularTasks.push({ input, url })
            else if (first.status !== 'closed') result.regularCoverage!.push(...nbaUnresolvedBookCoverage(input.game.id))
          } catch (error) {
            const code = safeFailure(error)
            result.errors.push({ gameId: input.game.id, code }); result.games.push(nbaFirstBookMissing(input.game.id, code === 'deadline' ? 'deadline' : 'error'))
            result.regularCoverage!.push(...nbaUnresolvedBookCoverage(input.game.id))
            if (code === 'challenge') challenged = true
          }
        }
      }))
      // All First Basket boards get a turn before a deep regular-price ladder
      // can consume the session. Each regular game receives a bounded share.
      next = 0
      const regularBudget = Math.max(0, Math.floor((deadline - Date.now()) / Math.max(1, Math.ceil(regularTasks.length / pages.length))) - 1000)
      await Promise.all(pages.map(async worker => {
        while (next < regularTasks.length && !challenged) {
          const { input, url } = regularTasks[next++], gameDeadline = Math.min(deadline, Date.now() + regularBudget)
          try {
            if (gameDeadline - Date.now() < 1000) throw new Error('deadline')
            if (currentUrls.get(worker) !== url) await mgmEvent(worker, url, gameDeadline)
            const regular = await collectMgmProps(worker, input, gameDeadline)
            result.regular!.push(...regular.frames); result.regularCoverage!.push(...regular.coverage)
          } catch (error) {
            result.regularCoverage!.push(...nbaUnresolvedBookCoverage(input.game.id))
            if (safeFailure(error) === 'challenge') challenged = true
          }
        }
      }))
      for (const { input } of regularTasks.slice(next)) result.regularCoverage.push(...nbaUnresolvedBookCoverage(input.game.id))
    }
  } catch (error) { result.errors.push({ code: session ? safeFailure(error) : 'session-unavailable' }) }
  finally { await session?.close() }
  const completed = new Set(result.games.map(game => game.gameId))
  for (const input of active) if (!completed.has(input.game.id)) result.games.push(nbaFirstBookMissing(input.game.id, 'error'))
  result.complete = result.games.length > 0 && result.games.every(game => game.complete)
  result.observedAt = new Date().toISOString()
  return result
}
