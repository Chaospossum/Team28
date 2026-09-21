import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { filterEcoCrop, loadEcoCrop } from './ecocrop.js'
import { rankPlants } from './llm.js'
import { fetchPdokSoilType } from './pdok.js'
import { fetchSoilGrids, textureClass } from './soil.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const DEMO_PATH = path.join(__dirname, 'data', 'demo-maastricht.json')
const PORT = 43124

loadEcoCrop()

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

function loadDemo() {
  if (!fs.existsSync(DEMO_PATH)) return null
  try {
    return JSON.parse(fs.readFileSync(DEMO_PATH, 'utf8'))
  } catch {
    return null
  }
}

function saveDemo(payload) {
  const json = JSON.stringify(payload, null, 2)
  fs.writeFileSync(DEMO_PATH, json)
  const publicPath = path.join(__dirname, '..', 'public', 'demo-maastricht.json')
  fs.writeFileSync(publicPath, json)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/demo', (_req, res) => {
  const demo = loadDemo()
  if (!demo) return res.status(404).json({ error: 'no_demo_cache' })
  res.json(demo)
})

app.get('/api/soil', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon required' })
  }
  const soil = await fetchSoilGrids(lat, lon)
  res.json(soil)
})

app.get('/api/pdok', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon required' })
  }
  const soil_type_nl = await fetchPdokSoilType(lat, lon)
  res.json({ soil_type_nl })
})

app.post('/api/recommend', async (req, res) => {
  const { siteProfile, saveAsDemo } = req.body ?? {}
  if (!siteProfile?.lat || !siteProfile?.lon) {
    return res.status(400).json({ error: 'siteProfile required' })
  }

  try {
    const shortlist = filterEcoCrop(siteProfile, 30)
    const { plants, usedLlm, source } = await rankPlants(siteProfile, shortlist)
    const payload = {
      siteProfile,
      plants,
      shortlistCount: shortlist.length,
      rankingSource: source,
      usedLlm,
    }
    if (saveAsDemo) saveDemo(payload)
    res.json(payload)
  } catch (err) {
    const demo = loadDemo()
    if (demo) return res.json({ ...demo, fallback: true, error: String(err.message || err) })
    res.status(500).json({ error: String(err.message || err) })
  }
})

app.post('/api/enrich', async (req, res) => {
  const profile = req.body?.siteProfile
  if (!profile?.lat || !profile?.lon) {
    return res.status(400).json({ error: 'siteProfile required' })
  }
  const lat = profile.lat
  const lon = profile.lon

  const [soil, pdok] = await Promise.all([
    fetchSoilGrids(lat, lon),
    fetchPdokSoilType(lat, lon),
  ])

  const enriched = {
    ...profile,
    soil_ph: soil.soil_ph ?? profile.soil_ph ?? null,
    clay_pct: soil.clay_pct ?? null,
    sand_pct: soil.sand_pct ?? null,
    soc: soil.soc ?? null,
    soil_type_nl: pdok ?? null,
    pdok_unavailable: !pdok,
    texture_class: textureClass(soil.clay_pct, soil.sand_pct),
    sources: [
      ...(profile.sources ?? []),
      soil.ok ? soil.source : `SoilGrids (${soil.error || 'unavailable'})`,
      pdok ? 'PDOK BRO Bodemkaart' : null,
    ].filter(Boolean),
    data_resolution_note:
      'Soil data ≈250 m resolution, climate ≈km scale. Neighbourhood estimate, not a soil test.',
  }

  res.json({ siteProfile: enriched, soilOk: soil.ok, pdokOk: !!pdok })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${PORT}`)
})
