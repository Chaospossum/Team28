import type { SiteProfile } from './types'
import { moistureClass, sunClass, sunHoursFromRadiation } from './climate'

const URL =
  'https://climate-api.open-meteo.com/v1/climate?latitude={lat}&longitude={lon}' +
  '&start_date=2045-01-01&end_date=2050-12-31&models=EC_Earth3P_HR' +
  '&daily=temperature_2m_mean,precipitation_sum'

export async function fetchClimate2050Profile(
  base: SiteProfile,
): Promise<{ profile: SiteProfile; deltaNote: string }> {
  const url = URL.replace('{lat}', String(base.lat)).replace('{lon}', String(base.lon))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  const res = await fetch(url, { signal: controller.signal })
  clearTimeout(timer)
  if (!res.ok) throw new Error(`climate_2050_${res.status}`)
  const data = await res.json()
  const times: string[] = data.daily?.time ?? []
  const temps: number[] = data.daily?.temperature_2m_mean ?? []
  const precip: number[] = data.daily?.precipitation_sum ?? []

  const byYear: Record<string, number> = {}
  const growing: number[] = []
  for (let i = 0; i < times.length; i++) {
    const y = times[i].slice(0, 4)
    byYear[y] = (byYear[y] ?? 0) + (precip[i] ?? 0)
    const m = parseInt(times[i].slice(5, 7), 10)
    if (m >= 4 && m <= 9 && temps[i] != null) growing.push(temps[i])
  }
  const rains = Object.values(byYear).sort((a, b) => a - b)
  const rain_mm_year = rains[Math.floor(rains.length / 2)] ?? base.rain_mm_year
  const temp_growing_season =
    growing.length > 0 ? growing.reduce((a, b) => a + b, 0) / growing.length : base.temp_growing_season
  const radiation_mj = base.radiation_mj ?? null
  const sun_hours_per_day = sunHoursFromRadiation(radiation_mj)

  const profile: SiteProfile = {
    ...base,
    rain_mm_year,
    temp_growing_season,
    radiation_mj,
    sun_hours_per_day,
    sun_class: sunClass(sun_hours_per_day),
    moisture_class: moistureClass(rain_mm_year),
    climate_period: '2045–2050 (EC_Earth3P_HR, estimate)',
    sources: [...(base.sources ?? []), 'Open-Meteo Climate API 2050 scenario'],
  }
  const deltaNote = `~${(temp_growing_season! - (base.temp_growing_season ?? 0)).toFixed(1)}°C warmer growing season; rain ~${Math.round(rain_mm_year!)} mm/yr (estimate).`
  return { profile, deltaNote }
}
