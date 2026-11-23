import fs from 'node:fs/promises'

// Called inside the Codex in-app browser runtime, with its existing tab handles.
// This helper reads rendered UI; every interaction still uses the browser API.
export async function mobileReview({ auditTab, flowTab, output }) {
  await fs.mkdir(output, { recursive: true })
  const read = async name => JSON.parse(await fs.readFile(`${output}/${name}.json`, 'utf8').catch(() => '[]'))
  const evidence = {
    baseline: await read('baseline'),
    narrow: await read('narrow'),
    flows: await read('flows'),
  }
  const save = name => fs.writeFile(`${output}/${name}.json`, JSON.stringify(evidence[name], null, 2))
  const measure = () => {
    const visible = element => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0 && !element.closest('[inert],[hidden]')
    const scope = [...document.querySelectorAll('[role=dialog]')].filter(visible).at(-1) || document.querySelector('main') || document.body
    const dock=document.querySelector('nav[aria-label="Primary navigation"]')
    const dockTop=dock&&visible(dock)?dock.getBoundingClientRect().top:innerHeight
    return {
      url: location.pathname + location.search,
      width: innerWidth, height: innerHeight,
      theme: document.documentElement.dataset.theme,
      overflow: document.documentElement.scrollWidth > innerWidth,
      routeError: scope.textContent?.includes('We could not load this view. Your account and saved data are safe.') || false,
      sendClearance:[...scope.querySelectorAll('button[aria-label="Send message"]')].filter(visible).map(button=>{
        const bounds=button.getBoundingClientRect(),clipping=[]
        for(let parent=button.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
          if(!/hidden|clip/.test(getComputedStyle(parent).overflowY))continue
          const edge=parent.getBoundingClientRect()
          if(bounds.bottom>edge.bottom+1||bounds.top<edge.top-1)clipping.push(parent.className)
        }
        return {top:bounds.top,bottom:bounds.bottom,dockTop,aboveDock:bounds.bottom<=dockTop,clipping}
      }),
      headings: [...scope.querySelectorAll('h1,h2,h3')].map(element => element.textContent),
      dialogs: [...document.querySelectorAll('[role=dialog]')].filter(visible).map(element => {
        const bounds = element.getBoundingClientRect()
        return { name: element.getAttribute('aria-label') || element.getAttribute('aria-labelledby'), bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } }
      }),
      selects: [...scope.querySelectorAll('select')].filter(visible).map(element => ({ name: element.getAttribute('aria-label') || element.labels?.[0]?.textContent, value: element.value })),
      small: [...scope.querySelectorAll('button')].filter(visible).flatMap(element => {
        const bounds = element.getBoundingClientRect()
        return bounds.height < 43.8 ? [{ name: element.getAttribute('aria-label') || element.textContent?.trim(), width: Math.round(bounds.width), height: Math.round(bounds.height), chartPoint: element.hasAttribute('data-line-point'), touchAlternative: !!element.closest('figure')?.querySelector('input[type=range]') }] : []
      }),
      fields: [...scope.querySelectorAll('input:not([type=hidden]),textarea,select')].filter(visible).map(element => ({ name: element.getAttribute('aria-label') || element.labels?.[0]?.textContent?.slice(0,60), type: element.type, fontSize: getComputedStyle(element).fontSize, height: element.getBoundingClientRect().height, invalid: element.matches(':invalid') })),
      loading: [...scope.querySelectorAll('[role=status]')].filter(visible).map(element => element.textContent?.trim()).filter(text => /^Loading|^Checking/.test(text)),
      errors: [...scope.querySelectorAll('[role=alert]')].map(element => element.textContent?.trim()).filter(Boolean),
      brokenImages: [...scope.querySelectorAll('img')].filter(element => visible(element) && element.complete && !element.naturalWidth).map(element => element.alt),
      tables: [...scope.querySelectorAll('table')].filter(visible).map(element => ({ name: element.getAttribute('aria-label') || element.caption?.textContent, rows: element.rows.length, headers: [...element.querySelectorAll('thead th')].map(header => header.textContent?.trim()).slice(0,12) })),
    }
  }
  return {
    evidence,
    async items() {
      return auditTab.playwright.getByRole('combobox', { name: 'Audit surface', exact: true }).locator('option').evaluateAll(options => options.map(option => ({ id: option.value, label: option.textContent })))
    },
    async audit(item, { narrow = false, stage = 'layout-measurements', drawer } = {}) {
      await auditTab.playwright.getByRole('combobox', { name: 'Audit surface', exact: true }).selectOption(item.id)
      const views = narrow ? ['small-light','small-dark','tablet-light','tablet-dark','landscape-light','landscape-dark'] : ['phone-light','phone-dark','desktop-light','desktop-dark']
      await Promise.all(views.map(view => {
        const frame = auditTab.playwright.frameLocator(`iframe[title="${view}"]`)
        return (async()=>{
          await (drawer ? frame.getByRole('dialog', { name: drawer, exact: true }) : frame.locator('main')).waitFor({ state: 'visible', timeout: 10000 })
          await frame.locator(`html[data-theme="${view.endsWith('light')?'light':'dark'}"][data-appearance-ready="true"]`).waitFor({state:'attached'})
          await frame.getByRole('status').filter({hasText:/^(Loading|Checking)/}).first().waitFor({state:'hidden',timeout:15000})
        })()
      }))
      await auditTab.playwright.getByRole('button', { name: 'Check layout', exact: true }).click()
      const layouts = JSON.parse(await auditTab.playwright.locator('pre[aria-label="Layout results"]').textContent())
      const record = { id: item.id, label: item.label, stage, at: new Date().toISOString(), layouts }
      const destination = narrow ? 'narrow' : 'baseline'
      evidence[destination].push(record)
      await save(destination)
      return { id: item.id, views: Object.keys(layouts).length, issues: Object.entries(layouts).filter(([, result]) => result.error || result.overflow || result.unnamed).map(([view, result]) => ({view, ...result})), small: layouts[views[0]]?.smallButtons }
    },
    async capture(name, { wait = true } = {}) {
      const expectedTheme = await flowTab.playwright.evaluate(() => new URL(location.href).searchParams.get('reviewTheme'))
      if (expectedTheme) await flowTab.playwright.locator(`html[data-theme="${expectedTheme}"][data-appearance-ready="true"]`).waitFor({state:'attached'})
      if (wait) await flowTab.playwright.getByRole('status').filter({ hasText: /^(Loading|Checking)/ }).first().waitFor({ state: 'hidden', timeout: 15000 })
      const record = { case: name, at: new Date().toISOString(), ...await flowTab.playwright.evaluate(measure) }
      evidence.flows.push(record)
      await save('flows')
      return { case: name, theme: record.theme, overflow: record.overflow, loading: record.loading, errors: record.errors, small: record.small.filter(item => !item.chartPoint || !item.touchAlternative) }
    },
    async pageLayouts(item, { viewport, origin, href, stage = 'individual-page-layouts' }) {
      const layouts = {}
      for (const [size, width, height] of [['small',320,740],['tablet',820,1024],['landscape',844,390]]) {
        await viewport.set({ width, height })
        for (const theme of ['light','dark']) {
          const url = new URL(href, origin)
          url.searchParams.set('reviewTheme',theme)
          url.searchParams.set('reviewMatrix','1')
          await flowTab.goto(url.href)
          await flowTab.playwright.locator('main').waitFor({state:'visible'})
          await flowTab.playwright.locator(`html[data-theme="${theme}"]`).waitFor({state:'attached'})
          await flowTab.playwright.getByRole('status').filter({hasText:/^(Loading|Checking)/}).first().waitFor({state:'hidden',timeout:15000})
          await flowTab.playwright.getByText(/^Checking (NBA|NFL) access/).waitFor({state:'hidden',timeout:10000})
          layouts[`${size}-${theme}`] = await flowTab.playwright.evaluate(measure)
        }
      }
      evidence.narrow.push({id:item.id,label:item.label,stage,at:new Date().toISOString(),layouts})
      await save('narrow')
      return {id:item.id,views:Object.keys(layouts).length,issues:Object.entries(layouts).filter(([,result])=>result.overflow||result.errors.length||result.loading.length)}
    },
    async screenshot(name) {
      const path = `${output}/${name.replace(/[^a-z0-9-]/gi, '-')}.jpg`
      await fs.writeFile(path, await flowTab.screenshot({ fullPage: false }))
      return path
    },
  }
}
