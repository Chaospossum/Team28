const WMS = 'https://service.pdok.nl/tno/bro-bodemkaart/wms/v1_0'

/**
 * Query PDOK BRO bodemkaart for grondsoort at a point. Fails silently.
 */
export async function fetchPdokSoilType(lat, lon) {
  const delta = 0.02
  // WMS 1.3.0 + EPSG:4326 → BBOX is minLat,minLon,maxLat,maxLon
  const bbox = `${lat - delta},${lon - delta},${lat + delta},${lon + delta}`
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'soilarea',
    QUERY_LAYERS: 'soilarea',
    CRS: 'EPSG:4326',
    BBOX: bbox,
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    INFO_FORMAT: 'application/json',
    FEATURE_COUNT: '1',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`${WMS}?${params}`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const json = await res.json()
    const feature = json.features?.[0]
    const props = feature?.properties ?? {}
    const raw =
      props.grondsoort ??
      props.GRONDSOORT ??
      props.soil_type ??
      props.label ??
      null
    if (!raw || typeof raw !== 'string') return null
    const normalized = raw.toLowerCase()
    const types = ['zand', 'klei', 'veen', 'löss', 'loess', 'zavel']
    for (const t of types) {
      if (normalized.includes(t.replace('ö', 'o'))) {
        return t === 'loess' ? 'löss' : t
      }
    }
    return raw
  } catch {
    clearTimeout(timer)
    return null
  }
}
