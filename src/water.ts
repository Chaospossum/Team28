import type { PlantRecommendation, SiteProfile } from './types'

export type WaterStressBand = 'surplus' | 'balanced' | 'deficit' | 'unknown'

/** Qualitative rain vs plant water need — no ET coefficients. */
export function waterStressBand(
  profile: SiteProfile,
  waterNeed: string,
): WaterStressBand {
  const rain = profile.rain_mm_year
  if (rain == null) return 'unknown'
  const need = waterNeed.toLowerCase()
  if (need === 'low' && rain > 950) return 'surplus'
  if (need === 'high' && rain < 550) return 'deficit'
  if (need === 'moderate' && rain >= 500 && rain <= 1000) return 'balanced'
  if (need === 'low' && rain < 450) return 'deficit'
  if (need === 'high' && rain > 1100) return 'surplus'
  return 'balanced'
}

export function estimateWaterSaving(
  profile: SiteProfile,
  plants: PlantRecommendation[],
): { band: WaterStressBand; headline: string; detail: string } {
  const area = Math.max(profile.area_m2 ?? 10, 4)
  const rain = profile.rain_mm_year
  const top = plants.slice(0, 3)
  const bands = top.map((p) => waterStressBand(profile, p.water_need))
  const deficit = bands.filter((b) => b === 'deficit').length
  const surplus = bands.filter((b) => b === 'surplus').length
  let band: WaterStressBand = 'balanced'
  if (deficit >= 2) band = 'deficit'
  else if (surplus >= 2) band = 'surplus'
  else if (bands.includes('unknown')) band = 'unknown'

  const headline =
    band === 'deficit'
      ? 'Top picks may need extra irrigation vs local rain (qualitative)'
      : band === 'surplus'
        ? 'Rain often exceeds low-water picks — watch drainage (qualitative)'
        : band === 'unknown'
          ? 'Water balance unknown — rain data missing'
          : 'Rain and water needs look broadly aligned (qualitative)'

  const detail =
    rain != null
      ? `~${Math.round(rain)} mm/yr rain on ~${Math.round(area)} m²; bands from plant water_need labels only (estimate).`
      : 'No annual rain on site profile — cannot compare.'

  return { band, headline, detail }
}
