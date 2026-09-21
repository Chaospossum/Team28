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
import type { Lang } from './i18n'
import { t } from './i18n'
import type { PlotBuilding } from './types'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl })

export interface PlotSelection {
  lat: number
  lon: number
  area_m2: number
  polygon?: number[][] // [lon, lat] ring
}

function to3857(lon: number, lat: number) {
  const x = (lon * 20037508.34) / 180
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (20037508.34 / 180)
  return [x, y]
}

/** Inverted: higher radiation → deeper green; lower → amber (not red-green only). */
function radiationColor(mj: number | null) {
  const v = mj ?? 11
  if (v >= 14) return '#2d6a4f'
  if (v >= 11) return '#52b788'
  return '#e9c46a'
}

function radiationWeight(mj: number | null) {
  const v = mj ?? 11
  if (v >= 14) return 3
  if (v >= 11) return 2
  return 1
}

function rectangleToRing(layer: L.Rectangle): number[][] {
  const b = layer.getBounds()
  const sw = b.getSouthWest()
  const ne = b.getNorthEast()
  const nw = L.latLng(ne.lat, sw.lng)
  const se = L.latLng(sw.lat, ne.lng)
  return [
    [sw.lng, sw.lat],
    [se.lng, se.lat],
    [ne.lng, ne.lat],
    [nw.lng, nw.lat],
    [sw.lng, sw.lat],
  ]
}

interface Props {
  onSelect: (sel: PlotSelection) => void
  demoLat: number
  demoLon: number
  triggerDemo: number
  initialRing?: number[][] | null
  initialBuildings?: PlotBuilding[] | null
  onBuildingsChange: (b: PlotBuilding[]) => void
  radiationMj: number | null
  layers: { radiation: boolean; pdok: boolean; ndvi: boolean }
  lang?: Lang
}

export function MapDraw({
  onSelect,
  demoLat,
  demoLon,
  triggerDemo,
  initialRing,
  initialBuildings,
  onBuildingsChange,
  radiationMj,
  layers,
  lang = 'en',
}: Props) {
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.FeatureGroup | null>(null)
  const buildingsRef = useRef<L.FeatureGroup | null>(null)
  const plotLayerRef = useRef<L.Polygon | null>(null)
  const buildingIdMap = useRef<Map<L.Layer, string>>(new Map())
  const pdokRef = useRef<L.ImageOverlay | null>(null)
  const ndviRef = useRef<L.ImageOverlay | null>(null)
  const onSelectRef = useRef(onSelect)
  const onBuildingsRef = useRef(onBuildingsChange)
  const buildingsStateRef = useRef<PlotBuilding[]>([])
  onSelectRef.current = onSelect
  onBuildingsRef.current = onBuildingsChange

  const stylePlot = (layer: L.Polygon) => {
    const fill = layers.radiation ? radiationColor(radiationMj) : '#52b788'
    layer.setStyle({
      color: '#1b4332',
      weight: layers.radiation ? radiationWeight(radiationMj) : 2,
      dashArray: layers.radiation && (radiationMj ?? 11) < 11 ? '4 3' : undefined,
      fillColor: fill,
      fillOpacity: layers.radiation ? 0.45 : 0.25,
    })
  }

  const emitBuildings = () => {
    const group = buildingsRef.current
    if (!group) return
    const next: PlotBuilding[] = []
    group.eachLayer((layer) => {
      const id = buildingIdMap.current.get(layer) ?? crypto.randomUUID()
      if (layer instanceof L.Rectangle) {
        const existing = buildingsStateRef.current.find((b) => b.id === id)
        next.push({
          id,
          ring: rectangleToRing(layer),
          height_m: existing?.height_m ?? 10,
        })
      }
    })
    buildingsStateRef.current = next
    onBuildingsRef.current(next)
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

  const syncBuildingLayers = (list: PlotBuilding[]) => {
    const map = mapRef.current
    const group = buildingsRef.current
    if (!map || !group) return
    group.clearLayers()
    buildingIdMap.current.clear()
    for (const b of list) {
      if (!b.ring?.length) continue
      const layer = L.rectangle(
        L.latLngBounds(b.ring.map(([lng, la]) => [la, lng] as [number, number])),
        { color: '#495057', weight: 2, fillColor: '#6c757d', fillOpacity: 0.35 },
      )
      buildingIdMap.current.set(layer, b.id)
      group.addLayer(layer)
    }
  }

  useEffect(() => {
    const local = L.drawLocal as {
      draw?: { handlers?: { polygon?: { tooltip?: { start?: string; cont?: string; end?: string } }; rectangle?: { tooltip?: { start?: string; cont?: string; end?: string } } } }
    }
    if (local.draw?.handlers?.polygon?.tooltip) {
      local.draw.handlers.polygon.tooltip.start = t(lang, 'drawPlot')
      local.draw.handlers.polygon.tooltip.cont = t(lang, 'drawPlot')
      local.draw.handlers.polygon.tooltip.end = t(lang, 'drawPlot')
    }
    if (local.draw?.handlers?.rectangle?.tooltip) {
      local.draw.handlers.rectangle.tooltip.start = t(lang, 'drawBuilding')
      local.draw.handlers.rectangle.tooltip.cont = t(lang, 'drawBuilding')
      local.draw.handlers.rectangle.tooltip.end = t(lang, 'drawBuilding')
    }

    const map = L.map('map', { center: [demoLat, demoLon], zoom: 14 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    const drawn = new L.FeatureGroup()
    const buildingsGroup = new L.FeatureGroup()
    map.addLayer(drawn)
    map.addLayer(buildingsGroup)
    layerRef.current = drawn
    buildingsRef.current = buildingsGroup

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: { allowIntersection: false, showArea: true },
        rectangle: false,
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: drawn, remove: true },
    })
    map.addControl(drawControl)

    const buildingEdit = new L.Control.Draw({
      draw: {
        polygon: false,
        rectangle: { showArea: false },
        polyline: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: { featureGroup: buildingsGroup, remove: true },
    })
    map.addControl(buildingEdit)

    const emitFromLayer = (layer: L.Polygon) => {
      plotLayerRef.current = layer
      stylePlot(layer)
      const gj = layer.toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>
      const poly = turfPolygon(gj.geometry.coordinates as number[][][])
      const c = centroid(poly)
      const [lon, lat] = c.geometry.coordinates
      const area_m2 = area(poly)
      const ring = gj.geometry.coordinates[0] as number[][]
      onSelectRef.current({ lat, lon, area_m2, polygon: ring })
      updateNdviOverlay()
    }

    map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Created
      if (event.layerType === 'rectangle') {
        const layer = event.layer as L.Rectangle
        const id = crypto.randomUUID()
        buildingIdMap.current.set(layer, id)
        buildingsGroup.addLayer(layer)
        emitBuildings()
        return
      }
      if (event.layerType === 'polygon') {
        drawn.clearLayers()
        const layer = event.layer as L.Polygon
        drawn.addLayer(layer)
        emitFromLayer(layer)
      }
    })

    map.on(L.Draw.Event.EDITED, (e: L.LeafletEvent) => {
      const event = e as L.DrawEvents.Edited
      event.layers.eachLayer((layer) => {
        if (layer instanceof L.Polygon && drawn.hasLayer(layer)) emitFromLayer(layer)
      })
      emitBuildings()
    })

    map.on(L.Draw.Event.DELETED, () => {
      drawn.eachLayer((layer) => emitFromLayer(layer as L.Polygon))
      emitBuildings()
    })

    map.on('moveend', () => updatePdokOverlay())

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [demoLat, demoLon, lang])

  useEffect(() => {
    if (initialBuildings?.length) {
      buildingsStateRef.current = initialBuildings
      syncBuildingLayers(initialBuildings)
      onBuildingsRef.current(initialBuildings)
    }
  }, [initialBuildings])

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
    onSelectRef.current({ lat: clat, lon: clon, area_m2: area(poly), polygon: ring })
    updateNdviOverlay()
    updatePdokOverlay()
  }, [triggerDemo, demoLat, demoLon])

  useEffect(() => {
    if (!initialRing?.length || !mapRef.current || !layerRef.current) return
    const map = mapRef.current
    const drawn = layerRef.current
    drawn.clearLayers()
    const layer = L.polygon(initialRing.map(([lng, la]) => [la, lng]))
    drawn.addLayer(layer)
    plotLayerRef.current = layer
    stylePlot(layer)
    map.fitBounds(layer.getBounds(), { padding: [40, 40] })
    const poly = turfPolygon([initialRing])
    const c = centroid(poly)
    const [clon, clat] = c.geometry.coordinates
    onSelectRef.current({ lat: clat, lon: clon, area_m2: area(poly), polygon: initialRing })
    updateNdviOverlay()
    updatePdokOverlay()
  }, [initialRing])

  return (
    <div className="map-outer">
      <div id="map" className="map-wrap" role="application" aria-label={t(lang, 'mapToolbar')} />
      {layers.radiation && (
        <div className="map-radiation-legend meta" aria-hidden="true">
          <span className="rad-low">{t(lang, 'radiationLow')}</span>
          <span className="rad-high">{t(lang, 'radiationHigh')}</span>
        </div>
      )}
    </div>
  )
}
