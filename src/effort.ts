import type { UserPrefs } from './types'

/** Monthly workload index 0–100 (estimate) for calendar bar. */
export function monthlyWorkloadIndex(prefs: UserPrefs): number[] {
  const base =
    prefs.effort === 'minimal' ? 25 : prefs.effort === 'hobby' ? 70 : 45
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    if (m >= 5 && m <= 8) return Math.min(100, base + 35)
    if (m === 4 || m === 9) return Math.min(100, base + 15)
    if (m <= 2 || m === 12) return Math.max(5, base - 30)
    return base
  })
}

export function effortHoursLabel(prefs: UserPrefs): string {
  if (prefs.effort === 'minimal') return '≈ <1 h/week in May–Aug, ~0 in winter (estimate)'
  if (prefs.effort === 'hobby') return '≈ 3+ h/week in May–Aug, light in winter (estimate)'
  return '≈ 1–3 h/week in May–Aug, ~0 in winter (estimate)'
}
