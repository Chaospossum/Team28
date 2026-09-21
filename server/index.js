import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchBuildings3dBag } from './bag3d.js'
import { filterEcoCrop, loadEcoCrop } from './ecocrop.js'
import { loadPollinatorCsv, rankWithGoals } from './goals.js'
import { rankPlants } from './llm.js'
import { fetchPdokSoilType } from './pdok.js'
import { fetchSoilGrids, textureClass } from './soil.js'
import { suggestGuild, loadInteractions } from './guild.js'
import { classifySiteContext } from './urban.js'
import { buildStructuredWhy, nearMisses } from './why.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const DEMO_PATH = path.join(__dirname, 'data', 'demo-maastricht.json')
const DEMO2050_PATH = path.join(__dirname, 'data', 'demo-maastricht-2050.json')
const PORT = 43124

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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

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
  const { siteProfile, saveAsDemo, saveAsDemo2050, lang, prefs } = req.body ?? {}
  if (!siteProfile?.lat || !siteProfile?.lon) {
    return res.status(400).json({ error: 'siteProfile required' })
  }

  try {
    let shortlist = filterEcoCrop(siteProfile, 50)
    if (prefs) shortlist = rankWithGoals(shortlist, siteProfile, prefs).slice(0, 30)
    const { plants: ranked, usedLlm, source } = await rankPlants(siteProfile, shortlist, lang ?? 'en')
    const byName = new Map(shortlist.map((s) => [s.name.toLowerCase(), s]))
    const plants = ranked.map((p) => {
      const s = byName.get(p.name.toLowerCase())
      if (!s) return p
      return {
        ...p,
        why_structured: buildStructuredWhy(s, siteProfile),
        ranges: {
          tmin: s.tmin,
          tmax: s.tmax,
          rmin: s.rmin,
          rmax: s.rmax,
          phmin: s.phmin,
          phmax: s.phmax,
          limn: s.limn,
          limx: s.limx,
        },
      }
    })
    const payload = {
      siteProfile,
      plants,
      shortlistCount: shortlist.length,
      rankingSource: source,
      usedLlm,
    }
    if (saveAsDemo) saveDemo(payload, DEMO_PATH)
    if (saveAsDemo2050) saveDemo(payload, DEMO2050_PATH)
    if (lang) payload.lang = lang
    res.json(payload)
  } catch (err) {
    const demo = loadDemoFile(DEMO_PATH)
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

  const [soil, pdok, context] = await Promise.all([
    fetchSoilGrids(lat, lon),
    fetchPdokSoilType(lat, lon),
    classifySiteContext(lat, lon),
  ])

  const enriched = {
    ...profile,
    site_context: context,
    soil_ph: soil.soil_ph ?? profile.soil_ph ?? null,
    clay_pct: soil.clay_pct ?? null,
    sand_pct: soil.sand_pct ?? null,
    soc: soil.soc ?? null,
    soil_type_nl: pdok ?? null,
    pdok_unavailable: !pdok,
    soil_distance_km: soil.soil_distance_km ?? 0,
    soil_resolution_note: soil.soil_resolution_note ?? null,
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

app.get('/api/bag3d', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon required' })
  }
  const data = await fetchBuildings3dBag(lat, lon)
  res.json(data)
})

app.post('/api/why-near', async (req, res) => {
  const { siteProfile } = req.body ?? {}
  if (!siteProfile) return res.status(400).json({ error: 'siteProfile required' })
  const shortlist = filterEcoCrop(siteProfile, 200)
  const misses = nearMisses(shortlist, siteProfile, 5)
  res.json({ nearMisses: misses })
})

app.post('/api/why-plant', async (req, res) => {
  const { siteProfile, plantName } = req.body ?? {}
  if (!siteProfile) return res.status(400).json({ error: 'siteProfile required' })
  const shortlist = filterEcoCrop(siteProfile, 500)
  const plant = shortlist.find((p) => p.name.toLowerCase() === String(plantName ?? '').toLowerCase())
  if (!plant) {
    return res.json({
      found: false,
      nearMisses: nearMisses(shortlist, siteProfile, 5),
    })
  }
  res.json({
    found: true,
    name: plant.name,
    why_structured: buildStructuredWhy(plant, siteProfile),
  })
})

app.post('/api/guild', async (req, res) => {
  const { siteProfile, prefs } = req.body ?? {}
  if (!siteProfile) return res.status(400).json({ error: 'siteProfile required' })
  let shortlist = filterEcoCrop(siteProfile, 50)
  if (prefs) shortlist = rankWithGoals(shortlist, siteProfile, prefs).slice(0, 30)
  res.json(suggestGuild(shortlist, prefs))
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${PORT}`)
})
