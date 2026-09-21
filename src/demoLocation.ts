/**
 * Maastricht demo bed (west / Belvedere–Caberg edge, ~3.5 km from city centre).
 * Chosen live-check 2026-09-21: nearest point to 50.85, 5.69 with both PDOK BRO
 * grondsoort and SoilGrids values at the query centroid (urban core often lacks PDOK hits).
 */
export const DEMO_LAT = 50.872
export const DEMO_LON = 5.668
/** Typical garden bed size for demo polygon (~850 m²). */
export const DEMO_AREA_M2 = 850

/** Closed ring [lon, lat] for a small bed around the demo centroid. */
export function demoPlotRing(sizeDeg = 0.00042): number[][] {
  const lat = DEMO_LAT
  const lon = DEMO_LON
  return [
    [lon - sizeDeg, lat - sizeDeg * 0.72],
    [lon + sizeDeg, lat - sizeDeg * 0.65],
    [lon + sizeDeg * 0.92, lat + sizeDeg * 0.85],
    [lon - sizeDeg * 0.88, lat + sizeDeg * 0.78],
    [lon - sizeDeg, lat - sizeDeg * 0.72],
  ]
}
