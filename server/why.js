export function buildStructuredWhy(plant, site) {
  const parts = []
  if (site.temp_growing_season != null && plant.tmin != null && plant.tmax != null) {
    const ok = site.temp_growing_season >= plant.tmin && site.temp_growing_season <= plant.tmax
    parts.push({
      factor: 'temperature',
      ok,
      text: `${ok ? 'Accepted' : 'Rejected'}: growing-season ${site.temp_growing_season.toFixed(1)}°C vs plant ${plant.tmin}–${plant.tmax}°C (Open-Meteo ${site.climate_period ?? 'archive'}, modeled)`,
    })
  }
  if (site.rain_mm_year != null && plant.rmin != null && plant.rmax != null) {
    const ok = site.rain_mm_year >= plant.rmin && site.rain_mm_year <= plant.rmax
    parts.push({
      factor: 'rainfall',
      ok,
      text: `${ok ? 'Accepted' : 'Rejected'}: ~${Math.round(site.rain_mm_year)} mm/yr vs ${plant.rmin}–${plant.rmax} mm (Open-Meteo, modeled)`,
    })
  }
  if (site.soil_ph != null && plant.phmin != null && plant.phmax != null) {
    const ok = site.soil_ph >= plant.phmin && site.soil_ph <= plant.phmax
    const dist = site.soil_distance_km ? `, SoilGrids ~${site.soil_distance_km} km` : ''
    parts.push({
      factor: 'ph',
      ok,
      text: `${ok ? 'Accepted' : 'Rejected'}: pH ${site.soil_ph.toFixed(1)} vs ${plant.phmin}–${plant.phmax} (ISRIC SoilGrids 250 m${dist}, measured)`,
    })
  }
  if (plant.limn != null && plant.limx != null && site.sun_hours_per_day != null) {
    const ok = site.sun_hours_per_day >= plant.limn && site.sun_hours_per_day <= plant.limx
    parts.push({
      factor: 'light',
      ok,
      text: `${ok ? 'Accepted' : 'Rejected'}: ~${site.sun_hours_per_day.toFixed(1)} h/day sun vs EcoCrop light ${plant.limn}–${plant.limx} (estimate from radiation)`,
    })
  }
  return parts
}

export function whySentence(parts) {
  const good = parts.filter((p) => p.ok).map((p) => p.text)
  return good.slice(0, 2).join('; ') || parts[0]?.text || 'Rule-based EcoCrop match.'
}

export function nearMisses(allRows, site, limit = 5) {
  const temp = site.temp_growing_season
  const rain = site.rain_mm_year
  const ph = site.soil_ph
  const misses = []
  for (const row of allRows) {
    let fails = 0
    if (temp != null && row.tmin != null && (temp < row.tmin || temp > row.tmax)) fails++
    if (rain != null && row.rmin != null && (rain < row.rmin || rain > row.rmax)) fails++
    if (ph != null && row.phmin != null && (ph < row.phmin || ph > row.phmax)) fails++
    if (fails === 1) misses.push(row)
  }
  return misses.slice(0, limit)
}
