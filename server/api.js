/**
 * API route logic shared by the Express server (server/index.js) and the static
 * GitHub Pages build (src/browserApi.ts). No Node-only imports allowed here.
 * Each handler returns { status, body }.
 */
import { fetchBuildings3dBag } from './bag3d.js'
import { filterEcoCrop } from './ecocrop.js'
import { rankWithGoals } from './goals.js'
import { rankPlants } from './llm.js'
import { fetchPdokSoilType } from './pdok.js'
import { fetchSoilGrids, textureClass } from './soil.js'
import { suggestGuild } from './guild.js'
import { classifySiteContext } from './urban.js'
import { fetchFungalTraits } from './fungi.js'
import { buildStructuredWhy, nearMisses } from './why.js'

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

const ok = (body) => ({ status: 200, body })
const bad = (error) => ({ status: 400, body: { error } })

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

function latLon(query) {
  const lat = parseFloat(query.lat)
  const lon = parseFloat(query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

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

export async function soil(query) {
  const p = latLon(query)
  if (!p) return bad('lat and lon required')
  return ok(await fetchSoilGrids(p.lat, p.lon))
}

export async function pdok(query) {
  const p = latLon(query)
  if (!p) return bad('lat and lon required')
  return ok({ soil_type_nl: await fetchPdokSoilType(p.lat, p.lon) })
}

/** Throws on ranking failure so callers can fall back to the cached demo. */
export async function recommend(body) {
  const { siteProfile, lang, prefs, zoneHours } = body ?? {}
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) return bad(profileError)

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
  if (lang) payload.lang = lang
  return ok(payload)
}

export async function enrich(body) {
  const profile = body?.siteProfile
  const profileError = validateSiteProfile(profile)
  if (profileError) return bad(profileError)
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

  return ok({ siteProfile: enriched, soilOk: soil.ok, pdokOk: !!pdok })
}

export async function fungi(query) {
  const scientificName = query.scientificName ?? query.name
  const urban = query.urban === '1' || query.urban === 'true'
  if (!scientificName) return bad('scientificName required')
  const key = `gbif:${String(scientificName).toLowerCase()}:${urban ? '1' : '0'}`
  const hit = cacheGet(key)
  if (hit) return ok(hit)
  const data = await fetchFungalTraits(String(scientificName), { urban })
  cacheSet(key, data)
  return ok(data)
}

export async function bag3d(query) {
  const p = latLon(query)
  if (!p) return bad('lat and lon required')
  const key = `bag3d:${p.lat.toFixed(4)}:${p.lon.toFixed(4)}`
  const hit = cacheGet(key)
  if (hit) return ok(hit)
  const data = await fetchBuildings3dBag(p.lat, p.lon)
  cacheSet(key, data)
  return ok(data)
}

export async function openMeteoArchive(query) {
  const p = latLon(query)
  if (!p) return bad('lat and lon required')
  const { lat, lon } = p
  const key = `meteo:archive:${lat.toFixed(3)}:${lon.toFixed(3)}`
  const hit = cacheGet(key)
  if (hit) return ok(hit)
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
      return {
        status: upstream.status,
        body: { error: `open_meteo_${upstream.status}`, source_url: url },
      }
    }
    const json = await upstream.json()
    const payload = { ok: true, source_url: url, data: json }
    cacheSet(key, payload)
    return ok(payload)
  } catch (err) {
    clearTimeout(timer)
    return { status: 502, body: { error: String(err.message || err), source_url: url } }
  }
}

export async function whyNear(body) {
  const { siteProfile } = body ?? {}
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) return bad(profileError)
  const shortlist = filterEcoCrop(siteProfile, 200)
  return ok({ nearMisses: nearMisses(shortlist, siteProfile, 5) })
}

export async function whyPlant(body) {
  const { siteProfile, plantName } = body ?? {}
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) return bad(profileError)
  const shortlist = filterEcoCrop(siteProfile, 500)
  const plant = shortlist.find((p) => p.name.toLowerCase() === String(plantName ?? '').toLowerCase())
  if (!plant) {
    return ok({ found: false, nearMisses: nearMisses(shortlist, siteProfile, 5) })
  }
  return ok({
    found: true,
    name: plant.name,
    why_structured: buildStructuredWhy(plant, siteProfile),
  })
}

export async function guild(body) {
  const { siteProfile, prefs } = body ?? {}
  const profileError = validateSiteProfile(siteProfile)
  if (profileError) return bad(profileError)
  let shortlist = filterEcoCrop(siteProfile, 50)
  if (prefs) shortlist = rankWithGoals(shortlist, siteProfile, prefs).slice(0, 30)
  return ok(suggestGuild(shortlist, prefs))
}

/** Route table: "METHOD /path" → handler(query, body). */
export const routes = {
  'GET /api/health': async () => ok({ ok: true }),
  'GET /api/soil': (q) => soil(q),
  'GET /api/pdok': (q) => pdok(q),
  'POST /api/enrich': (_q, b) => enrich(b),
  'POST /api/recommend': (_q, b) => recommend(b),
  'GET /api/fungi': (q) => fungi(q),
  'GET /api/bag3d': (q) => bag3d(q),
  'GET /api/open-meteo/archive': (q) => openMeteoArchive(q),
  'POST /api/why-near': (_q, b) => whyNear(b),
  'POST /api/why-plant': (_q, b) => whyPlant(b),
  'POST /api/guild': (_q, b) => guild(b),
}
