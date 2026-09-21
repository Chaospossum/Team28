import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WMS = 'https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0'
const CACHE_DIR = path.join(__dirname, 'cache', 'pdok-wms')

/** Rough Netherlands bounds (WGS84) for low-zoom tile warm-up */
const NL_BOUNDS = { west: 3.2, east: 7.35, south: 50.72, north: 53.58 }
const WARM_ZOOMS = [8, 9, 10]
const TILE_SIZE = 256

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function cachePathForQuery(queryString) {
  const hash = crypto.createHash('sha256').update(queryString).digest('hex')
  return path.join(CACHE_DIR, `${hash}.png`)
}

function expressQueryToParams(query) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) continue
    const v = Array.isArray(value) ? value[0] : value
    if (typeof v === 'object') continue
    params.append(key, String(v))
  }
  return params
}

function normalizeWmsQuery(raw) {
  const params = expressQueryToParams(raw)
  const pick = (...keys) => {
    for (const k of keys) {
      const v = params.get(k)
      if (v != null && v !== '') return v
    }
    return null
  }

  const out = new URLSearchParams()
  out.set('SERVICE', 'WMS')
  out.set('VERSION', pick('version', 'VERSION') ?? '1.3.0')
  out.set('REQUEST', pick('request', 'REQUEST') ?? 'GetMap')
  out.set('LAYERS', pick('layers', 'LAYERS') ?? 'soilarea')
  out.set('STYLES', pick('styles', 'STYLES') ?? '')
  out.set('CRS', pick('crs', 'CRS', 'srs', 'SRS') ?? 'EPSG:3857')
  out.set('FORMAT', pick('format', 'FORMAT') ?? 'image/png')
  const transparent = pick('transparent', 'TRANSPARENT')
  if (transparent != null) out.set('TRANSPARENT', transparent)
  out.set('WIDTH', pick('width', 'WIDTH') ?? '256')
  out.set('HEIGHT', pick('height', 'HEIGHT') ?? '256')
  const bbox = pick('bbox', 'BBOX')
  if (bbox) out.set('BBOX', bbox)
  return out
}

export async function fetchPdokWmsMap(query) {
  const params = normalizeWmsQuery(query)
  if (!params.get('BBOX')) return { ok: false, status: 400 }

  const queryString = params.toString()
  ensureCacheDir()
  const file = cachePathForQuery(queryString)
  if (fs.existsSync(file)) {
    return { ok: true, body: fs.readFileSync(file), fromCache: true }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    const res = await fetch(`${WMS}?${queryString}`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, status: res.status }
    const buf = Buffer.from(await res.arrayBuffer())
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('image') && buf.length < 64) {
      return { ok: false, status: 502 }
    }
    fs.writeFileSync(file, buf)
    return { ok: true, body: buf, fromCache: false }
  } catch {
    clearTimeout(timer)
    return { ok: false, status: 504 }
  }
}

function lonToTileX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  )
}

function tileBounds3857(x, y, z) {
  const n = 2 ** z
  const lonMin = (x / n) * 360 - 180
  const lonMax = ((x + 1) / n) * 360 - 180
  const latNorth = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  const latSouth = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI
  const toX = (lon) => (lon * 20037508.34) / 180
  const toY = (lat) =>
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180)
  return [toX(lonMin), toY(latSouth), toX(lonMax), toY(latNorth)]
}

function wmsQueryForTile(x, y, z) {
  const [minx, miny, maxx, maxy] = tileBounds3857(x, y, z)
  return {
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: 'soilarea',
    STYLES: '',
    CRS: 'EPSG:3857',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    WIDTH: String(TILE_SIZE),
    HEIGHT: String(TILE_SIZE),
    BBOX: `${minx},${miny},${maxx},${maxy}`,
  }
}

async function mapWithConcurrency(items, limit, fn) {
  let i = 0
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
}

/**
 * Pre-fetch PDOK WMS tiles covering the Netherlands at z8–10 into disk cache.
 */
export async function warmPdokWmsCache() {
  if (process.env.PDOK_WARM === '0') return

  const jobs = []
  for (const z of WARM_ZOOMS) {
    const xMin = lonToTileX(NL_BOUNDS.west, z)
    const xMax = lonToTileX(NL_BOUNDS.east, z)
    const yMin = latToTileY(NL_BOUNDS.north, z)
    const yMax = latToTileY(NL_BOUNDS.south, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        jobs.push(wmsQueryForTile(x, y, z))
      }
    }
  }

  let fetched = 0
  let cached = 0
  await mapWithConcurrency(jobs, 4, async (query) => {
    const result = await fetchPdokWmsMap(query)
    if (result.ok) {
      if (result.fromCache) cached++
      else fetched++
    }
  })

  console.log(
    `[pdok-wms] warm-up done: ${jobs.length} tiles (${fetched} fetched, ${cached} already cached)`,
  )
}
