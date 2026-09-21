import type { SiteProfile } from './types'

const CLIMATE_START = '2019-01-01'
const CLIMATE_END = '2023-12-31'
const CLIMATE_LABEL = '2019–2023'

const ARCHIVE_URL =
  `https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}` +
  `&start_date=${CLIMATE_START}&end_date=${CLIMATE_END}` +
  `&daily=shortwave_radiation_sum,sunshine_duration,precipitation_sum,temperature_2m_max,temperature_2m_min` +
  `&timezone=Europe%2FAmsterdam`

/** Radiation → hours (calibrated for NL: ~11.5 MJ/d ≈ 4.3 h at Maastricht). */
export function sunHoursFromRadiation(mjPerDay: number | null): number | null {
  if (mjPerDay == null) return null
  return mjPerDay / 2.68
}

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

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export async function fetchClimateProfile(
  lat: number,
  lon: number,
  area_m2: number,
): Promise<{ profile: SiteProfile; raw: unknown }> {
  const url = ARCHIVE_URL.replace('{lat}', String(lat)).replace('{lon}', String(lon))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  const res = await fetch(url, { signal: controller.signal })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`open_meteo_${res.status}`)
  const data = await res.json()

  const daily = data.daily
  const times: string[] = daily.time ?? []
  const precip: number[] = daily.precipitation_sum ?? []
  const sunshine: number[] = daily.sunshine_duration ?? []
  const radiation: number[] = daily.shortwave_radiation_sum ?? []
  const tmax: number[] = daily.temperature_2m_max ?? []
  const tmin: number[] = daily.temperature_2m_min ?? []

  const rainByYear: Record<string, number> = {}
  const growingTemps: number[] = []
  let radSum = 0
  let radCount = 0
  let rawSunSum = 0
  let rawSunCount = 0

  for (let i = 0; i < times.length; i++) {
    const y = times[i].slice(0, 4)
    rainByYear[y] = (rainByYear[y] ?? 0) + (precip[i] ?? 0)
    if (radiation[i] != null) {
      radSum += radiation[i]
      radCount++
    }
    if (sunshine[i] != null) {
      rawSunSum += sunshine[i] / 3600
      rawSunCount++
    }
    const month = parseInt(times[i].slice(5, 7), 10)
    if (month >= 4 && month <= 9) {
      const hi = tmax[i]
      const lo = tmin[i]
      if (hi != null && lo != null) growingTemps.push((hi + lo) / 2)
    }
  }

  const annualRains = Object.values(rainByYear)
  const rain_mm_year = median(annualRains) ?? null
  const radiation_mj = radCount > 0 ? radSum / radCount : null
  const sun_hours_archive =
    rawSunCount > 0 ? rawSunSum / rawSunCount : null
  const sun_hours_per_day = sunHoursFromRadiation(radiation_mj)
  const temp_growing_season =
    growingTemps.length > 0
      ? growingTemps.reduce((a, b) => a + b, 0) / growingTemps.length
      : null

  const profile: SiteProfile = {
    lat,
    lon,
    area_m2,
    sun_hours_per_day,
    sun_hours_archive,
    radiation_mj,
    rain_mm_year,
    temp_growing_season,
    climate_period: CLIMATE_LABEL,
    sun_class_source: 'radiation-based estimate (archive sunshine often inflated)',
    soil_ph: null,
    clay_pct: null,
    sand_pct: null,
    soc: null,
    soil_type_nl: null,
    sun_class: sunClass(sun_hours_per_day),
    texture_class: 'unknown',
    moisture_class: moistureClass(rain_mm_year),
    sources: [`Open-Meteo Archive ${CLIMATE_LABEL}`],
    data_resolution_note:
      'Soil data ≈250 m resolution, climate ≈km scale. Neighbourhood estimate, not a soil test.',
  }

  return { profile, raw: data }
}

export { CLIMATE_LABEL }
