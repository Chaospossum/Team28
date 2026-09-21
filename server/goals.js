import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let pollinatorMap = new Map()

export function loadPollinatorCsv() {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'pollinator_value.csv'), 'utf8')
  pollinatorMap = new Map()
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const [species, value, groups, months, source] = line.split(',')
    pollinatorMap.set(species.toLowerCase(), {
      value: value === '' ? null : Number(value),
      groups,
      months,
      source,
    })
  }
}

export function pollinatorValueForName(name) {
  const lower = name.toLowerCase()
  for (const [key, v] of pollinatorMap) {
    if (lower.includes(key)) return v
  }
  return { value: null, groups: '', months: '', source: 'unknown' }
}

/** 0..1 fit inside [min,max]; null if any input missing. */
export function rangeFactorScore(value, min, max) {
  if (value == null || min == null || max == null) return null
  if (value < min || value > max) return 0
  const span = max - min
  if (span <= 0) return 1
  const mid = (min + max) / 2
  const half = span / 2
  const dist = Math.abs(value - mid) / half
  return Math.max(0.35, 1 - dist * 0.35)
}

/**
 * Site suitability 0..1 from EcoCrop ranges vs site; skip null inputs and renormalise.
 */
export function siteSuitability(plant, site) {
  const factors = []
  const temp = rangeFactorScore(site.temp_growing_season, plant.tmin, plant.tmax)
  if (temp != null) factors.push({ factor: 'temperature', score: temp })
  const rain = rangeFactorScore(site.rain_mm_year, plant.rmin, plant.rmax)
  if (rain != null) factors.push({ factor: 'rainfall', score: rain })
  const ph = rangeFactorScore(site.soil_ph, plant.phmin, plant.phmax)
  if (ph != null) factors.push({ factor: 'ph', score: ph })
  const sun = rangeFactorScore(site.sun_hours_per_day, plant.limn, plant.limx)
  if (sun != null) factors.push({ factor: 'light', score: sun })

  if (factors.length === 0) {
    return { score: 0.5, factors: [] }
  }
  const sum = factors.reduce((a, f) => a + f.score, 0)
  return { score: sum / factors.length, factors }
}

export function goalScoreForPlant(plant, prefs) {
  const cat = (plant.cat ?? '').toLowerCase()
  let food = 0
  let ornamental = 0
  if (cat.includes('vegetable') || cat.includes('fruit') || cat.includes('nut')) food = 1
  if (cat.includes('ornamental') || cat.includes('turf')) ornamental = 1
  const poll = pollinatorValueForName(plant.name)
  const pollScore = poll.value == null ? 0.5 : poll.value / 3
  const w = prefs ?? { pollinators: 33, ornamental: 33, food: 34 }
  const total = w.pollinators + w.ornamental + w.food || 100
  return (
    (w.food / total) * food +
    (w.ornamental / total) * ornamental +
    (w.pollinators / total) * pollScore
  )
}

export function effortPenalty(plant, prefs) {
  const lifo = (plant.lifo ?? '').toLowerCase()
  const lispy = (plant.lispa ?? '').toLowerCase()
  let base = 0.2
  if (lifo.includes('tree') || lifo.includes('shrub')) base += 0.35
  if (lispy.includes('perennial')) base += 0.15
  if (prefs?.effort === 'minimal') return base * 1.4
  if (prefs?.effort === 'hobby') return base * 0.7
  return base
}

export function rankWithGoals(shortlist, site, prefs) {
  return shortlist
    .map((p) => {
      const goal = goalScoreForPlant(p, prefs)
      const effort = effortPenalty(p, prefs)
      const { score: siteSuit, factors: siteFactors } = siteSuitability(p, site)
      const totalScore = siteSuit * goal - effort
      return {
        ...p,
        goalScore: goal,
        effortPenalty: effort,
        siteSuitability: siteSuit,
        siteFactors,
        totalScore,
      }
    })
    .sort((a, b) => b.totalScore - a.totalScore)
}
