import type { FrostGddMetrics } from './types'

const BASE_TEMP_C = 5

/** Frost percentiles + GDD from Open-Meteo archive daily arrays (already fetched). */
export function frostAndGddFromDaily(
  times: string[],
  tmin: number[],
  tmax: number[],
  periodLabel: string,
): FrostGddMetrics {
  const frostByYear: Record<string, number> = {}
  const springThaw: number[] = []
  const fallFrost: number[] = []
  let gddSum = 0
  let gddDays = 0

  for (let i = 0; i < times.length; i++) {
    const y = times[i].slice(0, 4)
    const month = parseInt(times[i].slice(5, 7), 10)
    const day = parseInt(times[i].slice(8, 10), 10)
    const doy = dayOfYear(month, day)
    const lo = tmin[i]
    const hi = tmax[i]
    if (lo != null && lo < 0) frostByYear[y] = (frostByYear[y] ?? 0) + 1
    if (lo != null && lo < 0 && month <= 6) springThaw.push(doy)
    if (lo != null && lo < 0 && month >= 8) fallFrost.push(doy)
    if (month >= 4 && month <= 9 && lo != null && hi != null) {
      const mean = (hi + lo) / 2
      gddSum += Math.max(0, mean - BASE_TEMP_C)
      gddDays++
    }
  }

  const frostYears = Object.values(frostByYear).sort((a, b) => a - b)
  const frost_days_median = frostYears.length ? frostYears[Math.floor(frostYears.length / 2)] : null
  springThaw.sort((a, b) => a - b)
  fallFrost.sort((a, b) => a - b)
  const last_spring_frost_doy_p10 = percentile(springThaw, 0.9)
  const first_fall_frost_doy_p90 = percentile(fallFrost, 0.1)
  const gdd_base5_growing = gddDays > 0 ? Math.round(gddSum) : null

  return {
    frost_days_median,
    last_spring_frost_doy_p10,
    first_fall_frost_doy_p90,
    gdd_base5_growing,
    source: `Open-Meteo Archive ${periodLabel}`,
    data_kind: 'modeled',
  }
}

function dayOfYear(month: number, day: number): number {
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let d = day
  for (let m = 1; m < month; m++) d += days[m]
  return d
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}
