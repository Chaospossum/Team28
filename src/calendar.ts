import type { SiteProfile } from './types'

export type MonthPhase = 'sow' | 'grow' | 'harvest' | ''

export interface MonthCell {
  month: number
  label: string
  phase: MonthPhase
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/** Heuristic calendar from growing-season temperature (estimate). */
export function plantingCalendar(profile: SiteProfile, plantName: string): MonthCell[] {
  const t = profile.temp_growing_season ?? 15
  const name = plantName.toLowerCase()
  const isCool = name.includes('lettuce') || name.includes('pea') || name.includes('spinach')
  const isWarm = name.includes('tomato') || name.includes('pepper') || name.includes('bean')
  const sowStart = isWarm ? (t >= 16 ? 3 : 4) : isCool ? 2 : 3
  const sowEnd = isWarm ? 5 : 4
  const harvestStart = isWarm ? 7 : 6
  const harvestEnd = isWarm ? 9 : 8
  return MONTHS.map((label, i) => {
    const m = i + 1
    let phase: MonthPhase = 'grow'
    if (m >= sowStart && m <= sowEnd) phase = 'sow'
    else if (m >= harvestStart && m <= harvestEnd) phase = 'harvest'
    else if (m < sowStart || m > harvestEnd) phase = ''
    return { month: m, label, phase }
  })
}
