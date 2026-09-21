import * as SunCalc from 'suncalc'

/** Outward-facing wall azimuth in degrees clockwise from north. */
export function directSunHoursOnVerticalWall(
  lat: number,
  lon: number,
  date: Date,
  wallAzimuthDeg: number,
  stepMinutes = 15,
): number {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  let hours = 0
  for (let m = 0; m < 24 * 60; m += stepMinutes) {
    const t = new Date(start.getTime() + m * 60_000)
    const pos = SunCalc.getPosition(t, lat, lon)
    if (pos.altitude <= 0) continue
    const sunAz = pos.azimuth
    const diff = Math.abs(((sunAz - wallAzimuthDeg + 540) % 360) - 180)
    if (diff < 90) hours += stepMinutes / 60
  }
  return hours
}

export type SunZoneClass = 'full' | 'part' | 'shade'

export function classifySunHours(h: number): SunZoneClass {
  if (h >= 6) return 'full'
  if (h >= 3) return 'part'
  return 'shade'
}

/** Growing-season estimate: sample 21st of Apr–Sep, geometric hours × clear-sky factor. */
export function estimateEffectiveSunHours(
  lat: number,
  lon: number,
  clearSkyFraction: number,
): { hours: number; label: string } {
  const months = [4, 5, 6, 7, 8, 9]
  let sum = 0
  for (const month of months) {
    const d = new Date(2023, month - 1, 21)
    sum += directSunHoursOnVerticalWall(lat, lon, d, 180, 15)
  }
  const geom = sum / months.length
  const effective = geom * clearSkyFraction
  return {
    hours: effective,
    label: `~${effective.toFixed(1)} h/day geometric × ${clearSkyFraction.toFixed(2)} clear-sky (Open-Meteo, estimate)`,
  }
}
