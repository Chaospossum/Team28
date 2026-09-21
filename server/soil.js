import { cacheRead, cacheWrite } from './cacheStore.js'

const memoryCache = new Map()
const TIMEOUT_MS = 18_000

/** Offsets tried when centroid is null (urban grid gaps); fine steps first (~200 m–1 km). */
const NEARBY_OFFSETS = [
  [0.002, 0],
  [0, 0.002],
  [-0.002, 0.002],
  [0.002, -0.002],
  [0.005, 0],
  [0, 0.005],
  [0.01, 0.002],
  [-0.01, 0.01],
  [0.05, 0.01],
  [0.05, 0],
  [0, 0.05],
  [-0.05, 0.01],
]

function cacheKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`
}

function readDiskCache(key) {
  return cacheRead(`soil-${key.replace(',', '_')}`)
}

const SOILGRIDS_URL =
  'https://rest.isric.org/soilgrids/v2.0/properties/query'

function writeDiskCache(key, data) {
  const withMeta = {
    ...data,
    _cache: {
      origin_url: SOILGRIDS_URL,
      fetched_at: new Date().toISOString().slice(0, 10),
      query_key: key,
    },
  }
  cacheWrite(`soil-${key.replace(',', '_')}`, withMeta)
}

function scaleProperty(layer) {
  const mean = layer?.depths?.[0]?.values?.mean
  if (mean == null) return null
  const d = layer.unit_measure?.d_factor ?? layer.d_factor ?? 10
  return mean / d
}

function hasUsableSoil(result) {
  return result.soil_ph != null || result.clay_pct != null || result.sand_pct != null
}

function parseSoilJson(json) {
  const layers = json.properties?.layers ?? []
  const byName = {}
  for (const layer of layers) {
    byName[layer.name] = layer
  }
  const soil_ph = scaleProperty(byName.phh2o)
  const clay_pct = scaleProperty(byName.clay)
  const sand_pct = scaleProperty(byName.sand)
  const socRaw = byName.soc?.depths?.[0]?.values?.mean
  const socFactor = byName.soc?.unit_measure?.d_factor ?? byName.soc?.d_factor ?? 10
  const soc = socRaw != null ? socRaw / socFactor : null
  return { soil_ph, clay_pct, sand_pct, soc }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchSoilGridsOnce(lat, lon) {
  const url =
    `https://rest.isric.org/soilgrids/v2.0/properties/query?` +
    `lon=${lon}&lat=${lat}` +
    `&property=phh2o&property=clay&property=sand&property=soc` +
    `&depth=0-5cm&value=mean`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (res.status === 429) {
      return { ok: false, error: 'rate_limited', ...emptySoil() }
    }
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}`, ...emptySoil() }
    }
    const json = await res.json()
    const parsed = parseSoilJson(json)
    return { ok: true, ...parsed, query_lat: lat, query_lon: lon }
  } catch (err) {
    clearTimeout(timer)
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'timeout' : String(err.message || err),
      ...emptySoil(),
    }
  }
}

function emptySoil() {
  return { soil_ph: null, clay_pct: null, sand_pct: null, soc: null }
}

function packageResult(result, nearby, offset) {
  const distKm = nearby ? Math.round(Math.hypot(offset[0], offset[1]) * 111) : 0
  const packaged = {
    ok: hasUsableSoil(result),
    soil_ph: clamp(result.soil_ph, 3, 9),
    clay_pct: clamp(result.clay_pct, 0, 100),
    sand_pct: clamp(result.sand_pct, 0, 100),
    soc: result.soc,
    error: hasUsableSoil(result) ? undefined : result.error ?? 'null_values',
    nearby_fallback: nearby,
    soil_distance_km: nearby ? distKm : 0,
    soil_resolution_note: nearby
      ? `SoilGrids 250 m, nearest valid cell ~${distKm} km from plot centroid (measured from ISRIC API)`
      : 'SoilGrids 250 m at plot centroid (measured)',
    source: nearby
      ? `SoilGrids v2.0 (0-5cm, ~${distKm} km offset)`
      : 'SoilGrids v2.0 (0-5cm mean)',
    data_kind: 'measured',
  }
  return packaged
}

export async function fetchSoilGrids(lat, lon) {
  const key = cacheKey(lat, lon)
  if (memoryCache.has(key)) return memoryCache.get(key)
  const disk = readDiskCache(key)
  if (disk) {
    memoryCache.set(key, disk)
    return disk
  }

  let result = await fetchSoilGridsOnce(lat, lon)
  if (!hasUsableSoil(result) && result.error === 'rate_limited') {
    await sleep(2500)
    result = await fetchSoilGridsOnce(lat, lon)
  }

  let offset = [0, 0]
  if (!hasUsableSoil(result)) {
    for (const [dLat, dLon] of NEARBY_OFFSETS) {
      const nLat = lat + dLat
      const nLon = lon + dLon
      const nKey = cacheKey(nLat, nLon)
      const cached = memoryCache.get(nKey) ?? readDiskCache(nKey)
      const nearbyResult = cached ?? await fetchSoilGridsOnce(nLat, nLon)
      if (hasUsableSoil(nearbyResult)) {
        result = nearbyResult
        offset = [dLat, dLon]
        break
      }
    }
  }

  const packaged = packageResult(result, offset[0] !== 0 || offset[1] !== 0, offset)
  if (packaged.ok) {
    memoryCache.set(key, packaged)
    writeDiskCache(key, packaged)
  }
  return packaged
}

function clamp(v, min, max) {
  if (v == null) return null
  return Math.min(max, Math.max(min, v))
}

export function textureClass(sand_pct, clay_pct) {
  if (sand_pct == null && clay_pct == null) return 'unknown'
  const sand = sand_pct ?? 0
  const clay = clay_pct ?? 0
  if (sand >= 50 && clay < 20) return 'sandy'
  if (clay >= 35) return 'clay'
  return 'loamy'
}
