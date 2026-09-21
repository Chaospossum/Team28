import { describe, expect, it } from 'vitest'
import { estimateWaterSaving, waterStressBand } from '../src/water'
import type { SiteProfile } from '../src/types'

const base: SiteProfile = {
  lat: 50.85,
  lon: 5.69,
  area_m2: 100,
  sun_hours_per_day: 5,
  radiation_mj: 11,
  rain_mm_year: 400,
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

describe('waterStressBand', () => {
  it('flags deficit for high need and low rain', () => {
    expect(waterStressBand(base, 'high')).toBe('deficit')
  })
})

describe('estimateWaterSaving', () => {
  it('returns qualitative band without litre coefficient', () => {
    const est = estimateWaterSaving(base, [
      { name: 'a', why: '', water_need: 'high', sun_need: 'full sun', risk: '' },
      { name: 'b', why: '', water_need: 'high', sun_need: 'full sun', risk: '' },
      { name: 'c', why: '', water_need: 'high', sun_need: 'full sun', risk: '' },
    ])
    expect(est.band).toBe('deficit')
    expect(est.headline).toContain('qualitative')
  })
})
