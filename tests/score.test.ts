import { describe, expect, it } from 'vitest'
import { computePlotScore } from '../src/score'
import type { SiteProfile } from '../src/types'

const profile: SiteProfile = {
  lat: 50.85,
  lon: 5.69,
  area_m2: 100,
  sun_hours_per_day: 6,
  radiation_mj: 12,
  rain_mm_year: 800,
  temp_growing_season: 16,
  soil_ph: 6.8,
  clay_pct: 20,
  sand_pct: 30,
  soc: null,
  soil_type_nl: null,
  sun_class: 'full sun',
  texture_class: 'loamy',
  moisture_class: 'moderate',
  sources: [],
  data_resolution_note: '',
}

describe('computePlotScore', () => {
  it('exposes heuristic breakdown', () => {
    const s = computePlotScore(profile)
    expect(s.heuristic).toBe(true)
    expect(s.breakdown.sun).toBeGreaterThan(0)
    expect(s.breakdownNote).toContain('Heuristic')
  })
})
