import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, 'cache')

const memoryCache = new Map()

function cacheKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`
}

function readDiskCache(key) {
  const file = path.join(CACHE_DIR, `soil-${key.replace(',', '_')}.json`)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeDiskCache(key, data) {
  const file = path.join(CACHE_DIR, `soil-${key.replace(',', '_')}.json`)
  fs.writeFileSync(file, JSON.stringify(data))
}

function scaleProperty(layer) {
  const mean = layer?.depths?.[0]?.values?.mean
  if (mean == null) return null
  const d = layer.d_factor ?? 1
  return mean / d
}

export async function fetchSoilGrids(lat, lon) {
  const key = cacheKey(lat, lon)
  if (memoryCache.has(key)) return memoryCache.get(key)
  const disk = readDiskCache(key)
  if (disk) {
    memoryCache.set(key, disk)
    return disk
  }

  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query?` +
    `lon=${lon}&lat=${lat}` +
    `&property=phh2o&property=clay&property=sand&property=soc` +
    `&depth=0-5cm&value=mean`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (res.status === 429) {
      return { ok: false, error: 'rate_limited', soil_ph: null, clay_pct: null, sand_pct: null, soc: null }
    }
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}`, soil_ph: null, clay_pct: null, sand_pct: null, soc: null }
    }
    const json = await res.json()
    const layers = json.properties?.layers ?? []
    const byName = {}
    for (const layer of layers) {
      byName[layer.name] = layer
    }

    const soil_ph = scaleProperty(byName.phh2o)
    const clay_pct = scaleProperty(byName.clay)
    const sand_pct = scaleProperty(byName.sand)
    const socRaw = byName.soc?.depths?.[0]?.values?.mean
    const socFactor = byName.soc?.d_factor ?? 10
    const soc = socRaw != null ? socRaw / socFactor : null

    const result = {
      ok: true,
      soil_ph,
      clay_pct,
      sand_pct,
      soc,
      source: 'SoilGrids v2.0 (0-5cm mean)',
    }
    memoryCache.set(key, result)
    writeDiskCache(key, result)
    return result
  } catch (err) {
    clearTimeout(timer)
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'timeout' : String(err.message || err),
      soil_ph: null,
      clay_pct: null,
      sand_pct: null,
      soc: null,
    }
  }
}

export function textureClass(sand_pct, clay_pct) {
  if (sand_pct == null && clay_pct == null) return 'unknown'
  const sand = sand_pct ?? 0
  const clay = clay_pct ?? 0
  if (sand >= 50 && clay < 20) return 'sandy'
  if (clay >= 35) return 'clay'
  return 'loamy'
}
