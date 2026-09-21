import L from 'leaflet'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet/dist/leaflet.css'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
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

/** WMS base URL — tiles load in the browser (cached per tile); no backend proxy required */
const PDOK_WMS_URL = 'https://service.pdok.nl/bzk/bro-bodemkaart/wms/v1_0'

/** Finished bed polygon — light outline, soft fill */
const PLOT_SHAPE = {
  color: '#dcf16a',
  weight: 1.5,
  opacity: 0.95,
  fillColor: '#3d6b54',
  fillOpacity: 0.2,
  lineJoin: 'round' as const,
  lineCap: 'round' as const,
}

/** While drawing (leaflet-draw preview) */
const PLOT_DRAW_SHAPE = {
  ...PLOT_SHAPE,
  dashArray: '6 4',
  fillOpacity: 0.12,
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

export interface MapDrawHandle {
  startPlotDraw: () => void
}

interface Props {
  onSelect: (sel: PlotSelection) => void
  viewLat: number
  viewLon: number
  viewZoom: number
  demoLat: number
  demoLon: number
  triggerDemo: number
  initialRing?: number[][] | null
  initialBuildings?: PlotBuilding[] | null
  onBuildingsChange: (b: PlotBuilding[]) => void
  onPlotRemoved?: () => void
  radiationMj: number | null
  layers: { radiation: boolean; pdok: boolean; ndvi: boolean }
  lang?: Lang
}

function applyDrawLocale(lang: Lang) {
  const bed = t(lang, 'drawBedButton')
  const plotTip = t(lang, 'drawPlot')
  const buildingTip = t(lang, 'drawBuilding')
  const local = L.drawLocal as {
    draw?: {
      toolbar?: { buttons?: Record<string, string>; actions?: { title?: string } }
      handlers?: {
        polygon?: { tooltip?: { start?: string; cont?: string; end?: string } }
        rectangle?: { tooltip?: { start?: string; cont?: string; end?: string } }
      }
    }
    edit?: {
      toolbar?: { buttons?: Record<string, string>; actions?: { save?: { title?: string } } }
    }
  }
  if (local.draw?.toolbar?.buttons) {
    local.draw.toolbar.buttons.polygon = bed
  }
  if (local.draw?.handlers?.polygon?.tooltip) {
    local.draw.handlers.polygon.tooltip.start = plotTip
    local.draw.handlers.polygon.tooltip.cont = plotTip
    local.draw.handlers.polygon.tooltip.end = plotTip
  }
  if (local.draw?.handlers?.rectangle?.tooltip) {
    local.draw.handlers.rectangle.tooltip.start = buildingTip
    local.draw.handlers.rectangle.tooltip.cont = buildingTip
    local.draw.handlers.rectangle.tooltip.end = buildingTip
  }
  if (local.edit?.toolbar?.buttons) {
    local.edit.toolbar.buttons.edit = t(lang, 'drawPlot')
  }
}

export const MapDraw = forwardRef<MapDrawHandle, Props>(function MapDraw(
  {
    onSelect,
    viewLat,
    viewLon,
    viewZoom,
    demoLat,
    demoLon,
    triggerDemo,
    initialRing,
    initialBuildings,
    onBuildingsChange,
    onPlotRemoved,
    radiationMj,
    layers,
    lang = 'en',
  },
  ref,
) {
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.FeatureGroup | null>(null)
  const buildingsRef = useRef<L.FeatureGroup | null>(null)
  const plotLayerRef = useRef<L.Polygon | null>(null)
  const buildingIdMap = useRef<Map<L.Layer, string>>(new Map())
  const pdokLayerRef = useRef<L.TileLayer.WMS | null>(null)
  const ndviRef = useRef<L.ImageOverlay | null>(null)
  const onSelectRef = useRef(onSelect)
  const onBuildingsRef = useRef(onBuildingsChange)
  const onPlotRemovedRef = useRef(onPlotRemoved)
  const buildingsStateRef = useRef<PlotBuilding[]>([])
  const layersRef = useRef(layers)
  const radiationMjRef = useRef(radiationMj)
  onSelectRef.current = onSelect
  onBuildingsRef.current = onBuildingsChange
  onPlotRemovedRef.current = onPlotRemoved
  layersRef.current = layers
  radiationMjRef.current = radiationMj

  useImperativeHandle(ref, () => ({
    startPlotDraw() {
      const map = mapRef.current
      if (!map) return
      const root = map.getContainer()
      root.querySelector<HTMLElement>('.leaflet-draw-actions a.leaflet-draw-action-cancel')?.click()
      const polygonBtn = root.querySelector<HTMLElement>(
        '.leaflet-draw-toolbar:not(.leaflet-draw-toolbar-top) a.leaflet-draw-draw-polygon, .leaflet-draw-draw-polygon',
      )
      if (polygonBtn) {
        polygonBtn.click()
        map.getContainer().focus()
        return
      }
      new L.Draw.Polygon(map as L.DrawMap, {
        allowIntersection: false,
        showArea: false,
        shapeOptions: { ...PLOT_DRAW_SHAPE },
      }).enable()
    },
  }))

  const stylePlot = (layer: L.Polygon) => {
    const ly = layersRef.current
    const mj = radiationMjRef.current
    const fill = ly.radiation ? radiationColor(mj) : '#52b788'
    layer.setStyle({
      ...PLOT_SHAPE,
      color: ly.radiation ? fill : PLOT_SHAPE.color,
      weight: ly.radiation ? Math.min(2, radiationWeight(mj) + 0.5) : PLOT_SHAPE.weight,
      dashArray: ly.radiation && (mj ?? 11) < 11 ? '5 4' : undefined,
      fillColor: fill,
      fillOpacity: ly.radiation ? 0.28 : PLOT_SHAPE.fillOpacity,
    })
  }

  const bringDrawnLayersToFront = () => {
    layerRef.current?.bringToFront()
    buildingsRef.current?.bringToFront()
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

  const syncPdokLayer = () => {
    const map = mapRef.current
    if (!map) return
    const ly = layersRef.current
    if (!ly.pdok) {
      if (pdokLayerRef.current) {
        map.removeLayer(pdokLayerRef.current)
        pdokLayerRef.current = null
      }
      return
    }
    if (!pdokLayerRef.current) {
      pdokLayerRef.current = L.tileLayer.wms(PDOK_WMS_URL, {
        layers: 'soilarea',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        opacity: 0.62,
        maxNativeZoom: 18,
        maxZoom: 19,
        zIndex: 250,
      })
      pdokLayerRef.current.addTo(map)
    }
    bringDrawnLayersToFront()
  }

  const updateNdviOverlay = () => {
    const map = mapRef.current
    const plot = plotLayerRef.current
    if (!map) return
    const ly = layersRef.current
    if (!ly.ndvi || !plot) {
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
    bringDrawnLayersToFront()
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
    applyDrawLocale(lang)
  }, [lang])

  useEffect(() => {
    const map = L.map('map', { center: [viewLat, viewLon], zoom: viewZoom })
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

    const plotPolygonOptions = {
      allowIntersection: false,
      /** leaflet-draw 1.0.4 throws in strict mode when showArea calls readableArea (undeclared `type`) */
      showArea: false,
      shapeOptions: { ...PLOT_DRAW_SHAPE },
    }

    const drawControl = new L.Control.Draw({
      draw: {
        polygon: plotPolygonOptions,
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
      syncPdokLayer()
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
      let plotLeft = false
      drawn.eachLayer((layer) => {
        if (layer instanceof L.Polygon) {
          plotLeft = true
          emitFromLayer(layer)
        }
      })
      if (!plotLeft) {
        plotLayerRef.current = null
        updateNdviOverlay()
        onPlotRemovedRef.current?.()
      }
      emitBuildings()
    })

    mapRef.current = map
    syncPdokLayer()
    return () => {
      map.remove()
      mapRef.current = null
      pdokLayerRef.current = null
    }
  }, [viewLat, viewLon, viewZoom])

  useEffect(() => {
    if (initialBuildings?.length) {
      buildingsStateRef.current = initialBuildings
      syncBuildingLayers(initialBuildings)
      onBuildingsRef.current(initialBuildings)
    }
  }, [initialBuildings])

  useEffect(() => {
    if (plotLayerRef.current) stylePlot(plotLayerRef.current)
    syncPdokLayer()
    updateNdviOverlay()
  }, [layers, radiationMj])

  useEffect(() => {
    if (!triggerDemo || !mapRef.current || !layerRef.current) return
    const map = mapRef.current
    const drawn = layerRef.current
    const size = 0.00042
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
    map.fitBounds(layer.getBounds(), { padding: [56, 56], maxZoom: 16 })
    const poly = turfPolygon([ring])
    const c = centroid(poly)
    const [clon, clat] = c.geometry.coordinates
    onSelectRef.current({ lat: clat, lon: clon, area_m2: area(poly), polygon: ring })
    updateNdviOverlay()
    syncPdokLayer()
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
    map.fitBounds(layer.getBounds(), { padding: [56, 56], maxZoom: 16 })
    const poly = turfPolygon([initialRing])
    const c = centroid(poly)
    const [clon, clat] = c.geometry.coordinates
    onSelectRef.current({ lat: clat, lon: clon, area_m2: area(poly), polygon: initialRing })
    updateNdviOverlay()
    syncPdokLayer()
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
})
