import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(__dirname, 'cache')
const GBIF_DATASET = '744edc21-8dd2-474e-8a0b-b8c3d56a3c2d'
const GBIF_URL = `https://api.gbif.org/v1/occurrence/search?datasetKey=${GBIF_DATASET}&limit=5`

function cachePath(scientific) {
  const safe = scientific.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 80)
  return path.join(CACHE_DIR, `fungi-${safe}.json`)
}

function readCache(file) {
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeCache(file, payload) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        ...payload,
        _cache: {
          origin_url: payload.source_url,
          fetched_at: new Date().toISOString().slice(0, 10),
        },
      },
      null,
      2,
    ),
  )
}

function parseMycorrhizaType(occurrence) {
  const ext = occurrence.extensions?.['http://rs.tdwg.org/dwc/terms/MeasurementOrFact'] ?? []
  for (const row of ext) {
    if (row['http://rs.tdwg.org/dwc/terms/measurementType'] === 'Mycorrhiza type') {
      return row['http://rs.tdwg.org/dwc/terms/measurementValue']
    }
  }
  return null
}

/** Live-check: GBIF FungalRoot dataset (Soudzilovskaia et al., ~1 km reports). SPUN has no public API. */
export async function fetchFungalTraits(scientificName, opts = {}) {
  const urban = opts.urban === true
  if (!scientificName?.trim()) {
    return { ok: false, error: 'name_required', panel: 'no data here' }
  }
  const file = cachePath(scientificName)
  const cached = readCache(file)
  if (cached && !opts.refresh) return cached

  const url = `${GBIF_URL}&scientificName=${encodeURIComponent(scientificName)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) {
      return { ok: false, error: `gbif_${res.status}`, panel: 'no data here', source_url: url }
    }
    const json = await res.json()
    const types = new Set()
    for (const row of json.results ?? []) {
      const t = parseMycorrhizaType(row)
      if (t) types.add(t)
    }
    const payload = {
      ok: types.size > 0,
      scientificName,
      mycorrhiza_types: [...types],
      richness_note: types.size ? `${types.size} reported type(s) in FungalRoot` : null,
      resolution: '~1 km site reports (GBIF FungalRoot, modeled association)',
      license: 'GBIF / FungalRoot dataset CC BY 4.0',
      source_url: url,
      data_kind: 'modeled',
      confidence: urban ? 'low in urban/sealed soils' : 'moderate (literature synthesis)',
      panel: types.size ? types.join(', ') : 'no data here',
    }
    writeCache(file, payload)
    return payload
  } catch (e) {
    clearTimeout(timer)
    return { ok: false, error: String(e.message || e), panel: 'no data here', source_url: url }
  }
}
