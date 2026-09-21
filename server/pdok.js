import proj4 from 'proj4'

const WMS = 'https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0'

proj4.defs(
  'EPSG:28992',
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs',
)

const GRONDSOORT_TYPES = ['zand', 'klei', 'veen', 'löss', 'zavel']

function mapGrondsoortFromName(name) {
  if (!name) return null
  const n = name.toLowerCase()
  if (n.includes('veen')) return 'veen'
  if (n.includes('klei')) return 'klei'
  if (n.includes('zand')) return 'zand'
  if (n.includes('loess') || n.includes('löss')) return 'löss'
  if (n.includes('leem') || n.includes('zavel') || n.includes('silt')) return 'zavel'
  return null
}

function parseFeatureInfoHtml(html) {
  const headers = [...html.matchAll(/<th>([^<]+)<\/th>/gi)].map((m) => m[1].trim())
  const cells = [...html.matchAll(/<td>([^<]*)<\/td>/gi)].map((m) => m[1].trim())
  if (!headers.length || !cells.length) return null
  const row = {}
  headers.forEach((h, i) => {
    row[h] = cells[i] ?? ''
  })
  const soilName =
    row.first_soilname || row.normal_soilprofile_name || row.soilname || ''
  const grondsoort = mapGrondsoortFromName(soilName)
  return { soilName, grondsoort, raw: row }
}

/**
 * Query PDOK BRO bodemkaart (EPSG:28992). Returns grondsoort or null.
 */
export async function fetchPdokSoilType(lat, lon) {
  const [x, y] = proj4('EPSG:4326', 'EPSG:28992', [lon, lat])
  const delta = 400
  const bbox = `${x - delta},${y - delta},${x + delta},${y + delta}`
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetFeatureInfo',
    LAYERS: 'soilarea',
    QUERY_LAYERS: 'soilarea',
    CRS: 'EPSG:28992',
    BBOX: bbox,
    WIDTH: '101',
    HEIGHT: '101',
    I: '50',
    J: '50',
    INFO_FORMAT: 'text/html',
    FEATURE_COUNT: '3',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`${WMS}?${params}`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = await res.text()
    const parsed = parseFeatureInfoHtml(html)
    if (!parsed) return null
    return parsed.grondsoort ?? (parsed.soilName ? parsed.soilName.slice(0, 40) : null)
  } catch {
    clearTimeout(timer)
    return null
  }
}

export { GRONDSOORT_TYPES, mapGrondsoortFromName }
