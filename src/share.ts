export function buildShareUrl(lat: number, lon: number, demo = false): string {
  const u = new URL(window.location.href)
  u.searchParams.set('lat', lat.toFixed(4))
  u.searchParams.set('lon', lon.toFixed(4))
  if (demo) u.searchParams.set('demo', '1')
  return u.toString()
}

export function readShareParams(): { lat: number; lon: number; demo: boolean } | null {
  const u = new URL(window.location.href)
  const lat = parseFloat(u.searchParams.get('lat') ?? '')
  const lon = parseFloat(u.searchParams.get('lon') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon, demo: u.searchParams.get('demo') === '1' }
}
