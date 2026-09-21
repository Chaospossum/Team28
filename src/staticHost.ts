import { DEMO_LAT, DEMO_LON } from './demoLocation'

/** True on GitHub Pages / other static-only builds (no Express API). */
export const STATIC_HOST = import.meta.env.VITE_STATIC_HOST === '1'

export function isDemoPlot(lat: number, lon: number) {
  return Math.abs(lat - DEMO_LAT) < 0.02 && Math.abs(lon - DEMO_LON) < 0.02
}

export function demoJsonUrl(name: 'demo-maastricht.json' | 'demo-maastricht-2050.json') {
  return new URL(name, import.meta.env.BASE_URL).href
}
