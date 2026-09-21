import { fetchBuildings3dBag } from './bag3d.js'

/**
 * WorldCover WMS (Terrascope) failed live-check (HTTP/2 INTERNAL_ERROR, 2026-09-21).
 * Urban context uses 3DBAG building count in 100 m as a labeled proxy.
 */
export async function classifySiteContext(lat, lon) {
  const bag = await fetchBuildings3dBag(lat, lon, 100)
  const n = bag.buildings?.length ?? 0
  const builtUpFraction = Math.min(1, n / 40)
  let className = 'rural'
  if (n >= 15) className = 'urban'
  else if (n >= 5) className = 'suburban'
  return {
    class: className,
    builtUpFraction,
    buildingCount100m: n,
    sources: [
      bag.ok
        ? `3DBAG pand count in 100 m (${bag.resolution}, ${bag.fetched_at}, measured)`
        : '3DBAG: no data here',
      'ESA WorldCover: not integrated (Terrascope WMS INTERNAL_ERROR 2026-09-21)',
      'CBS Bodemgebruik WMS: not integrated (geodata.nationaalgeoregister.nl DNS fail 2026-09-21)',
    ],
    uhi_note:
      className === 'urban'
        ? 'Urban heat island: +0.5–1.5°C vs rural assumed in dense areas (literature estimate, not measured here)'
        : null,
    soil_confidence: className === 'urban' ? 'lower in sealed/built areas' : 'standard SoilGrids 250 m',
  }
}
