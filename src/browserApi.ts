/**
 * Static builds (GitHub Pages) have no Express server. This answers the app's
 * `/api/*` requests in the browser with the same route logic (server/api.js),
 * which calls SoilGrids, PDOK, 3DBAG, GBIF and Open-Meteo directly (all send CORS headers).
 * The LLM rephrase is off here (API keys can't ship to the browser); ranking is rule-based.
 */
import { loadCsvTables, routes } from '../server/browser.js'
import { demoJsonUrl } from './staticHost'

let dataReady: Promise<void> | null = null

function loadData() {
  dataReady ??= Promise.all([
    import('../server/data/EcoCrop_DB.csv?raw'),
    import('../server/data/pollinator_value.csv?raw'),
    import('../server/data/interactions.csv?raw'),
  ]).then(([eco, poll, inter]) => {
    loadCsvTables({ ecocrop: eco.default, pollinators: poll.default, interactions: inter.default })
  })
  return dataReady
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function installBrowserApi() {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return realFetch(input, init)
    }
    if (url.pathname === '/api/demo') return realFetch(demoJsonUrl('demo-maastricht.json'))
    if (url.pathname === '/api/demo-2050') return realFetch(demoJsonUrl('demo-maastricht-2050.json'))

    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const handler = routes[`${method} ${url.pathname}`]
    if (!handler) return json(404, { error: 'not_available_in_static_build' })
    try {
      await loadData()
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      const result = await handler(Object.fromEntries(url.searchParams), body)
      return json(result.status, result.body)
    } catch (err) {
      return json(500, { error: String((err as Error)?.message ?? err) })
    }
  }
}
