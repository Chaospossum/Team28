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
import { fetchFungalTraits } from './fungi.js'
import { buildStructuredWhy, nearMisses } from './why.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const DEMO_PATH = path.join(__dirname, 'data', 'demo-maastricht.json')
const DEMO2050_PATH = path.join(__dirname, 'data', 'demo-maastricht-2050.json')
const PORT = 43124
const SAVE_DEMO_ALLOWED = process.env.RIGHT_PLANT_SAVE_DEMO === '1'
const TTL_MS = 5 * 60 * 1000

/** @type {Map<string, { expires: number, value: unknown }>} */
const memoryCache = new Map()

function cacheGet(key) {
  const row = memoryCache.get(key)
  if (!row) return null
  if (Date.now() > row.expires) {
    memoryCache.delete(key)
    return null
  }
  return row.value
}

function cacheSet(key, value, ttlMs = TTL_MS) {
  memoryCache.set(key, { expires: Date.now() + ttlMs, value })
}

function validateSiteProfile(siteProfile) {
  if (!siteProfile || typeof siteProfile !== 'object') return 'siteProfile required'
  const lat = Number(siteProfile.lat)
  const lon = Number(siteProfile.lon)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'lat must be a valid latitude'
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return 'lon must be a valid longitude'
  if (siteProfile.area_m2 != null) {
    const area = Number(siteProfile.area_m2)
    if (!Number.isFinite(area) || area <= 0 || area > 1_000_000) return 'area_m2 out of range'
  }
  return null
}

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

function sunClassFromHours(hours) {
  if (hours == null) return 'part shade'
  if (hours >= 6) return 'full sun'
  if (hours >= 3) return 'part shade'
  return 'shade'
}

async function buildRecommendations(siteProfile, prefs, lang) {
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
        gmin: s.gmin,
        gmax: s.gmax,
        topmn: s.topmn,
        topmx: s.topmx,
        lispy: s.lispy,
      },
    }
  })
  return { plants, shortlist, usedLlm, source }
}

app.post('/api/recommend', async (req, res) => {
  const { siteProfile, saveAsDemo, saveAsDemo2050, lang, prefs, zoneHours } = req.body ?? {}
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) {
    return res.status(400).json({ error: profileError })
  }

  try {
    const { plants, shortlist, usedLlm, source } = await buildRecommendations(
      siteProfile,
      prefs,
      lang ?? 'en',
    )
    let zonePlants = []
    if (zoneHours && typeof zoneHours === 'object') {
      const zones = ['full', 'part', 'shade']
      const jobs = zones
        .map((zone) => {
          const hours = zoneHours[zone]
          if (hours == null) return null
          const zProfile = {
            ...siteProfile,
            sun_hours_per_day: hours,
            sun_class: sunClassFromHours(hours),
          }
          return buildRecommendations(zProfile, prefs, lang ?? 'en').then((zRec) => ({
            zone,
            sun_hours: hours,
            plants: zRec.plants.slice(0, 4),
          }))
        })
        .filter(Boolean)
      zonePlants = await Promise.all(jobs)
    }
    const payload = {
      siteProfile,
      plants,
      zonePlants,
      shortlistCount: shortlist.length,
      rankingSource: source,
      usedLlm,
    }
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
  const profileError = validateSiteProfile(profile)
  if (profileError) {
    return res.status(400).json({ error: profileError })
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

app.get('/api/fungi', async (req, res) => {
  const scientificName = req.query.scientificName ?? req.query.name
  const urban = req.query.urban === '1' || req.query.urban === 'true'
  if (!scientificName) return res.status(400).json({ error: 'scientificName required' })
  const key = `gbif:${String(scientificName).toLowerCase()}:${urban ? '1' : '0'}`
  const hit = cacheGet(key)
  if (hit) return res.json(hit)
  const data = await fetchFungalTraits(String(scientificName), { urban })
  cacheSet(key, data)
  res.json(data)
})

app.get('/api/bag3d', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon required' })
  }
  const key = `bag3d:${lat.toFixed(4)}:${lon.toFixed(4)}`
  const hit = cacheGet(key)
  if (hit) return res.json(hit)
  const data = await fetchBuildings3dBag(lat, lon)
  cacheSet(key, data)
  res.json(data)
})

app.get('/api/open-meteo/archive', async (req, res) => {
  const lat = parseFloat(req.query.lat)
  const lon = parseFloat(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon required' })
  }
  const key = `meteo:archive:${lat.toFixed(3)}:${lon.toFixed(3)}`
  const hit = cacheGet(key)
  if (hit) return res.json(hit)
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=1991-01-01&end_date=2020-12-31` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,shortwave_radiation_sum` +
    `&timezone=auto`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const upstream = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `open_meteo_${upstream.status}`, source_url: url })
    }
    const json = await upstream.json()
    const payload = { ok: true, source_url: url, data: json }
    cacheSet(key, payload)
    res.json(payload)
  } catch (err) {
    clearTimeout(timer)
    res.status(502).json({ error: String(err.message || err), source_url: url })
  }
})

app.post('/api/why-near', async (req, res) => {
  const { siteProfile } = req.body ?? {}
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) return res.status(400).json({ error: profileError })
  const shortlist = filterEcoCrop(siteProfile, 200)
  const misses = nearMisses(shortlist, siteProfile, 5)
  res.json({ nearMisses: misses })
})

app.post('/api/why-plant', async (req, res) => {
  const { siteProfile, plantName } = req.body ?? {}
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) return res.status(400).json({ error: profileError })
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
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) return res.status(400).json({ error: profileError })
  let shortlist = filterEcoCrop(siteProfile, 50)
  if (prefs) shortlist = rankWithGoals(shortlist, siteProfile, prefs).slice(0, 30)
  res.json(suggestGuild(shortlist, prefs))
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[api] http://127.0.0.1:${PORT}`)
})
