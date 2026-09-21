import { describe, expect, it } from 'vitest'
import { computeSunGrid } from '../src/shadow/gridCore'

const ring = [
  [5.689, 50.849],
  [5.691, 50.849],
  [5.691, 50.851],
  [5.689, 50.851],
  [5.689, 50.849],
]

describe('sun grid', () => {
  it('caps cells at 2000', () => {
    const grid = computeSunGrid({
      polygonRing: ring,
      originLat: 50.85,
      originLon: 5.69,
      buildings: [],
      clearSkyFraction: 0.7,
    })
    expect(grid.cells.length).toBeLessThanOrEqual(2000)
    expect(grid.cells.length).toBeGreaterThan(0)
  })
})
