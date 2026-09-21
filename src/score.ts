import type { SiteProfile } from './types'

export interface PlotScore {
  value: number
  verdict: string
  breakdown: { sun: number; rain: number; ph: number; texture: number }
}

function sunScore(hours: number | null) {
  if (hours == null) return 0.55
  if (hours >= 5 && hours <= 7) return 1
  if (hours >= 3.5 && hours < 5) return 0.75
  if (hours < 3) return 0.45
  return 0.85
}

function rainScore(mm: number | null) {
  if (mm == null) return 0.55
  if (mm >= 650 && mm <= 900) return 1
  if (mm >= 500 && mm < 650) return 0.7
  if (mm > 900 && mm <= 1100) return 0.65
  return 0.5
}

function phScore(ph: number | null) {
  if (ph == null) return 0.6
  if (ph >= 6 && ph <= 7.2) return 1
  if (ph >= 5.5 && ph < 6) return 0.8
  if (ph > 7.2 && ph <= 7.8) return 0.75
  return 0.55
}

function textureScore(texture: string) {
  if (texture === 'loamy') return 1
  if (texture === 'sandy') return 0.75
  if (texture === 'clay') return 0.65
  return 0.55
}

export function computePlotScore(profile: SiteProfile): PlotScore {
  const breakdown = {
    sun: sunScore(profile.sun_hours_per_day),
    rain: rainScore(profile.rain_mm_year),
    ph: phScore(profile.soil_ph),
    texture: textureScore(profile.texture_class),
  }
  const weighted =
    breakdown.sun * 0.3 +
    breakdown.rain * 0.25 +
    breakdown.ph * 0.25 +
    breakdown.texture * 0.2
  const value = Math.round(weighted * 100)
  let verdict = 'Balanced plot — mix of hardy staples and seasonal crops.'
  if (value >= 80) verdict = 'Great for leafy greens and fruiting crops; watch summer heat.'
  else if (value >= 65) verdict = 'Great for leafy greens; tomatoes may need extra sun and warmth.'
  else if (value >= 50) verdict = 'Good for hardy greens and herbs; heat-lovers need protection.'
  else verdict = 'Challenging site — focus on shade-tolerant and moisture-smart choices.'
  if (profile.sun_class === 'shade') {
    verdict = 'Shaded plot — great for leafy greens, tough for sun-hungry tomatoes.'
  }
  return { value, verdict, breakdown }
}
