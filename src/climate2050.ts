import type { Climate2050Delta, SiteProfile } from './types'
import { moistureClass, sunClass, sunHoursFromRadiation } from './climate'

const MODEL = 'EC_Earth3P_HR'
const BASELINE = { start: '1991-01-01', end: '2020-12-31', label: '1991–2020' }
const FUTURE = { start: '2045-01-01', end: '2050-12-31', label: '2045–2050' }

function climateUrl(lat: number, lon: number, start: string, end: string) {
  return (
    `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${end}&models=${MODEL}` +
    `&daily=temperature_2m_mean,precipitation_sum`
  )
}

function summarizePeriod(data: {
  daily?: { time?: string[]; temperature_2m_mean?: number[]; precipitation_sum?: number[] }
}) {
  const times: string[] = data.daily?.time ?? []
  const temps: number[] = data.daily?.temperature_2m_mean ?? []
  const precip: number[] = data.daily?.precipitation_sum ?? []
  const byYearRain: Record<string, number> = {}
  const growing: number[] = []
  const futureYearTemps: Record<string, number[]> = {}
  for (let i = 0; i < times.length; i++) {
    const y = times[i].slice(0, 4)
    byYearRain[y] = (byYearRain[y] ?? 0) + (precip[i] ?? 0)
    const m = parseInt(times[i].slice(5, 7), 10)
    if (m >= 4 && m <= 9 && temps[i] != null) {
      growing.push(temps[i])
      if (!futureYearTemps[y]) futureYearTemps[y] = []
      futureYearTemps[y].push(temps[i])
    }
  }
  const rains = Object.values(byYearRain).sort((a, b) => a - b)
  const rain_mm_year = rains[Math.floor(rains.length / 2)] ?? null
  const temp_growing_season =
    growing.length > 0 ? growing.reduce((a, b) => a + b, 0) / growing.length : null
  const yearMeans = Object.values(futureYearTemps).map(
    (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
  )
  const future_temp_spread_c =
    yearMeans.length > 1 ? Math.max(...yearMeans) - Math.min(...yearMeans) : null
  return { rain_mm_year, temp_growing_season, future_temp_spread_c }
}

export async function fetchClimate2050Profile(
  base: SiteProfile,
): Promise<{ profile: SiteProfile; deltaNote: string; delta: Climate2050Delta }> {
  const [baseRes, futRes] = await Promise.all([
    fetch(climateUrl(base.lat, base.lon, BASELINE.start, BASELINE.end)),
    fetch(climateUrl(base.lat, base.lon, FUTURE.start, FUTURE.end)),
  ])
  if (!baseRes.ok || !futRes.ok) throw new Error(`climate_2050_${baseRes.status}_${futRes.status}`)
  const baseData = await baseRes.json()
  const futData = await futRes.json()
  const baseSum = summarizePeriod(baseData)
  const futSum = summarizePeriod(futData)

  const radiation_mj = base.radiation_mj ?? null
  const sun_hours_per_day = sunHoursFromRadiation(radiation_mj)
  const tempDelta =
    baseSum.temp_growing_season != null && futSum.temp_growing_season != null
      ? futSum.temp_growing_season - baseSum.temp_growing_season
      : null
  const rainDelta =
    baseSum.rain_mm_year != null && futSum.rain_mm_year != null
      ? futSum.rain_mm_year - baseSum.rain_mm_year
      : null

  const delta: Climate2050Delta = {
    baseline_period: BASELINE.label,
    future_period: FUTURE.label,
    model: MODEL,
    temp_growing_delta_c: tempDelta,
    rain_delta_mm: rainDelta,
    future_temp_spread_c: futSum.future_temp_spread_c,
    note:
      'Delta method: median growing-season temp & rain, baseline vs future windows. Multi-model spread unavailable (Climate API accepts EC_Earth3P_HR only in live-check).',
  }

  const profile: SiteProfile = {
    ...base,
    rain_mm_year: futSum.rain_mm_year ?? base.rain_mm_year,
    temp_growing_season: futSum.temp_growing_season ?? base.temp_growing_season,
    radiation_mj,
    sun_hours_per_day,
    sun_class: sunClass(sun_hours_per_day),
    moisture_class: moistureClass(futSum.rain_mm_year ?? base.rain_mm_year),
    climate_period: `${FUTURE.label} (${MODEL}, estimate)`,
    climate_2050_delta: delta,
    sources: [...(base.sources ?? []), `Open-Meteo Climate API ${MODEL}`],
  }

  const deltaNote = [
    tempDelta != null ? `Δ growing-season ${tempDelta >= 0 ? '+' : ''}${tempDelta.toFixed(1)}°C` : null,
    rainDelta != null ? `Δ rain ~${Math.round(rainDelta)} mm/yr` : null,
    futSum.future_temp_spread_c != null
      ? `future year spread ~${futSum.future_temp_spread_c.toFixed(1)}°C (${MODEL})`
      : null,
  ]
    .filter(Boolean)
    .join('; ')

  return { profile, deltaNote, delta }
}
