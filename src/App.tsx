import { useCallback, useEffect, useRef, useState } from 'react'
import { computeSunGrid } from './shadow/gridCore'
import './App.css'
import { fetchClimate2050Profile } from './climate2050'
import { fetchClimateProfile, sunClass } from './climate'
import type { Lang } from './i18n'
import { t, tFormat } from './i18n'
import { MapDraw, type MapDrawHandle, type PlotSelection } from './MapDraw'
import {
  LayerToggles,
  PlotScoreHero,
  RecommendedPlantsSection,
  ShareExport,
  SunHeatmapCard,
  WaterSavingCard,
  zoneHoursSummary,
} from './Phase5UI'
import { computePlotScore } from './score'
import { readShareFromUrl } from './share'
import { defaultPrefs, type SharePayload } from './shareState'
import { effortHoursLabel } from './effort'
import { UserGoals } from './UserGoals'
import { FungiPanel } from './FungiPanel'
import { WhyNotPanel } from './WhyNotPanel'
import { clearSkyFractionFromProfile } from './shadow/clearSky'
import type { SunGridResult } from './shadow/gridCore'
import { DEMO_AREA_M2, DEMO_LAT, DEMO_LON, demoPlotRing } from './demoLocation'
import type {
  PlotBuilding,
  PlantRecommendation,
  RecommendResponse,
  SiteProfile,
  SunZonePlants,
} from './types'

/** Default map view: Limburg (province), zoomed out */
const MAP_VIEW_LAT = 51.35
const MAP_VIEW_LON = 5.93
const MAP_VIEW_ZOOM = 9

function fmt(n: number | null, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(digits)
}

async function loadDemoFallback(): Promise<RecommendResponse | null> {
  for (const url of ['/api/demo', '/demo-maastricht.json']) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch {
      /* try next */
    }
  }
  return null
}

async function loadDemo2050Fallback(): Promise<RecommendResponse | null> {
  for (const url of ['/api/demo-2050', '/demo-maastricht-2050.json']) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
    } catch {
      /* try next */
    }
  }
  return null
}

export default function App() {
  const reportRef = useRef<HTMLDivElement>(null)
  const mapSectionRef = useRef<HTMLDivElement>(null)
  const mapDrawRef = useRef<MapDrawHandle>(null)

  const scrollToMap = useCallback(() => {
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  const [lang, setLang] = useState<Lang>('en')
  const [demoTrigger, setDemoTrigger] = useState(0)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const plotGenRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const buildingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buildingsRef = useRef<PlotBuilding[]>([])
  const canReRankRef = useRef(false)
  const [profile, setProfile] = useState<SiteProfile | null>(null)
  const [presentProfile, setPresentProfile] = useState<SiteProfile | null>(null)
  const [plants, setPlants] = useState<PlantRecommendation[]>([])
  const [presentPlants, setPresentPlants] = useState<PlantRecommendation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [manualShade, setManualShade] = useState(false)
  const [rankingNote, setRankingNote] = useState<string | null>(null)
  const [scenario2050, setScenario2050] = useState(false)
  const [climate2050Note, setClimate2050Note] = useState<string | null>(null)
  const [plantDiff, setPlantDiff] = useState<string | null>(null)
  const [mapLayers, setMapLayers] = useState({ radiation: true, pdok: true, ndvi: true })
  const toggleMapLayer = (key: 'radiation' | 'pdok' | 'ndvi') => {
    setMapLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const [prefs, setPrefs] = useState(defaultPrefs())
  const [polygonRing, setPolygonRing] = useState<number[][] | null>(null)
  const [bag3dNote, setBag3dNote] = useState<string | null>(null)
  const [guildNote, setGuildNote] = useState<string | null>(null)
  const [restoreRing, setRestoreRing] = useState<number[][] | null>(null)
  const [buildings, setBuildings] = useState<PlotBuilding[]>([])
  buildingsRef.current = buildings
  const [initialBuildings, setInitialBuildings] = useState<PlotBuilding[] | null>(null)
  const [sunGrid, setSunGrid] = useState<SunGridResult | null>(null)
  const [zonePlants, setZonePlants] = useState<SunZonePlants[]>([])
  const [selectedPlant, setSelectedPlant] = useState<PlantRecommendation | null>(null)

  const beginPlotSession = () => {
    plotGenRef.current += 1
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    return { gen: plotGenRef.current, signal: ac.signal }
  }

  const isStale = (gen: number) => gen !== plotGenRef.current

  const applyShade = useCallback(
    (p: SiteProfile): SiteProfile => {
      if (!manualShade) return p
      return { ...p, sun_class: 'shade', manual_shade: true }
    },
    [manualShade],
  )

  const runSunGridWorker = useCallback(
    (
      climateProfile: SiteProfile,
      ring: number[][],
      blds: PlotBuilding[],
    ): Promise<SunGridResult | null> => {
      const { fraction, label } = clearSkyFractionFromProfile(
        climateProfile.sun_hours_per_day,
        climateProfile.sun_hours_archive ?? null,
      )
      return new Promise((resolve) => {
        const worker = new Worker(new URL('./shadow/sunGrid.worker.ts', import.meta.url), {
          type: 'module',
        })
        worker.postMessage({
          polygonRing: ring,
          originLat: climateProfile.lat,
          originLon: climateProfile.lon,
          buildings: blds,
          clearSkyFraction: fraction,
        })
        worker.onmessage = (ev: MessageEvent<SunGridResult>) => {
          worker.terminate()
          resolve({ ...ev.data, label: `${ev.data.label}; ${label}` })
        }
        worker.onerror = () => {
          worker.terminate()
          resolve(null)
        }
      })
    },
    [],
  )

  const finishPlotPipeline = useCallback(
    async (
      gen: number,
      signal: AbortSignal,
      climateProfile: SiteProfile,
      ring: number[][] | null,
      blds: PlotBuilding[],
      opts?: {
        saveAsDemo?: boolean
        saveAsDemo2050?: boolean
      },
    ): Promise<RecommendResponse | null> => {
      let siteProfile = climateProfile
      let zoneHours: Record<string, number> | undefined

      if (ring?.length) {
        setBusyLabel('Computing sun grid (estimate)…')
        const grid =
          (await runSunGridWorker(climateProfile, ring, blds)) ??
          computeSunGrid({
            polygonRing: ring,
            originLat: climateProfile.lat,
            originLon: climateProfile.lon,
            buildings: blds,
            clearSkyFraction: clearSkyFractionFromProfile(
              climateProfile.sun_hours_per_day,
              climateProfile.sun_hours_archive ?? null,
            ).fraction,
          })
        if (isStale(gen) || signal.aborted) return null
        setSunGrid(grid)
        const summaries = zoneHoursSummary(grid.cells)
        zoneHours = Object.fromEntries(
          summaries.filter((s) => s.hours != null).map((s) => [s.zone, s.hours as number]),
        )
        const dominant = summaries.sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0))[0]
        const domHours = dominant?.hours ?? climateProfile.sun_hours_per_day
        siteProfile = {
          ...climateProfile,
          sun_hours_per_day: domHours,
          sun_class: sunClass(domHours),
          sun_class_source: grid.label,
        }
        setProfile(siteProfile)
      }

      setBusyLabel('Soil, climate context, and plant ranking…')
      let enriched = siteProfile
      try {
        const enrichRes = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteProfile }),
          signal,
        })
        if (enrichRes.ok) {
          const data = await enrichRes.json()
          enriched = data.siteProfile
        }
      } catch (e) {
        if (signal.aborted) return null
      }
      if (isStale(gen) || signal.aborted) return null

      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            siteProfile: applyShade(enriched),
            saveAsDemo: opts?.saveAsDemo,
            saveAsDemo2050: opts?.saveAsDemo2050,
            lang,
            prefs,
            zoneHours,
          }),
        })
        if (!res.ok) throw new Error(`recommend_${res.status}`)
        const data: RecommendResponse = await res.json()
        if (isStale(gen) || signal.aborted) return null
        setProfile(data.siteProfile)
        setPlants(data.plants)
        setZonePlants(data.zonePlants ?? [])
        canReRankRef.current = true
        if (!scenario2050) {
          setPresentProfile(data.siteProfile)
          setPresentPlants(data.plants)
        }
        setRankingNote(
          data.usedLlm
            ? data.rankingSource === 'llm_rephrase_only'
              ? 'LLM rephrase only (facts from EcoCrop rules)'
              : 'Ranked with LLM'
            : `Rule-based EcoCrop shortlist (${data.rankingSource ?? 'fallback'})`,
        )
        if (data.fallback) setError('Live ranking failed — showing cached demo results.')
        return data
      } catch (e) {
        if (signal.aborted) return null
        const demo = scenario2050 ? await loadDemo2050Fallback() : await loadDemoFallback()
        if (demo && !isStale(gen)) {
          setProfile(demo.siteProfile)
          setPlants(demo.plants)
          setError('Could not reach API — showing cached demo.')
          setRankingNote('Cached demo fallback')
        } else if (!isStale(gen)) {
          setError(String((e as Error).message || e))
        }
        return null
      } finally {
        if (!isStale(gen)) setBusyLabel(null)
      }
    },
    [applyShade, lang, prefs, runSunGridWorker, scenario2050],
  )

  const finishPlotPipelineRef = useRef(finishPlotPipeline)
  finishPlotPipelineRef.current = finishPlotPipeline

  const clearApp = useCallback(() => {
    abortRef.current?.abort()
    plotGenRef.current += 1
    setBusyLabel(null)
    setProfile(null)
    setPresentProfile(null)
    setPlants([])
    setPresentPlants([])
    setError(null)
    setRankingNote(null)
    setScenario2050(false)
    setClimate2050Note(null)
    setPlantDiff(null)
    setPolygonRing(null)
    setRestoreRing(null)
    setBuildings([])
    setInitialBuildings(null)
    setSunGrid(null)
    setZonePlants([])
    setGuildNote(null)
    setBag3dNote(null)
    setSelectedPlant(null)
    setManualShade(false)
    canReRankRef.current = false
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const handlePlotRemoved = useCallback(() => {
    abortRef.current?.abort()
    plotGenRef.current += 1
    setBusyLabel(null)
    setPolygonRing(null)
    setPlants([])
    setPresentPlants([])
    setZonePlants([])
    setSunGrid(null)
    setProfile(null)
    setPresentProfile(null)
    setRankingNote(null)
    setSelectedPlant(null)
    setError(null)
    setScenario2050(false)
    setClimate2050Note(null)
    setPlantDiff(null)
    canReRankRef.current = false
  }, [])

  const handlePlot = useCallback(
    async (sel: PlotSelection & { polygon?: number[][] }) => {
      const { gen, signal } = beginPlotSession()
      const ring = sel.polygon?.length ? sel.polygon : polygonRing
      if (sel.polygon?.length) setPolygonRing(sel.polygon)
      setError(null)
      setPlants([])
      setRankingNote(null)
      setScenario2050(false)
      setClimate2050Note(null)
      setPlantDiff(null)
      setBusyLabel('Loading climate (Open-Meteo)…')
      try {
        const { profile: climateProfile } = await fetchClimateProfile(
          sel.lat,
          sel.lon,
          sel.area_m2,
        )
        if (isStale(gen) || signal.aborted) return
        setProfile(climateProfile)
        setPresentProfile(climateProfile)
        const bag = await fetch(`/api/bag3d?lat=${sel.lat}&lon=${sel.lon}`, { signal })
          .then((r) => r.json())
          .catch(() => null)
        if (isStale(gen)) return
        if (bag?.ok) {
          setBag3dNote(
            `3DBAG: ${bag.buildings.length} buildings in 100 m (measured, ${bag.fetched_at})`,
          )
        } else setBag3dNote('3DBAG: no data here for this buffer')
        const rec = await finishPlotPipeline(gen, signal, climateProfile, ring, buildingsRef.current)
        if (rec?.siteProfile && !isStale(gen)) {
          const g = await fetch('/api/guild', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteProfile: rec.siteProfile, prefs }),
            signal,
          })
            .then((r) => r.json())
            .catch(() => null)
          if (g?.plants?.length) {
            setGuildNote(
              `Guild (estimate): ${g.plants.slice(0, 6).join(', ')}${g.warn ? ` — ${g.warn}` : ''}`,
            )
          }
        }
      } catch (e) {
        if (signal.aborted) return
        setBusyLabel(null)
        const demo = await loadDemoFallback()
        if (demo && !isStale(gen)) {
          setProfile(demo.siteProfile)
          setPresentProfile(demo.siteProfile)
          setPlants(demo.plants)
          setPresentPlants(demo.plants)
          setError('Climate fetch failed — showing cached Maastricht demo.')
        } else if (!isStale(gen)) {
          setError(String((e as Error).message || e))
        }
      }
    },
    [finishPlotPipeline, polygonRing, prefs],
  )

  const profileForShadowRef = useRef(profile)
  const ringForShadowRef = useRef(polygonRing)
  profileForShadowRef.current = profile
  ringForShadowRef.current = polygonRing

  useEffect(() => {
    const p = profileForShadowRef.current
    const ring = ringForShadowRef.current
    if (!p || !ring?.length) return
    if (buildingsDebounceRef.current) clearTimeout(buildingsDebounceRef.current)
    buildingsDebounceRef.current = setTimeout(() => {
      const { gen, signal } = beginPlotSession()
      void finishPlotPipelineRef.current(gen, signal, p, ring, buildings)
    }, 400)
    return () => {
      if (buildingsDebounceRef.current) clearTimeout(buildingsDebounceRef.current)
    }
  }, [buildings])

  useEffect(() => {
    if (!canReRankRef.current) return
    const p = profileForShadowRef.current
    const ring = ringForShadowRef.current
    if (!p) return
    if (prefsDebounceRef.current) clearTimeout(prefsDebounceRef.current)
    prefsDebounceRef.current = setTimeout(() => {
      const { gen, signal } = beginPlotSession()
      setBusyLabel('Updating recommendations…')
      void finishPlotPipelineRef.current(gen, signal, p, ring, buildingsRef.current).finally(
        () => {
          if (!isStale(gen)) setBusyLabel(null)
        },
      )
    }, 350)
    return () => {
      if (prefsDebounceRef.current) clearTimeout(prefsDebounceRef.current)
    }
  }, [prefs, lang])

  const loadDemo = async () => {
    const { gen, signal } = beginPlotSession()
    setDemoTrigger((n) => n + 1)
    setError(null)
    setScenario2050(false)
    setBusyLabel('Loading climate (Open-Meteo)…')
    try {
      const { profile: climateProfile } = await fetchClimateProfile(
        DEMO_LAT,
        DEMO_LON,
        DEMO_AREA_M2,
      )
      if (isStale(gen)) return
      setProfile(climateProfile)
      setPresentProfile(climateProfile)
      const ring = polygonRing ?? demoPlotRing()
      setPolygonRing(ring)
      await finishPlotPipeline(gen, signal, climateProfile, ring, buildings, {
        saveAsDemo: true,
      })
    } catch {
      if (isStale(gen)) return
      const demo = await loadDemoFallback()
      if (demo) {
        setProfile(demo.siteProfile)
        setPresentProfile(demo.siteProfile)
        setPlants(demo.plants)
        setPresentPlants(demo.plants)
        setError('Using cached demo after partial failure.')
      }
      setBusyLabel(null)
    }
  }

  const toggle2050 = async (on: boolean) => {
    setScenario2050(on)
    if (!on && presentProfile) {
      setProfile(presentProfile)
      setPlants(presentPlants)
      setClimate2050Note(null)
      setPlantDiff(null)
      return
    }
    const base = presentProfile ?? profile
    if (!base) return
    const { gen, signal } = beginPlotSession()
    setBusyLabel('Loading 2050 climate scenario…')
    try {
      const { profile: p2050, deltaNote } = await fetchClimate2050Profile(base)
      if (isStale(gen)) return
      setClimate2050Note(`${t(lang, 'resilient')}: ${deltaNote}`)
      const rec = await finishPlotPipeline(gen, signal, p2050, polygonRing, buildings, {
        saveAsDemo2050: true,
      })
      if (rec) {
        const before = new Set(presentPlants.map((p) => p.name))
        const after = new Set(rec.plants.map((p) => p.name))
        const dropped = [...before].filter((n) => !after.has(n))
        const gained = [...after].filter((n) => !before.has(n))
        setPlantDiff(
          `Dropped: ${dropped.slice(0, 3).join(', ') || 'none'} · Newly viable: ${gained.slice(0, 3).join(', ') || 'none'}`,
        )
      }
    } catch {
      setBusyLabel(null)
      const demo = await loadDemo2050Fallback()
      if (demo) {
        setProfile(demo.siteProfile)
        setPlants(demo.plants)
        setClimate2050Note(t(lang, 'resilient') + ' (cached demo)')
      }
    }
  }

  useEffect(() => {
    const shared = readShareFromUrl()
    if (shared?.prefs) setPrefs(shared.prefs)
    if (shared?.polygon) {
      setPolygonRing(shared.polygon)
      setRestoreRing(shared.polygon)
    }
    if (shared?.buildings?.length) {
      setBuildings(shared.buildings)
      setInitialBuildings(shared.buildings)
    }
    if (shared?.demo) void loadDemo()
  }, [])

  const sharePayload: SharePayload | null = profile
    ? {
        lat: profile.lat,
        lon: profile.lon,
        polygon: polygonRing ?? undefined,
        buildings: buildings.length ? buildings : undefined,
        prefs,
        demo: false,
      }
    : null

  const plotScore = profile ? computePlotScore(profile) : null

  return (
    <div className="demo-page">
      <div className="demo-shell" ref={reportRef}>
        <header className="demo-header-card">
          <div className="demo-header-top">
            <a className="demo-brand" href="/">
              <img src="/brand-mark.svg" alt="" width={36} height={36} />
              <span>{t(lang, 'title')}</span>
            </a>
            <div className="demo-header-actions">
              <div className="lang-row">
                {(['en', 'nl', 'fr', 'de'] as Lang[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={l === lang ? '' : 'secondary'}
                    onClick={() => setLang(l)}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <span className="demo-badge">{t(lang, 'demoBadge')}</span>
            </div>
          </div>
          <h1 className="demo-hero">
            {t(lang, 'heroHead')} <em>{t(lang, 'heroEm')}</em>
          </h1>
          <p className="demo-hero-sub">{t(lang, 'subtitle')}</p>
          <ul className="demo-hero-trust" aria-label={t(lang, 'footerOpenData')}>
            <li>{t(lang, 'trustFree')}</li>
            <li>{t(lang, 'trustData')}</li>
            <li>{t(lang, 'trustLocal')}</li>
          </ul>
          <div className="demo-hero-cta">
            <button
              type="button"
              className="hero-cta-primary"
              onClick={() => {
                scrollToMap()
                window.setTimeout(() => mapDrawRef.current?.startPlotDraw(), 320)
              }}
            >
              {t(lang, 'heroCtaDraw')}
            </button>
            <button
              type="button"
              className="hero-cta-secondary"
              onClick={() => {
                scrollToMap()
                void loadDemo()
              }}
            >
              {t(lang, 'heroCtaDemo')}
            </button>
          </div>
        </header>

        <div className="demo-main-row">
          <div className="demo-col-map" ref={mapSectionRef} id="map-section">
            <p className="demo-section-label">{t(lang, 'sectionMap')}</p>
            <div className="demo-map-panel">
              <div className="demo-map-toolbar">
                <button
                  type="button"
                  className="draw-bed-btn"
                  onClick={() => mapDrawRef.current?.startPlotDraw()}
                >
                  {t(lang, 'drawBedButton')}
                </button>
                <button type="button" onClick={() => void loadDemo()}>{t(lang, 'loadDemo')}</button>
                <button type="button" className="secondary" onClick={clearApp}>
                  {t(lang, 'clear')}
                </button>
                <label className="scenario-inline">
                  <input
                    type="checkbox"
                    checked={scenario2050}
                    onChange={(e) => void toggle2050(e.target.checked)}
                  />
                  {t(lang, 'climate2050')}
                </label>
              </div>
              {!profile ? (
                <aside className="map-draw-guide" aria-labelledby="draw-guide-title">
                  <h3 id="draw-guide-title">{t(lang, 'drawBedTitle')}</h3>
                  <ol className="map-draw-steps">
                    <li>{t(lang, 'drawBedStep1')}</li>
                    <li>{t(lang, 'drawBedStep2')}</li>
                    <li>{t(lang, 'drawBedStep3')}</li>
                  </ol>
                  <p className="map-draw-guide-demo">{t(lang, 'drawBedDemo')}</p>
                </aside>
              ) : (
                <p className="map-draw-done meta">{t(lang, 'drawBedDone')}</p>
              )}
              <div className="map-panel">
                <MapDraw
                  ref={mapDrawRef}
                  onSelect={handlePlot}
                  viewLat={MAP_VIEW_LAT}
                  viewLon={MAP_VIEW_LON}
                  viewZoom={MAP_VIEW_ZOOM}
                  demoLat={DEMO_LAT}
                  demoLon={DEMO_LON}
                  triggerDemo={demoTrigger}
                  initialRing={restoreRing}
                  initialBuildings={initialBuildings}
                  onBuildingsChange={setBuildings}
                  onPlotRemoved={handlePlotRemoved}
                  radiationMj={profile?.radiation_mj ?? null}
                  layers={mapLayers}
                  lang={lang}
                />
                <div
                  className="map-overlay-legend"
                  role="group"
                  aria-label={t(lang, 'layers')}
                >
                  {(
                    [
                      ['radiation', 'layerRadiation'],
                      ['pdok', 'layerPdok'],
                      ['ndvi', 'layerNdvi'],
                    ] as const
                  ).map(([key, labelKey]) => (
                    <button
                      key={key}
                      type="button"
                      className={mapLayers[key] ? 'on' : ''}
                      aria-pressed={mapLayers[key]}
                      onClick={() => toggleMapLayer(key)}
                    >
                      {t(lang, labelKey)}
                    </button>
                  ))}
                  <span
                    className={`map-legend-hint${buildings.length > 0 ? ' on' : ''}`}
                    title={t(lang, 'mapBuildingHint')}
                  >
                    {t(lang, 'buildingsLegend')}
                  </span>
                </div>
              </div>
              {(busyLabel || error) && (
                <p className="demo-map-status" aria-live="polite">
                  {busyLabel && <><span className="spinner" /> {busyLabel}</>}
                  {error && <span className="error-banner">{error}</span>}
                </p>
              )}
            </div>
          </div>

          <div className="demo-col-side">
            <p className="demo-section-label">{t(lang, 'sectionGoals')}</p>
            <div className="demo-goals-panel">
              <UserGoals prefs={prefs} onChange={setPrefs} lang={lang} />
              <p className="goals-effort-note">{effortHoursLabel(prefs)}</p>
              <p className="goals-lead">{t(lang, 'goalsLead')}</p>
            </div>

            {profile && plants.length > 0 && (
              <WaterSavingCard profile={profile} plants={plants} lang={lang} />
            )}

            {zonePlants.length > 0 && (
              <div className="card zone-summary demo-site-panel">
                <h2>{t(lang, 'zoneSun')} <span className="estimate-tag">{t(lang, 'estimate')}</span></h2>
                {zonePlants.map((z) => (
                  <div key={z.zone}>
                    <p className="meta">
                      <strong>{z.zone}</strong> ~{fmt(z.sun_hours, 1)} {t(lang, 'zoneHoursDay')}
                    </p>
                    <p>{z.plants.map((p) => p.name).join(', ')}</p>
                  </div>
                ))}
              </div>
            )}

          </div>

          <section
            className="demo-plants-row"
            aria-labelledby={profile && plants.length > 0 ? 'plants-heading' : 'plants-section-heading'}
          >
            <div className="demo-plants-panel">
              {profile && plants.length > 0 && (
                <p className="demo-results-banner" role="status">
                  {tFormat(lang, 'resultsReady', { count: plants.length })}
                </p>
              )}
              <p className="demo-section-label demo-section-label-invert">{t(lang, 'sectionResults')}</p>
              {profile && plotScore && (
                <section className="demo-site-panel card site-with-score">
                  <div className="demo-site-head">
                    <h2>{t(lang, 'siteProfile')}</h2>
                    <span className="meta">{profile.climate_period ?? '1991–2020'}</span>
                  </div>
                  <div className="site-score-layout">
                    <PlotScoreHero profile={profile} lang={lang} embedded />
                    <div className="demo-stat-grid">
                      <div>
                        <p className="stat-label">{t(lang, 'statSun')}</p>
                        <p className="stat-value">{fmt(profile.sun_hours_per_day, 1)} h/day</p>
                        <p className="stat-note">{profile.sun_class} · {t(lang, 'estimate')}</p>
                      </div>
                      <div>
                        <p className="stat-label">{t(lang, 'statRain')}</p>
                        <p className="stat-value">{fmt(profile.rain_mm_year, 0)} mm/yr</p>
                        <p className="stat-note">{t(lang, 'modeled')}</p>
                      </div>
                      <div>
                        <p className="stat-label">{t(lang, 'statTemp')}</p>
                        <p className="stat-value">{fmt(profile.temp_growing_season, 1)} °C</p>
                        <p className="stat-note">{t(lang, 'modeled')}</p>
                      </div>
                      <div>
                        <p className="stat-label">{t(lang, 'statSoil')}</p>
                        <p className="stat-value">{fmt(profile.soil_ph, 1)} pH</p>
                        <p className="stat-note">
                          {profile.soil_type_nl ??
                            (profile.pdok_unavailable ? t(lang, 'noNlSoil') : profile.texture_class)}
                        </p>
                      </div>
                      <div>
                        <p className="stat-label">{t(lang, 'statBed')}</p>
                        <p className="stat-value">{fmt(profile.area_m2, 0)} m²</p>
                        <p className="stat-note">
                          {fmt(profile.lat, 4)}°, {fmt(profile.lon, 4)}°
                        </p>
                      </div>
                    </div>
                  </div>
                  {climate2050Note && <p className="meta note">{climate2050Note}</p>}
                  {plantDiff && scenario2050 && <p className="meta">{plantDiff}</p>}
                </section>
              )}
              {profile && plants.length > 0 ? (
                <RecommendedPlantsSection
                  profile={profile}
                  plants={plants}
                  lang={lang}
                  rankingNote={rankingNote}
                  prefs={prefs}
                  onSelectPlant={setSelectedPlant}
                />
              ) : (
                <>
                  <h2 id="plants-section-heading" className="demo-plants-title">
                    {t(lang, 'recommended')}
                  </h2>
                  <p className="demo-plants-empty">{t(lang, 'noPlantsYet')}</p>
                </>
              )}
            </div>
          </section>

          <div className={`demo-share-row${sharePayload ? ' demo-share-row-ready' : ''}`}>
            <ShareExport sharePayload={sharePayload} lang={lang} reportRef={reportRef} prominent={!!sharePayload} />
          </div>

          <div className="demo-secondary">
            <details className="demo-advanced map-tools">
              <summary>{t(lang, 'mapLayersShade')}</summary>
              <LayerToggles lang={lang} layers={mapLayers} setLayers={setMapLayers} />
              {bag3dNote && <p className="meta note">{bag3dNote}</p>}
              <p className="meta note">{t(lang, 'mapBuildingHint')}</p>
              {buildings.length > 0 && (
                <div className="buildings-list">
                  <h3>{t(lang, 'buildingsHeights')}</h3>
                  {buildings.map((b) => (
                    <label key={b.id} className="status-row">
                      {b.id.slice(0, 8)}… {t(lang, 'heightM')}
                      <input
                        type="number"
                        min={3}
                        max={80}
                        value={b.height_m}
                        onChange={(e) =>
                          setBuildings((prev) =>
                            prev.map((x) =>
                              x.id === b.id ? { ...x, height_m: Number(e.target.value) } : x,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              <SunHeatmapCard grid={sunGrid} lang={lang} />
              {guildNote && <p className="meta note">{guildNote}</p>}
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={manualShade}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setManualShade(checked)
                    if (!profile) return
                    const adjusted: SiteProfile = {
                      ...profile,
                      manual_shade: checked,
                      sun_class: checked ? 'shade' : sunClass(profile.sun_hours_per_day),
                    }
                    setProfile(adjusted)
                    const { gen, signal } = beginPlotSession()
                    setBusyLabel('Updating recommendations…')
                    void finishPlotPipeline(gen, signal, adjusted, polygonRing, buildings).finally(
                      () => setBusyLabel(null),
                    )
                  }}
                />
                {t(lang, 'shade')}
              </label>
            </details>

            {profile && (
              <>
                <FungiPanel
                  scientificName={selectedPlant?.name ?? plants[0]?.name ?? null}
                  urban={profile?.site_context?.class === 'urban'}
                />
                <WhyNotPanel profile={profile} />
              </>
            )}

            {profile ? (
              <section className="demo-site-panel card site-profile-full" aria-labelledby="site-full-heading">
                <div className="demo-site-head">
                  <h2 id="site-full-heading">
                    {t(lang, 'siteProfile')} · {t(lang, 'siteProfileMore')}
                  </h2>
                  <span className="meta">{profile.climate_period ?? '1991–2020'}</span>
                </div>
                <div className="site-dl-wrap">
                  <dl className="site-dl">
                    <dt>Centroid</dt>
                    <dd>{fmt(profile.lat, 4)}°, {fmt(profile.lon, 4)}°</dd>
                    <dt>Area</dt>
                    <dd>{fmt(profile.area_m2, 0)} m²</dd>
                    <dt>Sun (est.)</dt>
                    <dd>
                      {fmt(profile.sun_hours_per_day, 1)} h/day → <strong>{profile.sun_class}</strong>
                    </dd>
                    <dt>Radiation</dt>
                    <dd>{fmt(profile.radiation_mj, 2)} MJ/m²/day</dd>
                    <dt>Rain</dt>
                    <dd>
                      {fmt(profile.rain_mm_year, 0)} mm/yr ({profile.climate_period ?? 'multi-year'})
                    </dd>
                    <dt>Growing-season temp</dt>
                    <dd>{fmt(profile.temp_growing_season, 1)} °C</dd>
                    {profile.frost_gdd && (
                      <>
                        <dt>Frost days / yr (median)</dt>
                        <dd>
                          {profile.frost_gdd.frost_days_median ?? '—'} ({profile.frost_gdd.source},{' '}
                          {profile.frost_gdd.data_kind})
                        </dd>
                        <dt>GDD base 5°C (Apr–Sep sum)</dt>
                        <dd>{profile.frost_gdd.gdd_base5_growing ?? '—'}</dd>
                      </>
                    )}
                    {profile.climate_2050_delta && (
                      <>
                        <dt>2050 delta</dt>
                        <dd className="site-dl-note">{profile.climate_2050_delta.note}</dd>
                      </>
                    )}
                    <dt>Soil pH</dt>
                    <dd>{fmt(profile.soil_ph, 1)}</dd>
                    {profile.soil_resolution_note && (
                      <>
                        <dt>Soil source</dt>
                        <dd className="site-dl-note">{profile.soil_resolution_note}</dd>
                      </>
                    )}
                    <dt>Clay / sand</dt>
                    <dd>{fmt(profile.clay_pct, 0)}% / {fmt(profile.sand_pct, 0)}%</dd>
                    <dt>NL grondsoort</dt>
                    <dd>
                      {profile.soil_type_nl ??
                        (profile.pdok_unavailable ? t(lang, 'noNlSoil') : '—')}
                    </dd>
                    {profile.site_context && (
                      <>
                        <dt>Urban context</dt>
                        <dd>
                          {profile.site_context.class}: {profile.site_context.buildingCount100m}{' '}
                          buildings / 100 m (~{Math.round(profile.site_context.builtUpFraction * 100)}%
                          proxy, 3DBAG)
                        </dd>
                        {profile.site_context.uhi_note && (
                          <dd className="site-dl-note site-dl-note-indented">
                            {profile.site_context.uhi_note}
                          </dd>
                        )}
                      </>
                    )}
                  </dl>
                  <p className="site-sources meta">
                    Sources: {profile.sources.join(' · ')}
                  </p>
                  <p className="honesty site-profile-full-honesty">{t(lang, 'honesty')}</p>
                </div>
              </section>
            ) : (
              <p className="demo-secondary-hint meta">{t(lang, 'drawPlotHint')}</p>
            )}
          </div>
        </div>

        {!profile && (
          <div className="demo-mobile-cta" role="region" aria-label={t(lang, 'heroCtaDraw')}>
            <button
              type="button"
              className="draw-bed-btn"
              onClick={() => {
                scrollToMap()
                window.setTimeout(() => mapDrawRef.current?.startPlotDraw(), 320)
              }}
            >
              {t(lang, 'drawBedButton')}
            </button>
          </div>
        )}

        <footer className="demo-footer">
          <span>{t(lang, 'footerLine')}</span>
          <span>{t(lang, 'footerOpenData')}</span>
        </footer>
      </div>
    </div>
  )
}
