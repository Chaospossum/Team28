import * as SunCalc from 'suncalc'
import { fromLocalMeters, toLocalMeters } from './localCoords'
import { classifySunHours } from './sun'

export interface PlotBuilding {
  id: string
  ring: number[][] // [lon, lat]
  height_m: number
}

export interface SunGridCell {
  i: number
  j: number
  lon: number
  lat: number
  monthlyGeometricHours: number[]
  growingEffectiveHours: number
  zone: 'full' | 'part' | 'shade'
}

export interface SunGridResult {
  cols: number
  rows: number
  cellM: number
  clearSkyFraction: number
  cells: SunGridCell[]
  zones: { full: number; part: number; shade: number }
  label: string
}

const MAX_CELLS = 2000
const GROWING_MONTHS = [4, 5, 6, 7, 8, 9]

function pointInRing(x: number, y: number, ring: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x
    const yi = ring[i].y
    const xj = ring[j].x
    const yj = ring[j].y
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function ringToLocal(ring: number[][], originLon: number, originLat: number) {
  return ring.map(([lon, lat]) => toLocalMeters(lon, lat, originLon, originLat))
}

function cellBlockedByBuildings(
  cx: number,
  cy: number,
  sunAz: number,
  sunAltDeg: number,
  buildings: Array<{ footprint: { x: number; y: number }[]; height_m: number }>,
): boolean {
  if (sunAltDeg <= 0) return true
  const altRad = (sunAltDeg * Math.PI) / 180
  const sunDirX = Math.sin((sunAz * Math.PI) / 180) * Math.cos(altRad)
  const sunDirY = Math.cos((sunAz * Math.PI) / 180) * Math.cos(altRad)
  for (const b of buildings) {
    if (b.height_m <= 0) continue
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of b.footprint) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }
    const bx = (minX + maxX) / 2
    const by = (minY + maxY) / 2
    const dx = cx - bx
    const dy = cy - by
    const dot = dx * sunDirX + dy * sunDirY
    if (dot >= 0) continue
    const shadowLen = b.height_m / Math.tan(altRad)
    const shadowX = bx - sunDirX * shadowLen
    const shadowY = by - sunDirY * shadowLen
    const dist = Math.hypot(cx - shadowX, cy - shadowY)
    const footprintSpan = Math.max(maxX - minX, maxY - minY)
    if (dist < footprintSpan * 0.75) return true
  }
  return false
}

function geometricHoursForDay(
  lat: number,
  lon: number,
  year: number,
  month: number,
  day: number,
  cx: number,
  cy: number,
  buildings: Array<{ footprint: { x: number; y: number }[]; height_m: number }>,
): number {
  const start = new Date(year, month - 1, day, 0, 0, 0)
  let hours = 0
  for (let m = 0; m < 24 * 60; m += 15) {
    const t = new Date(start.getTime() + m * 60_000)
    const pos = SunCalc.getPosition(t, lat, lon)
    if (pos.altitude <= 0) continue
    if (cellBlockedByBuildings(cx, cy, pos.azimuth, pos.altitude, buildings)) continue
    hours += 0.25
  }
  return hours
}

export function computeSunGrid(params: {
  polygonRing: number[][] // lon, lat closed
  originLat: number
  originLon: number
  buildings: PlotBuilding[]
  clearSkyFraction: number
  year?: number
}): SunGridResult {
  const { polygonRing, originLat, originLon, buildings, clearSkyFraction } = params
  const year = params.year ?? 2023
  const plotLocal = ringToLocal(polygonRing, originLon, originLat)
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of plotLocal) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  const width = maxX - minX
  const height = maxY - minY
  let cellM = 2
  let cols = Math.max(1, Math.ceil(width / cellM))
  let rows = Math.max(1, Math.ceil(height / cellM))
  while (cols * rows > MAX_CELLS) {
    cellM += 0.5
    cols = Math.max(1, Math.ceil(width / cellM))
    rows = Math.max(1, Math.ceil(height / cellM))
  }

  const buildingLocal = buildings.map((b) => ({
    footprint: ringToLocal(b.ring, originLon, originLat),
    height_m: b.height_m,
  }))

  const cells: SunGridCell[] = []
  const zoneCounts = { full: 0, part: 0, shade: 0 }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = minX + (i + 0.5) * cellM
      const cy = minY + (j + 0.5) * cellM
      if (!pointInRing(cx, cy, plotLocal)) continue
      const { lon, lat } = fromLocalMeters(cx, cy, originLon, originLat)
      const monthlyGeometricHours: number[] = []
      for (let month = 1; month <= 12; month++) {
        monthlyGeometricHours.push(
          geometricHoursForDay(lat, lon, year, month, 21, cx, cy, buildingLocal),
        )
      }
      const growingGeom =
        GROWING_MONTHS.reduce((s, m) => s + monthlyGeometricHours[m - 1], 0) / GROWING_MONTHS.length
      const growingEffectiveHours = growingGeom * clearSkyFraction
      const zone = classifySunHours(growingEffectiveHours)
      zoneCounts[zone]++
      cells.push({
        i,
        j,
        lon,
        lat,
        monthlyGeometricHours,
        growingEffectiveHours,
        zone,
      })
    }
  }

  const label = `Effective sun = geometric × ${clearSkyFraction.toFixed(2)} clear-sky (Open-Meteo, estimate); grid ${cellM.toFixed(1)} m, ${cells.length} cells`
  return {
    cols,
    rows,
    cellM,
    clearSkyFraction,
    cells,
    zones: zoneCounts,
    label,
  }
}

export function zoneMedianHours(cells: SunGridCell[], zone: SunGridCell['zone']): number | null {
  const vals = cells.filter((c) => c.zone === zone).map((c) => c.growingEffectiveHours)
  if (!vals.length) return null
  vals.sort((a, b) => a - b)
  return vals[Math.floor(vals.length / 2)]
}
