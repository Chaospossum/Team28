import { describe, expect, it } from 'vitest'
import { plantingCalendar } from '../src/calendar'
import type { SiteProfile } from '../src/types'

const profile: SiteProfile = {
  lat: 50.85,
  lon: 5.69,
  area_m2: 100,
  sun_hours_per_day: 5,
  radiation_mj: 11,
  rain_mm_year: 800,
  temp_growing_season: 16,
  soil_ph: 6.5,
  clay_pct: 20,
  sand_pct: 30,
  soc: null,
  soil_type_nl: null,
  sun_class: 'part shade',
  texture_class: 'loamy',
  moisture_class: 'moderate',
  sources: [],
  data_resolution_note: '',
}

describe('plantingCalendar', () => {
  it('returns idle months for name-only (unsupported)', () => {
    const c = plantingCalendar(profile, 'tomato')
    expect(c.every((m) => m.phase === '')).toBe(true)
  })

  it('uses EcoCrop GMIN/GMAX when provided', () => {
    const c = plantingCalendar(profile, { gmin: 800, gmax: 2200, lispy: 'annual' })
    expect(c.some((m) => m.phase === 'sow')).toBe(true)
  })
})
