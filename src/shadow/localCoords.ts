const M_PER_DEG_LAT = 111_320

export function toLocalMeters(lon: number, lat: number, originLon: number, originLat: number) {
  const cos = Math.cos((originLat * Math.PI) / 180)
  return {
    x: (lon - originLon) * M_PER_DEG_LAT * cos,
    y: (lat - originLat) * M_PER_DEG_LAT,
  }
}

export function fromLocalMeters(x: number, y: number, originLon: number, originLat: number) {
  const cos = Math.cos((originLat * Math.PI) / 180)
  return {
    lon: originLon + x / (M_PER_DEG_LAT * cos),
    lat: originLat + y / M_PER_DEG_LAT,
  }
}
