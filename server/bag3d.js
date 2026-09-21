import proj4 from 'proj4'

proj4.defs(
  'EPSG:28992',
  '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.417,50.3319,465.552,-0.398957,0.343988,-1.8774,4.0725 +units=m +no_defs',
)

const API = 'https://api.3dbag.nl/collections/pand/items'

/** Live-check: 3DBAG uses RD bbox (EPSG:28992), not WGS84. */
export async function fetchBuildings3dBag(lat, lon, bufferM = 100) {
  const [x, y] = proj4('EPSG:4326', 'EPSG:28992', [lon, lat])
  const bbox = `${x - bufferM},${y - bufferM},${x + bufferM},${y + bufferM}`
  const url = `${API}?limit=50&bbox=${bbox}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return { ok: false, buildings: [], source: url, error: `http_${res.status}` }
    const json = await res.json()
    const buildings = []
    for (const f of json.features ?? []) {
      const id = Object.keys(f.CityObjects ?? {})[0]
      const attrs = f.CityObjects?.[id]?.attributes ?? {}
      const h = attrs.b3_h_maaiveld != null && attrs.b3_h_nok != null
        ? attrs.b3_h_nok - attrs.b3_h_maaiveld
        : attrs.b3_h_dak_max && attrs.b3_h_maaiveld
          ? attrs.b3_h_dak_max - attrs.b3_h_maaiveld
          : null
      buildings.push({
        id,
        height_m: h,
        source: '3DBAG pand (EPSG:28992 bbox)',
        data_kind: 'measured',
      })
    }
    return {
      ok: buildings.length > 0,
      buildings,
      source: url,
      resolution: 'LoD1.2 footprints, ~100 m buffer',
      fetched_at: new Date().toISOString().slice(0, 10),
    }
  } catch (e) {
    clearTimeout(timer)
    return { ok: false, buildings: [], source: url, error: String(e.message || e) }
  }
}
