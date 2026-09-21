import { describe, expect, it } from 'vitest'
import { DEMO_LAT, DEMO_LON, demoPlotRing } from '../src/demoLocation'
import { fetchPdokSoilType } from '../server/pdok.js'
import { fetchSoilGrids } from '../server/soil.js'

describe('Maastricht demo location', () => {
  it('has PDOK and SoilGrids at centroid', async () => {
    const pdok = await fetchPdokSoilType(DEMO_LAT, DEMO_LON)
    const soil = await fetchSoilGrids(DEMO_LAT, DEMO_LON)
    expect(pdok).toBeTruthy()
    expect(soil.ok).toBe(true)
    expect(soil.soil_ph).not.toBeNull()
  }, 45_000)

  it('demo ring closes on demo centroid', () => {
    const ring = demoPlotRing()
    expect(ring.length).toBeGreaterThan(3)
    expect(ring[0][0]).toBeCloseTo(ring[ring.length - 1][0], 5)
    expect(ring[0][1]).toBeCloseTo(ring[ring.length - 1][1], 5)
  })
})
