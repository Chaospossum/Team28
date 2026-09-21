import { describe, expect, it } from 'vitest'
import { buildStructuredWhy, nearMisses } from '../server/why.js'

const site = {
  temp_growing_season: 16,
  rain_mm_year: 800,
  soil_ph: 6.2,
  soil_distance_km: 6,
  climate_period: '2019–2023',
  sun_hours_per_day: 5,
}

describe('why reasons', () => {
  it('builds structured lines with sources', () => {
    const plant = { tmin: 10, tmax: 25, rmin: 500, rmax: 1200, phmin: 5.5, phmax: 7.5, limn: 4, limx: 8 }
    const parts = buildStructuredWhy(plant, site)
    expect(parts.some((p) => p.text.includes('Open-Meteo'))).toBe(true)
    expect(parts.some((p) => p.text.includes('SoilGrids'))).toBe(true)
  })

  it('finds single-factor near misses', () => {
    const rows = [
      { name: 'A', tmin: 20, tmax: 30, rmin: 500, rmax: 1200, phmin: 5, phmax: 7 },
      { name: 'B', tmin: 10, tmax: 25, rmin: 500, rmax: 1200, phmin: 8, phmax: 9 },
    ]
    const misses = nearMisses(rows, site, 5)
    expect(misses.map((m) => m.name)).toContain('A')
    expect(misses.map((m) => m.name)).toContain('B')
  })
})
