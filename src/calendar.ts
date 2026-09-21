import type { SiteProfile } from './types'

export type MonthPhase = 'sow' | 'grow' | 'harvest' | ''

export interface MonthCell {
  month: number
  label: string
  phase: MonthPhase
}

export interface CalendarPlantTraits {
  gmin?: number | null
  gmax?: number | null
  topmn?: number | null
  topmx?: number | null
  lispy?: string | null
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

function monthFromGddFraction(gmin: number, gmax: number, fraction: number): number {
  const span = Math.max(gmax - gmin, 30)
  const target = gmin + span * fraction
  const approx = 4 + Math.round((target / (gmax || 1)) * 5)
  return Math.min(11, Math.max(3, approx))
}

/**
 * Calendar from EcoCrop GMIN/GMAX/TOPMN/TOPMX when present; null if unsupported.
 * Legacy string plant names return null (no name guessing).
 */
function idleCalendar(): MonthCell[] {
  return MONTHS.map((label, i) => ({ month: i + 1, label, phase: '' as MonthPhase }))
}

export function plantingCalendar(
  profile: SiteProfile,
  plantOrTraits: string | CalendarPlantTraits,
): MonthCell[] {
  if (typeof plantOrTraits === 'string') return idleCalendar()
  const traits = plantOrTraits
  const gmin = traits.gmin
  const gmax = traits.gmax
  const topmn = traits.topmn
  const topmx = traits.topmx
  if (gmin == null || gmax == null) return idleCalendar()

  const t = profile.temp_growing_season ?? 15
  const sowStart = monthFromGddFraction(gmin, gmax, 0.05)
  const sowEnd = monthFromGddFraction(gmin, gmax, 0.2)
  const harvestStart =
    topmn != null && topmx != null
      ? Math.min(10, Math.max(5, Math.round(topmn / 30)))
      : monthFromGddFraction(gmin, gmax, 0.65)
  const harvestEnd =
    topmn != null && topmx != null
      ? Math.min(11, Math.max(harvestStart, Math.round(topmx / 30)))
      : monthFromGddFraction(gmin, gmax, 0.9)

  const annual = (traits.lispy ?? '').toLowerCase().includes('annual')
  const sowShift = t < 14 ? 1 : 0

  return MONTHS.map((label, i) => {
    const m = i + 1
    let phase: MonthPhase = 'grow'
    const s0 = sowStart + sowShift
    const s1 = sowEnd + sowShift
    if (m >= s0 && m <= s1) phase = 'sow'
    else if (m >= harvestStart && m <= harvestEnd) phase = 'harvest'
    else if (annual && (m < s0 || m > harvestEnd)) phase = ''
    else if (!annual && m < 2) phase = ''
    return { month: m, label, phase }
  })
}
