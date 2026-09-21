import type { SiteProfile } from './types'

export interface RangeBar {
  label: string
  site: number | null
  min: number | null
  max: number | null
  status: 'good' | 'borderline' | 'unknown'
  unit: string
}

function barStatus(site: number | null, min: number | null, max: number | null): RangeBar['status'] {
  if (site == null || min == null || max == null) return 'unknown'
  const span = max - min
  const margin = span * 0.1
  if (site >= min && site <= max) {
    if (site <= min + margin || site >= max - margin) return 'borderline'
    return 'good'
  }
  return 'borderline'
}

export function plantRangeBars(
  profile: SiteProfile,
  ranges: { tmin?: number | null; tmax?: number | null; rmin?: number | null; rmax?: number | null; phmin?: number | null; phmax?: number | null },
): RangeBar[] {
  const sunHours = profile.sun_hours_per_day
  const sunIdealMin = 4
  const sunIdealMax = 7
  return [
    {
      label: 'Sun',
      site: sunHours,
      min: sunIdealMin,
      max: sunIdealMax,
      status: barStatus(sunHours, sunIdealMin, sunIdealMax),
      unit: 'h/day',
    },
    {
      label: 'Rain',
      site: profile.rain_mm_year,
      min: ranges.rmin ?? null,
      max: ranges.rmax ?? null,
      status: barStatus(profile.rain_mm_year, ranges.rmin ?? null, ranges.rmax ?? null),
      unit: 'mm/yr',
    },
    {
      label: 'pH',
      site: profile.soil_ph,
      min: ranges.phmin ?? null,
      max: ranges.phmax ?? null,
      status: barStatus(profile.soil_ph, ranges.phmin ?? null, ranges.phmax ?? null),
      unit: '',
    },
  ]
}
