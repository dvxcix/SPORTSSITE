import type { Page } from 'playwright-core'
import { readMgmFirstIdentity } from './nbaFirstBookDom'
import { nbaBookObservation, nbaSameBookIdentity, type NbaFirstBookInput } from './nbaFirstBookQuotes'
import { MGM_MILESTONE_PANELS, nbaBookPropContract, nbaBookPropMissing, nbaNormalizeBookProp, nbaUnresolvedBookCoverage, type NbaBookPropCapture, type NbaBookPropCoverage } from './nbaBookPropQuotes'
import { readMgmPropMenu, readMgmPropPanel, type MgmPropPanel } from './nbaBookPropDom'

type CaptureDeadline = number | (() => number)
const cutoff = (deadline: CaptureDeadline) => typeof deadline === 'function' ? deadline() : deadline
const remaining = (deadline: CaptureDeadline, cap = 3000) => Math.max(1, Math.min(cap, cutoff(deadline) - Date.now()))
export async function collectMgmProps(page: Page, input: NbaFirstBookInput, deadline: CaptureDeadline) {
  const frames: NbaBookPropCapture[] = [], coverage: NbaBookPropCoverage[] = []
  const identity = await page.evaluate(readMgmFirstIdentity), observedAt = new Date().toISOString()
  if (!identity || ['closed', 'identity-mismatch'].includes(nbaBookObservation(input, { ...identity, observedAt }).status)) return { frames, coverage: nbaUnresolvedBookCoverage(input.game.id, observedAt) }
  let menu = await page.evaluate(readMgmPropMenu), stable = false, menuStableAt = Date.now()
  for (let poll = 0; poll < 16 && Date.now() < cutoff(deadline); poll++) {
    await page.waitForTimeout(250)
    const next = await page.evaluate(readMgmPropMenu)
    if (JSON.stringify(next) !== JSON.stringify(menu)) menuStableAt = Date.now()
    if (next.headers.length && next.allSelected && !next.loading && JSON.stringify(next) === JSON.stringify(menu) && Date.now() - menuStableAt >= 1000) { menu = next; stable = true; break }
    menu = next
  }
  if (!stable) return { frames, coverage: nbaUnresolvedBookCoverage(input.game.id, observedAt) }
  if (!menu.headers.some(item => item.title.startsWith('Player '))) return { frames, coverage: nbaUnresolvedBookCoverage(input.game.id, observedAt).map(scope => ({ ...scope, status: 'unavailable' as const })) }
  if (!menu.headers.some(item => MGM_MILESTONE_PANELS[item.title])) return { frames, coverage: nbaUnresolvedBookCoverage(input.game.id, observedAt) }
  for (const [title, market] of Object.entries(MGM_MILESTONE_PANELS)) {
    const initiallyPresent = menu.headers.some(item => item.title === title)
    const scope: NbaBookPropCoverage = { gameId: input.game.id, market, complete: false, observedAt: new Date().toISOString(), contracts: [] }
    coverage.push(scope)
    if (!initiallyPresent) { scope.complete = true; continue }
    if(cutoff(deadline)-Date.now()<1000){scope.status='deadline';continue}
    try {
      // Opening an earlier accordion can replace later headers and panel IDs.
      // Resolve this known family again; its disappearance is not a withdrawal.
      const currentIdentity = await page.evaluate(readMgmFirstIdentity)
      if (!nbaSameBookIdentity(input, identity, currentIdentity, Date.now())) continue
      const familyDeadline = Math.min(cutoff(deadline), Date.now() + 1500)
      let currentMenu = await page.evaluate(readMgmPropMenu)
      while ((!currentMenu.allSelected || currentMenu.loading || currentMenu.headers.filter(item => item.title === title).length !== 1)
        && Date.now() < Math.min(cutoff(deadline), familyDeadline)) {
        await page.waitForTimeout(Math.max(1, Math.min(125, Math.min(cutoff(deadline), familyDeadline) - Date.now())))
        currentMenu = await page.evaluate(readMgmPropMenu)
      }
      if (Date.now() >= cutoff(deadline)) { scope.status = 'deadline'; continue }
      if (Date.now() >= familyDeadline) continue
      if (!currentMenu.allSelected || currentMenu.loading) continue
      const matches = currentMenu.headers.filter(item => item.title === title)
      if (matches.length !== 1) continue
      const panelId = matches[0].id, panel = page.locator(`#${panelId}`)
      const header = page.locator(`button[aria-controls="${panelId}"]`)
      if (await header.count() !== 1) continue
      if (await header.getAttribute('aria-expanded') !== 'true') await header.click({ timeout: remaining(deadline) })
      await panel.waitFor({ state: 'visible', timeout: remaining(deadline) })
      let initial = await page.evaluate(readMgmPropPanel, panelId)
      for (let poll = 0; !initial.targets.length && poll < 12 && Date.now() < cutoff(deadline); poll++) {
        await page.waitForTimeout(125); initial = await page.evaluate(readMgmPropPanel, panelId)
      }
      const targets = [...new Set(initial.targets)], contracts = targets.map(target => nbaBookPropContract(title, target))
      scope.contracts = contracts.flatMap(contract => contract ? [contract.key] : [])
      const validTargets = targets.length > 0 && targets.length <= 20 && targets.length === initial.targets.length && contracts.every(Boolean)
      scope.complete = Boolean(validTargets && (!initial.lineTable || initial.expanded && initial.targetsComplete))
      scope.observedAt = new Date().toISOString()
      if (!validTargets) { if(Date.now()>=cutoff(deadline))scope.status='deadline';continue }
      for (const target of targets) {
        if (cutoff(deadline) - Date.now() < 500) { frames.push(nbaBookPropMissing(input.game.id, title, target, 'deadline')!); continue }
        // One retry shares the original maximum click + readiness window.
        // Keep an unfinished transition across a click that throws after the
        // selection changes, so old rows cannot become a new target's prices.
        const targetDeadline = Date.now() + 6500
        let pendingTransition: string | null = null
        for (let attempt = 0; attempt < 2; attempt++) {
          let extracting = true
          try {
            if (attempt > 0) {
              const retryIdentity = await page.evaluate(readMgmFirstIdentity)
              if (!nbaSameBookIdentity(input, identity, retryIdentity, Date.now())) {
                frames.push(nbaBookPropMissing(input.game.id, title, target, 'identity-mismatch')!); break
              }
            }
            // A previously captured panel is not a transition baseline: live
            // odds may have changed since it was verified. Read just before click.
            const before:MgmPropPanel = await page.evaluate(readMgmPropPanel,panelId)
            const tab = panel.getByRole('tab', { name: target, exact: true })
            const binary = nbaBookPropContract(title, target)?.type === 'over_under'
            const requiresChange = !binary && before.selectedTarget !== target
            if (Date.now() >= Math.min(cutoff(deadline), targetDeadline)) throw new Error('deadline')
            // Locator.click is strict: absent or duplicate exact tabs fail.
            if (requiresChange && !binary) {
              pendingTransition = before.signature
              await tab.click({ timeout: remaining(Math.min(cutoff(deadline), targetDeadline), 2000) })
            }
            let row:MgmPropPanel = before
            let responseRequired = pendingTransition !== null, moreClicks = 0
            let transitionBaseline: string = pendingTransition ?? before.signature
            for (let action = 0; action < 8 && Date.now() < Math.min(cutoff(deadline), targetDeadline); action++) {
              const until = Math.min(cutoff(deadline), targetDeadline)
              row = await page.evaluate(readMgmPropPanel, { panelId, target, settle:{timeoutMs:Math.max(0,until-Date.now()),...(responseRequired?{transitionFrom:transitionBaseline}:{})} })
              const changed = !responseRequired || row.signature !== transitionBaseline
              if (row.selectedTarget === target && changed) {
                const all = panel.getByRole('tab', { name: 'All', exact: true })
                if (!row.allSelected) { transitionBaseline = row.signature; pendingTransition = transitionBaseline; responseRequired = true; await all.click({ timeout: remaining(until, 1500) }); continue }
                const more = panel.getByText('Show More', { exact: true }).first()
                if (!row.expanded && moreClicks < 5 && await more.count() && await more.isVisible()) {
                  transitionBaseline = row.signature; pendingTransition = transitionBaseline; responseRequired = true; await more.click({ timeout: remaining(until, 1500) }); moreClicks++; continue
                }
              }
              // Another worker can finish while this bounded in-page wait runs.
              // Reclaim that newly available budget without restarting a tab.
              if(!row.settled&&Date.now()>=until&&Math.min(cutoff(deadline),targetDeadline)>until)continue
              break
            }
            const current = await page.evaluate(readMgmFirstIdentity)
            if (Date.now() >= cutoff(deadline) || Date.now() >= targetDeadline) {
              frames.push(nbaBookPropMissing(input.game.id, title, target, Date.now() >= cutoff(deadline) ? 'deadline' : row.settled ? 'error' : 'partial')!); break
            }
            if ('lineTable' in row) {
              const discovered = [...new Set([...targets, ...row.targets])]
              const valid = discovered.length <= 20 && discovered.every(value => nbaBookPropContract(title, value))
              scope.complete = Boolean(valid && row.targetsComplete && row.expanded && row.allSelected && row.settled && targets.every(value => row.targets.includes(value)))
              if (valid) {
                for (const value of discovered) if (!targets.includes(value)) targets.push(value)
                scope.contracts = targets.map(value => nbaBookPropContract(title, value)!.key)
              }
            }
            extracting = false
            if (!nbaSameBookIdentity(input, identity, current, Date.now())) { frames.push(nbaBookPropMissing(input.game.id, title, target, 'identity-mismatch')!); break }
            const frame = nbaNormalizeBookProp(input, { ...current!, title, target, selectedTarget: row.selectedTarget, observedAt: new Date().toISOString(),
              expanded: row.expanded && row.allSelected && row.settled===true, transitioned: (!responseRequired || row.signature !== transitionBaseline), rows: row.rows })
            if (frame) frames.push(frame)
            break
          } catch {
            if (extracting && attempt === 0 && Math.min(cutoff(deadline), targetDeadline) - Date.now() >= 500) continue
            frames.push(nbaBookPropMissing(input.game.id, title, target, Date.now() >= cutoff(deadline) ? 'deadline' : 'error')!)
            break
          }
        }
      }
    } catch { scope.complete = false;if(Date.now()>=cutoff(deadline))scope.status='deadline' }
  }
  const finalIdentity = await page.evaluate(readMgmFirstIdentity)
  if (!nbaSameBookIdentity(input, identity, finalIdentity, Date.now())) {
    return { frames: frames.map(frame => ({ ...frame, complete: false, props: [], status: 'identity-mismatch' as const })), coverage: coverage.map(scope => ({ ...scope, complete: false })) }
  }
  return { frames, coverage }
}
