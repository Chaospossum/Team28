/** Estimate clear-sky fraction from archive sunshine vs radiation-based hours (no fudge multiplier). */
export function clearSkyFractionFromProfile(
  sunHoursRadiation: number | null,
  sunHoursArchive: number | null,
): { fraction: number; label: string } {
  if (sunHoursRadiation != null && sunHoursArchive != null && sunHoursRadiation > 0.1) {
    const f = Math.min(1, Math.max(0.35, sunHoursArchive / sunHoursRadiation))
    return {
      fraction: f,
      label: `clear-sky fraction ${f.toFixed(2)} = archive sunshine / radiation hours (Open-Meteo, estimate)`,
    }
  }
  return { fraction: 0.65, label: 'clear-sky fraction 0.65 default (missing archive sunshine)' }
}
