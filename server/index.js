import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { recommend, routes } from './api.js'
import { setCacheStore } from './cacheStore.js'
import { loadEcoCrop, loadInteractions, loadPollinatorCsv } from './dataFiles.js'
import { diskCacheStore } from './diskCache.js'
import { fetchPdokWmsMap, warmPdokWmsCache } from './pdokWms.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const DEMO_PATH = path.join(__dirname, 'data', 'demo-maastricht.json')
const DEMO2050_PATH = path.join(__dirname, 'data', 'demo-maastricht-2050.json')
const PORT = 43124
const SAVE_DEMO_ALLOWED = process.env.RIGHT_PLANT_SAVE_DEMO === '1'

setCacheStore(diskCacheStore)
loadEcoCrop()
loadPollinatorCsv()
loadInteractions()

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

function saveDemo(payload, target = DEMO_PATH) {
  const json = JSON.stringify(payload, null, 2)
  fs.writeFileSync(target, json)
  const base = path.basename(target)
  const publicPath = path.join(__dirname, '..', 'public', base)
  fs.writeFileSync(publicPath, json)
}

function loadDemoFile(filePath) {
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

app.get('/api/demo', (_req, res) => {
  const demo = loadDemoFile(DEMO_PATH)
  if (!demo) return res.status(404).json({ error: 'no_demo_cache' })
  res.json(demo)
})

app.get('/api/demo-2050', (_req, res) => {
  const demo = loadDemoFile(DEMO2050_PATH)
  if (!demo) return res.status(404).json({ error: 'no_demo_2050_cache' })
  res.json(demo)
})

app.get('/api/pdok/wms', async (req, res) => {
  const result = await fetchPdokWmsMap(req.query)
  if (!result.ok) return res.status(result.status ?? 502).end()
  res.set('Cache-Control', 'public, max-age=86400')
  res.type('png').send(result.body)
})

app.post('/api/recommend', async (req, res) => {
  const { saveAsDemo, saveAsDemo2050 } = req.body ?? {}
  try {
    const { status, body: payload } = await recommend(req.body)
    if (status !== 200) return res.status(status).json(payload)
    if (saveAsDemo) {
      if (!SAVE_DEMO_ALLOWED) {
        return res.status(403).json({ error: 'saveAsDemo disabled (set RIGHT_PLANT_SAVE_DEMO=1)' })
      }
      saveDemo(payload, DEMO_PATH)
    }
    if (saveAsDemo2050) {
      if (!SAVE_DEMO_ALLOWED) {
        return res.status(403).json({ error: 'saveAsDemo2050 disabled (set RIGHT_PLANT_SAVE_DEMO=1)' })
      }
      saveDemo(payload, DEMO2050_PATH)
    }
    res.json(payload)
  } catch (err) {
    const demo = loadDemoFile(DEMO_PATH)
    if (demo) return res.json({ ...demo, fallback: true, error: String(err.message || err) })
    res.status(500).json({ error: String(err.message || err) })
  }
})

for (const [key, handler] of Object.entries(routes)) {
  const [method, route] = key.split(' ')
  if (route === '/api/recommend') continue
  app[method.toLowerCase()](route, async (req, res) => {
    const { status, body } = await handler(req.query, req.body)
    res.status(status).json(body)
  })
}

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${PORT}`)
  if (process.env.PDOK_WARM === '1') {
    warmPdokWmsCache().catch((err) => {
      console.warn('[pdok-wms] warm-up failed:', err?.message ?? err)
    })
  }
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[api] Port ${PORT} is already in use. Stop the other dev server, or run: lsof -ti tcp:${PORT} | xargs kill`,
    )
    process.exit(1)
  }
  throw err
})
