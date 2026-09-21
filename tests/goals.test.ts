import { describe, expect, it } from 'vitest'
import { goalScoreForPlant, loadPollinatorCsv, rankWithGoals } from '../server/goals.js'

loadPollinatorCsv()

describe('Bee preset ranking', () => {
  it('ranks lavender above tomato for pollinator weight', () => {
    const prefs = { pollinators: 70, ornamental: 15, food: 15, effort: 'moderate' as const }
    const shortlist = [
      { name: 'tomato', cat: 'vegetables', lifo: 'herb', lispy: 'annual' },
      { name: 'lavender', cat: 'ornamentals/turf', lifo: 'shrub', lispy: 'perennial' },
    ]
    const ranked = rankWithGoals(shortlist, {}, prefs)
    expect(ranked[0].name).toBe('lavender')
    expect(goalScoreForPlant(shortlist[1], prefs)).toBeGreaterThan(
      goalScoreForPlant(shortlist[0], prefs) * 0.5,
    )
  })
})
