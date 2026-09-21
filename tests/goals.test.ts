import { describe, expect, it } from 'vitest'
import {
  goalScoreForPlant,
  rankWithGoals,
  rangeFactorScore,
  siteSuitability,
} from '../server/goals.js'
import { loadPollinatorCsv } from '../server/dataFiles.js'

loadPollinatorCsv()

describe('rangeFactorScore', () => {
  it('returns null when inputs missing', () => {
    expect(rangeFactorScore(null, 0, 10)).toBeNull()
    expect(rangeFactorScore(5, null, 10)).toBeNull()
  })

  it('returns 0 outside range', () => {
    expect(rangeFactorScore(100, 10, 20)).toBe(0)
  })

  it('returns higher score near center', () => {
    const edge = rangeFactorScore(10, 10, 20)
    const mid = rangeFactorScore(15, 10, 20)
    expect(mid).toBeGreaterThan(edge)
  })
})

describe('siteSuitability', () => {
  it('renormalises when ph is null on site', () => {
    const plant = { tmin: 10, tmax: 20, rmin: 500, rmax: 900, phmin: 5, phmax: 8, limn: 4, limx: 8 }
    const site = { temp_growing_season: 15, rain_mm_year: 700, soil_ph: null, sun_hours_per_day: 5 }
    const { score, factors } = siteSuitability(plant, site)
    expect(factors.some((f) => f.factor === 'ph')).toBe(false)
    expect(factors.length).toBe(3)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe('Bee preset ranking', () => {
  it('ranks lavender above tomato for pollinator weight', () => {
    const prefs = { pollinators: 70, ornamental: 15, food: 15, effort: 'moderate' as const }
    const shortlist = [
      { name: 'tomato', cat: 'vegetables', lifo: 'herb', lispy: 'annual', tmin: 10, tmax: 30, rmin: 400, rmax: 1200 },
      {
        name: 'lavender',
        cat: 'ornamentals/turf',
        lifo: 'shrub',
        lispy: 'perennial',
        tmin: 10,
        tmax: 30,
        rmin: 400,
        rmax: 1200,
      },
    ]
    const site = { temp_growing_season: 16, rain_mm_year: 800, soil_ph: 6.5, sun_hours_per_day: 6 }
    const ranked = rankWithGoals(shortlist, site, prefs)
    expect(ranked[0].name).toBe('lavender')
    expect(ranked[0].siteSuitability).toBeGreaterThan(0)
    expect(goalScoreForPlant(shortlist[1], prefs)).toBeGreaterThan(
      goalScoreForPlant(shortlist[0], prefs) * 0.5,
    )
  })
})
