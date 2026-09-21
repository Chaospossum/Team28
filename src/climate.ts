import type { SiteProfile } from './types'

const ARCHIVE_URL =
  'https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date=2023-01-01&end_date=2023-12-31&daily=shortwave_radiation_sum,sunshine_duration,precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=auto'

export function sunClass(hours: number | null): SiteProfile['sun_class'] {
  if (hours == null) return 'part shade'
  if (hours >= 6) return 'full sun'
  if (hours >= 3) return 'part shade'
  return 'shade'
}

export function moistureClass(rain: number | null): string {
  if (rain == null) return 'unknown'
  if (rain < 500) return 'dry'
  if (rain <= 900) return 'moderate'
  return 'wet'
}

export async function fetchClimateProfile(
  lat: number,
  lon: number,
  area_m2: number,
): Promise<{ profile: SiteProfile; raw: unknown }> {
  const url = ARCHIVE_URL.replace('{lat}', String(lat)).replace('{lon}', String(lon))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  const res = await fetch(url, { signal: controller.signal })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`open_meteo_${res.status}`)
  const data = await res.json()

  const daily = data.daily
  const precip: number[] = daily.precipitation_sum ?? []
  const sunshine: number[] = daily.sunshine_duration ?? []
  const radiation: number[] = daily.shortwave_radiation_sum ?? []
  const tmax: number[] = daily.temperature_2m_max ?? []
  const tmin: number[] = daily.temperature_2m_min ?? []

  const rain_mm_year = precip.reduce((a, b) => a + (b ?? 0), 0)

  const sunshineDays = sunshine.filter((v) => v != null)
  const sun_hours_per_day =
    sunshineDays.length > 0
      ? sunshineDays.reduce((a, b) => a + b / 3600, 0) / sunshineDays.length
      : null

  const radDays = radiation.filter((v) => v != null)
  const radiation_mj =
    radDays.length > 0 ? radDays.reduce((a, b) => a + b, 0) / radDays.length : null

  // Apr–Sep: indices 90–273 approx (0-based from Jan 1)
  const growingTemps: number[] = []
  for (let i = 0; i < tmax.length; i++) {
    const d = daily.time?.[i]
    if (!d) continue
    const month = parseInt(d.slice(5, 7), 10)
    if (month >= 4 && month <= 9) {
      const hi = tmax[i]
      const lo = tmin[i]
      if (hi != null && lo != null) growingTemps.push((hi + lo) / 2)
    }
  }
  const temp_growing_season =
    growingTemps.length > 0
      ? growingTemps.reduce((a, b) => a + b, 0) / growingTemps.length
      : null

  const profile: SiteProfile = {
    lat,
    lon,
    area_m2,
    sun_hours_per_day,
    radiation_mj,
    rain_mm_year,
    temp_growing_season,
    soil_ph: null,
    clay_pct: null,
    sand_pct: null,
    soc: null,
    soil_type_nl: null,
    sun_class: sunClass(sun_hours_per_day),
    texture_class: 'unknown',
    moisture_class: moistureClass(rain_mm_year),
    sources: ['Open-Meteo Archive 2023'],
    data_resolution_note:
      'Soil data ≈250 m resolution, climate ≈km scale. Neighbourhood estimate, not a soil test.',
  }

  return { profile, raw: data }
}
