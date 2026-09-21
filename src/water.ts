import type { PlantRecommendation, SiteProfile } from './types'

/** Rough litres per season saved vs a "wrong" high-water mismatch (estimate). */
export function estimateWaterSaving(
  profile: SiteProfile,
  plants: PlantRecommendation[],
): { litres: number; headline: string; detail: string } {
  const area = Math.max(profile.area_m2 ?? 10, 4)
  const rain = profile.rain_mm_year ?? 800
  const naturalMm = rain * 0.15
  const baselineNeed = area * 120
  const top = plants.slice(0, 3)
  const matchedNeed = top.reduce((sum, p) => {
    const factor = p.water_need === 'low' ? 0.55 : p.water_need === 'high' ? 1.25 : 0.85
    return sum + area * 40 * factor
  }, 0)
  const saved = Math.max(0, Math.round(baselineNeed - matchedNeed + naturalMm * area * 0.02))
  const litres = Math.min(saved, Math.round(area * 80))
  return {
    litres,
    headline: `Saves ~${litres.toLocaleString()} L of watering per season (estimate)`,
    detail: `Compared with a typical mismatched crop mix on ~${Math.round(area)} m² with ~${Math.round(rain)} mm rain/yr.`,
  }
}
