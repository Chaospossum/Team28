import L from 'leaflet'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import area from '@turf/area'
import centroid from '@turf/centroid'
import { polygon as turfPolygon } from '@turf/helpers'

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

function to3857(lon: number, lat: number) {
  const x = (lon * 20037508.34) / 180
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.34 / 180)
  return [x, y]
}

function radiationColor(mj: number | null) {
  const v = mj ?? 11
  if (v >= 14) return '#e76f51'
  if (v >= 11) return '#f4a261'
  return '#90be6d'
}

interface Props {
  onSelect: (sel: PlotSelection) => void
  demoLat: number
  demoLon: number
  triggerDemo: number
  radiationMj: number | null
  layers: { radiation: boolean; pdok: boolean; ndvi: boolean }
}

export function MapDraw({
  onSelect,
  demoLat,
  demoLon,
  triggerDemo,
  radiationMj,
  layers,
}: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.FeatureGroup | null>(null)
  const plotLayerRef = useRef<L.Polygon | null>(null)
  const pdokRef = useRef<L.ImageOverlay | null>(null)
  const ndviRef = useRef<L.ImageOverlay | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const stylePlot = (layer: L.Polygon) => {
    const fill = layers.radiation ? radiationColor(radiationMj) : '#52b788'
    layer.setStyle({
      color: '#1b4332',
      weight: 2,
      fillColor: fill,
      fillOpacity: layers.radiation ? 0.45 : 0.25,
    })
  }

  const updatePdokOverlay = () => {
    const map = mapRef.current
    if (!map) return
    if (!layers.pdok) {
      pdokRef.current?.remove()
      pdokRef.current = null
      return
    }
    const b = map.getBounds()
    const sw = to3857(b.getWest(), b.getSouth())
    const ne = to3857(b.getEast(), b.getNorth())
    const url =
      `https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap` +
      `&LAYERS=soilarea&STYLES=&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true` +
      `&WIDTH=512&HEIGHT=512&BBOX=${sw[0]},${sw[1]},${ne[0]},${ne[1]}`
    const bounds = L.latLngBounds(b.getSouthWest(), b.getNorthEast())
    if (pdokRef.current) {
      pdokRef.current.setUrl(url)
      pdokRef.current.setBounds(bounds)
    } else {
      pdokRef.current = L.imageOverlay(url, bounds, { opacity: 0.55, interactive: false }).addTo(
        map,
      )
    }
  }

  const updateNdviOverlay = () => {
    const map = mapRef.current
    const plot = plotLayerRef.current
    if (!map) return
    if (!layers.ndvi || !plot) {
      ndviRef.current?.remove()
      ndviRef.current = null
      return
    }
    const bounds = plot.getBounds()
    const url = '/ndvi-sample.svg'
    if (ndviRef.current) {
      ndviRef.current.setBounds(bounds)
    } else {
      ndviRef.current = L.imageOverlay(url, bounds, { opacity: 0.5, interactive: false }).addTo(
        map,
      )
    }
  }

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
      plotLayerRef.current = layer
      stylePlot(layer)
      const gj = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>
      const poly = turfPolygon(gj.geometry.coordinates as number[][][])
      const c = centroid(poly)
      const [lon, lat] = c.geometry.coordinates
      const area_m2 = area(poly)
      onSelectRef.current({ lat, lon, area_m2 })
      updateNdviOverlay()
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

    map.on('moveend', () => updatePdokOverlay())

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [demoLat, demoLon])

  useEffect(() => {
    if (plotLayerRef.current) stylePlot(plotLayerRef.current)
    updatePdokOverlay()
    updateNdviOverlay()
  }, [layers, radiationMj])

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
    plotLayerRef.current = layer
    stylePlot(layer)
    map.fitBounds(layer.getBounds(), { padding: [40, 40] })
    const poly = turfPolygon([ring])
    const c = centroid(poly)
    const [clon, clat] = c.geometry.coordinates
    onSelectRef.current({ lat: clat, lon: clon, area_m2: area(poly) })
    updateNdviOverlay()
    updatePdokOverlay()
  }, [triggerDemo, demoLat, demoLon])

  return <div id="map" className="map-wrap" />
}
