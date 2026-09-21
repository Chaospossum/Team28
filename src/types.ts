export interface SiteContext {
  class: string
  builtUpFraction: number
  buildingCount100m: number
  sources: string[]
  uhi_note?: string | null
  soil_confidence?: string
}

export interface SiteProfile {
  lat: number
  lon: number
  site_context?: SiteContext
  area_m2: number
  sun_hours_per_day: number | null
  sun_hours_archive?: number | null
  radiation_mj: number | null
  rain_mm_year: number | null
  temp_growing_season: number | null
  climate_period?: string
  sun_class_source?: string
  soil_ph: number | null
  clay_pct: number | null
  sand_pct: number | null
  soc: number | null
  soil_type_nl: string | null
  pdok_unavailable?: boolean
  soil_distance_km?: number
  soil_resolution_note?: string
  sun_class: 'full sun' | 'part shade' | 'shade'
  texture_class: string
  moisture_class: string
  sources: string[]
  data_resolution_note: string
  manual_shade?: boolean
}

export interface PlantRanges {
  tmin?: number | null
  tmax?: number | null
  rmin?: number | null
  rmax?: number | null
  phmin?: number | null
  phmax?: number | null
  limn?: number | null
  limx?: number | null
}

export interface UserPrefs {
  pollinators: number
  ornamental: number
  food: number
  effort: 'minimal' | 'moderate' | 'hobby'
}

export interface WhyLine {
  factor: string
  ok: boolean
  text: string
}

export interface PlantRecommendation {
  name: string
  why: string
  why_structured?: WhyLine[]
  water_need: string
  sun_need: string
  risk: string
  ranges?: PlantRanges
}

export interface RecommendResponse {
  siteProfile: SiteProfile
  plants: PlantRecommendation[]
  shortlistCount: number
  rankingSource?: string
  usedLlm?: boolean
  fallback?: boolean
}

export type LoadingKey = 'climate' | 'soil' | 'pdok' | 'plants'
