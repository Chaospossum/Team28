import { useCallback, useEffect, useRef, useState } from 'react'
import { computeSunGrid } from './shadow/gridCore'
import './App.css'
import { fetchClimate2050Profile } from './climate2050'
import { fetchClimateProfile, sunClass } from './climate'
import type { Lang } from './i18n'
import { t } from './i18n'
import { MapDraw, type PlotSelection } from './MapDraw'
import {
  LayerToggles,
  PlotScoreHero,
  RecommendedPlantsSection,
  ShareExport,
  SunHeatmapCard,
  WaterSavingCard,
  zoneHoursSummary,
} from './Phase5UI'
import { readShareFromUrl } from './share'
import { defaultPrefs, type SharePayload } from './shareState'
import { effortHoursLabel } from './effort'
import { UserGoals } from './UserGoals'
import { FungiPanel } from './FungiPanel'
import { WhyNotPanel } from './WhyNotPanel'
import { clearSkyFractionFromProfile } from './shadow/clearSky'
import type { SunGridResult } from './shadow/gridCore'
import type {
  PlotBuilding,
  PlantRecommendation,
  RecommendResponse,
  SiteProfile,
  SunZonePlants,
} from './types'

const DEMO_LAT = 50.85
const DEMO_LON = 5.69

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
  const reportRef = useRef<HTMLElement>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [demoTrigger, setDemoTrigger] = useState(0)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const plotGenRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const buildingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const [mapLayers, setMapLayers] = useState({ radiation: true, pdok: false, ndvi: false })
  const [prefs, setPrefs] = useState(defaultPrefs())
  const [polygonRing, setPolygonRing] = useState<number[][] | null>(null)
  const [bag3dNote, setBag3dNote] = useState<string | null>(null)
  const [guildNote, setGuildNote] = useState<string | null>(null)
  const [restoreRing, setRestoreRing] = useState<number[][] | null>(null)
  const [buildings, setBuildings] = useState<PlotBuilding[]>([])
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
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  const handlePlot = useCallback(
    async (sel: PlotSelection & { polygon?: number[][] }) => {
      const { gen, signal } = beginPlotSession()
      const ring = sel.polygon ?? polygonRing
      if (sel.polygon) setPolygonRing(sel.polygon)
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
        const rec = await finishPlotPipeline(gen, signal, climateProfile, ring, buildings)
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
    [buildings, finishPlotPipeline, polygonRing, prefs],
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
      void finishPlotPipeline(gen, signal, p, ring, buildings)
    }, 400)
    return () => {
      if (buildingsDebounceRef.current) clearTimeout(buildingsDebounceRef.current)
    }
  }, [buildings, finishPlotPipeline])

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
        12000,
      )
      if (isStale(gen)) return
      setProfile(climateProfile)
      setPresentProfile(climateProfile)
      const ring = polygonRing ?? [
        [DEMO_LON - 0.0012, DEMO_LAT - 0.00084],
        [DEMO_LON + 0.0012, DEMO_LAT - 0.00072],
        [DEMO_LON + 0.00108, DEMO_LAT + 0.00096],
        [DEMO_LON - 0.00096, DEMO_LAT + 0.00084],
        [DEMO_LON - 0.0012, DEMO_LAT - 0.00084],
      ]
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

  return (
    <div className="app">
      <div className="map-panel">
        <MapDraw
          onSelect={handlePlot}
          demoLat={DEMO_LAT}
          demoLon={DEMO_LON}
          triggerDemo={demoTrigger}
          initialRing={restoreRing}
          initialBuildings={initialBuildings}
          onBuildingsChange={setBuildings}
          radiationMj={profile?.radiation_mj ?? null}
          layers={mapLayers}
          lang={lang}
        />
        <div className="map-overlay-legend" aria-hidden="true">
          <span className={mapLayers.radiation ? 'on' : ''}>{t(lang, 'layerRadiation')}</span>
          <span className={mapLayers.pdok ? 'on' : ''}>{t(lang, 'layerPdok')}</span>
          <span className={buildings.length > 0 ? 'on' : ''}>{t(lang, 'buildingsLegend')}</span>
        </div>
      </div>
      <aside className="sidebar sidebar-plot-first" ref={reportRef}>
        <div className="lang-row">
          {(['en', 'nl', 'fr', 'de'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              className={l === lang ? '' : 'secondary lang-btn'}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <h1>{t(lang, 'title')}</h1>
        <p className="subtitle">{t(lang, 'subtitle')}</p>

        <div className="toolbar">
          <button type="button" onClick={() => void loadDemo()}>{t(lang, 'loadDemo')}</button>
          <button type="button" className="secondary" onClick={clearApp}>
            {t(lang, 'clear')}
          </button>
        </div>

        {busyLabel && (
          <p className="meta note loading-honest" aria-live="polite">
            <span className="spinner" /> {busyLabel}
          </p>
        )}

        {error && <div className="error-banner">{error}</div>}

        {profile && <PlotScoreHero profile={profile} lang={lang} />}

        {profile && plants.length > 0 && (
          <RecommendedPlantsSection
            profile={profile}
            plants={plants}
            lang={lang}
            rankingNote={rankingNote}
            prefs={prefs}
            onSelectPlant={setSelectedPlant}
          />
        )}

        {profile && plants.length > 0 && (
          <WaterSavingCard profile={profile} plants={plants} lang={lang} />
        )}

        {zonePlants.length > 0 && (
          <div className="card zone-summary">
            <h2>{t(lang, 'zoneSun')} <span className="estimate-tag">{t(lang, 'estimate')}</span></h2>
            {zonePlants.map((z) => (
              <div key={z.zone}>
                <p className="meta">
                  <strong>{z.zone}</strong> ~{fmt(z.sun_hours, 1)} h/day effective
                </p>
                <p>{z.plants.map((p) => p.name).join(', ')}</p>
              </div>
            ))}
          </div>
        )}

        <details className="card site-details">
          <summary>{t(lang, 'siteProfile')}</summary>
          {!profile && <p className="meta">{t(lang, 'drawPlotHint')}</p>}
          {profile && (
            <div className="site-dl-wrap">
              <dl>
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
                    <dd className="meta">{profile.climate_2050_delta.note}</dd>
                  </>
                )}
                <dt>Soil pH</dt>
                <dd>{fmt(profile.soil_ph, 1)}</dd>
                {profile.soil_resolution_note && (
                  <>
                    <dt>Soil source</dt>
                    <dd className="meta">{profile.soil_resolution_note}</dd>
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
                      {profile.site_context.class}: {profile.site_context.buildingCount100m} buildings
                      / 100 m (~{Math.round(profile.site_context.builtUpFraction * 100)}% proxy, 3DBAG)
                    </dd>
                    {profile.site_context.uhi_note && (
                      <dd className="meta">{profile.site_context.uhi_note}</dd>
                    )}
                  </>
                )}
              </dl>
              <p className="meta">Sources: {profile.sources.join(' · ')}</p>
            </div>
          )}
        </details>

        <details className="card map-tools">
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

        <details className="card goals-details">
          <summary>{t(lang, 'yourGoals')}</summary>
          <UserGoals prefs={prefs} onChange={setPrefs} lang={lang} />
          <p className="meta note">{effortHoursLabel(prefs)}</p>
        </details>

        <label className="toggle-row scenario-row">
          <input
            type="checkbox"
            checked={scenario2050}
            onChange={(e) => void toggle2050(e.target.checked)}
          />
          {t(lang, 'climate2050')} <span className="estimate-tag">{t(lang, 'estimate')}</span>
        </label>
        {climate2050Note && <p className="meta note">{climate2050Note}</p>}
        {plantDiff && scenario2050 && <p className="meta">{plantDiff}</p>}

        <FungiPanel
          scientificName={selectedPlant?.name ?? plants[0]?.name ?? null}
          urban={profile?.site_context?.class === 'urban'}
        />

        {profile && <WhyNotPanel profile={profile} />}

        <ShareExport sharePayload={sharePayload} lang={lang} reportRef={reportRef} />

        <p className="honesty">{t(lang, 'honesty')}</p>
      </aside>
    </div>
  )
}
