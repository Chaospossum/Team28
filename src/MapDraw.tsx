import L from 'leaflet'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import area from '@turf/area'
import centroid from '@turf/centroid'
import { polygon as turfPolygon } from '@turf/helpers'

// Fix default marker icons in bundlers
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

export interface PlotSelection {
  lat: number
  lon: number
  area_m2: number
}

interface Props {
  onSelect: (sel: PlotSelection) => void
  demoLat: number
  demoLon: number
  triggerDemo: number
}

export function MapDraw({ onSelect, demoLat, demoLon, triggerDemo }: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.FeatureGroup | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    const map = L.map('map', { center: [demoLat, demoLon], zoom: 14 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    const drawn = new L.FeatureGroup()
    map.addLayer(drawn)
    layerRef.current = drawn

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, showArea: true },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: drawn },
    })
    map.addControl(drawControl)

    const emitFromLayer = (layer: L.Polygon) => {
      const gj = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>
      const poly = turfPolygon(gj.geometry.coordinates as number[][][])
      const c = centroid(poly)
      const [lon, lat] = c.geometry.coordinates
      const area_m2 = area(poly)
      onSelectRef.current({ lat, lon, area_m2 })
    }

    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created
      drawn.clearLayers()
      const layer = event.layer as L.Polygon
      drawn.addLayer(layer)
      emitFromLayer(layer)
    })

    map.on(L.Draw.Event.EDITED, () => {
      drawn.eachLayer((layer) => emitFromLayer(layer as L.Polygon))
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [demoLat, demoLon])

  useEffect(() => {
    if (!triggerDemo || !mapRef.current || !layerRef.current) return
    const map = mapRef.current
    const drawn = layerRef.current
    const size = 0.0012
    const lat = demoLat
    const lon = demoLon
    const ring = [
      [lon - size, lat - size * 0.7],
      [lon + size, lat - size * 0.6],
      [lon + size * 0.9, lat + size * 0.8],
      [lon - size * 0.8, lat + size * 0.7],
      [lon - size, lat - size * 0.7],
    ]
    drawn.clearLayers()
    const layer = L.polygon(ring.map(([lng, la]) => [la, lng]))
    drawn.addLayer(layer)
    map.fitBounds(layer.getBounds(), { padding: [40, 40] })
    const poly = turfPolygon([ring])
    const c = centroid(poly)
    const [clon, clat] = c.geometry.coordinates
    onSelectRef.current({ lat: clat, lon: clon, area_m2: area(poly) })
  }, [triggerDemo, demoLat, demoLon])

  return <div id="map" className="map-wrap" />
}
