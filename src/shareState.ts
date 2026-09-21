import LZString from 'lz-string'

export interface UserPrefs {
  pollinators: number
  ornamental: number
  food: number
  effort: 'minimal' | 'moderate' | 'hobby'
}

export interface SharePayload {
  lat?: number
  lon?: number
  demo?: boolean
  polygon?: number[][] // [lon, lat] ring
  prefs?: UserPrefs
  buildings?: Array<{ id: string; ring: number[][]; height_m: number }>
}

const DEFAULT_PREFS: UserPrefs = {
  pollinators: 33,
  ornamental: 33,
  food: 34,
  effort: 'moderate',
}

export function encodeSharePayload(payload: SharePayload): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(payload))
}

export function decodeSharePayload(encoded: string | null): SharePayload | null {
  if (!encoded) return null
  try {
    const raw = LZString.decompressFromEncodedURIComponent(encoded)
    if (!raw) return null
    return JSON.parse(raw) as SharePayload
  } catch {
    return null
  }
}

export function defaultPrefs(): UserPrefs {
  return { ...DEFAULT_PREFS }
}
