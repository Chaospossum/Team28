import {
  decodeSharePayload,
  encodeSharePayload,
  type SharePayload,
  type UserPrefs,
} from './shareState'

export type { SharePayload, UserPrefs }

export function buildShareUrl(payload: SharePayload): string {
  const u = new URL(window.location.href)
  u.searchParams.delete('lat')
  u.searchParams.delete('lon')
  u.searchParams.delete('demo')
  const state = encodeSharePayload(payload)
  u.searchParams.set('s', state)
  if (payload.lat != null) u.searchParams.set('lat', payload.lat.toFixed(4))
  if (payload.lon != null) u.searchParams.set('lon', payload.lon.toFixed(4))
  if (payload.demo) u.searchParams.set('demo', '1')
  return u.toString()
}

export function readShareFromUrl(): SharePayload | null {
  const u = new URL(window.location.href)
  const encoded = u.searchParams.get('s')
  if (encoded) return decodeSharePayload(encoded)
  const lat = parseFloat(u.searchParams.get('lat') ?? '')
  const lon = parseFloat(u.searchParams.get('lon') ?? '')
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon, demo: u.searchParams.get('demo') === '1' }
}
