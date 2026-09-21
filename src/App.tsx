import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { fetchClimate2050Profile } from './climate2050'
import { fetchClimateProfile, sunClass } from './climate'
import type { Lang } from './i18n'
import { t } from './i18n'
import { MapDraw, type PlotSelection } from './MapDraw'
import {
  ExplainBars,
  LayerToggles,
  PlantCalendarStrip,
  PlotScoreHero,
  ShareExport,
  WaterSavingCard,
} from './Phase5UI'
import { readShareFromUrl } from './share'
import { defaultPrefs, type SharePayload } from './shareState'
import { effortHoursLabel } from './effort'
import { UserGoals } from './UserGoals'
import { FungiPanel } from './FungiPanel'
import { SunHeatmap, zoneHoursSummary } from './SunHeatmap'
import { WhyNotPanel } from './WhyNotPanel'
import { clearSkyFractionFromProfile } from './shadow/clearSky'
import type { SunGridResult } from './shadow/gridCore'
import type {
  LoadingKey,
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
  const [loading, setLoading] = useState<Record<LoadingKey, boolean>>({
    climate: false,
    soil: false,
    pdok: false,
    plants: false,
  })
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

  const setLoad = (key: LoadingKey, on: boolean) =>
    setLoading((prev) => ({ ...prev, [key]: on }))

  const applyShade = useCallback(
    (p: SiteProfile): SiteProfile => {
      if (!manualShade) return p
      return { ...p, sun_class: 'shade', manual_shade: true }
    },
    [manualShade],
  )

  const runRecommend = useCallback(
    async (
      siteProfile: SiteProfile,
      opts?: {
        saveAsDemo?: boolean
        saveAsDemo2050?: boolean
        zoneHours?: Record<string, number>
      },
    ): Promise<RecommendResponse | null> => {
      setLoad('plants', true)
      try {
        const res = await fetch('/api/recommend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteProfile: applyShade(siteProfile),
          saveAsDemo: opts?.saveAsDemo,
          saveAsDemo2050: opts?.saveAsDemo2050,
          lang,
          prefs,
          zoneHours: opts?.zoneHours,
        }),
        })
        if (!res.ok) throw new Error(`recommend_${res.status}`)
        const data: RecommendResponse = await res.json()
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
        const demo = scenario2050 ? await loadDemo2050Fallback() : await loadDemoFallback()
        if (demo) {
          setProfile(demo.siteProfile)
          setPlants(demo.plants)
          setError('Could not reach API — showing cached demo.')
          setRankingNote('Cached demo fallback')
        } else {
          setError(String((e as Error).message || e))
        }
        return null
      } finally {
        setLoad('plants', false)
      }
    },
    [applyShade, lang, prefs, scenario2050],
  )

  const enrichAndRecommend = useCallback(
    async (
      base: SiteProfile,
      opts?: {
        saveAsDemo?: boolean
        saveAsDemo2050?: boolean
        zoneHours?: Record<string, number>
      },
    ) => {
      setLoad('soil', true)
      setLoad('pdok', true)
      try {
        const res = await fetch('/api/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteProfile: base }),
        })
        if (!res.ok) throw new Error(`enrich_${res.status}`)
        const data = await res.json()
        setProfile(data.siteProfile)
        setLoad('soil', false)
        setLoad('pdok', false)
        const rec = await runRecommend(data.siteProfile, opts)
        return rec
      } catch {
        setLoad('soil', false)
        setLoad('pdok', false)
        return await runRecommend(base, opts)
      }
    },
    [runRecommend],
  )

  const computeSunGridAsync = useCallback(
    (climateProfile: SiteProfile, ring: number[][] | null, blds: PlotBuilding[]) => {
      if (!ring?.length) {
        setSunGrid(null)
        return
      }
      const { fraction, label } = clearSkyFractionFromProfile(
        climateProfile.sun_hours_per_day,
        climateProfile.sun_hours_archive ?? null,
      )
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
        const grid = { ...ev.data, label: `${ev.data.label}; ${label}` }
        setSunGrid(grid)
        worker.terminate()
        const summaries = zoneHoursSummary(grid.cells)
        const zoneHours = Object.fromEntries(
          summaries.filter((s) => s.hours != null).map((s) => [s.zone, s.hours as number]),
        )
        const dominant = summaries.sort((a, b) => (b.hours ?? 0) - (a.hours ?? 0))[0]
        const domHours = dominant?.hours ?? climateProfile.sun_hours_per_day
        const patched: SiteProfile = {
          ...climateProfile,
          sun_hours_per_day: domHours,
          sun_class: sunClass(domHours),
          sun_class_source: grid.label,
        }
        setProfile((p) => (p ? { ...p, ...patched } : patched))
        void runRecommend(patched, { zoneHours })
      }
      worker.onerror = () => worker.terminate()
    },
    [runRecommend],
  )

  const handlePlot = useCallback(
    async (sel: PlotSelection & { polygon?: number[][] }) => {
      if (sel.polygon) setPolygonRing(sel.polygon)
      setError(null)
      setPlants([])
      setRankingNote(null)
      setScenario2050(false)
      setClimate2050Note(null)
      setPlantDiff(null)
      setLoad('climate', true)
      try {
        const { profile: climateProfile } = await fetchClimateProfile(
          sel.lat,
          sel.lon,
          sel.area_m2,
        )
        setProfile(climateProfile)
        setPresentProfile(climateProfile)
        setLoad('climate', false)
        const bag = await fetch(`/api/bag3d?lat=${sel.lat}&lon=${sel.lon}`).then((r) => r.json()).catch(() => null)
        if (bag?.ok) setBag3dNote(`3DBAG: ${bag.buildings.length} buildings in 100 m (measured, ${bag.fetched_at})`)
        else setBag3dNote('3DBAG: no data here for this buffer')
        const rec = await enrichAndRecommend(climateProfile)
        computeSunGridAsync(
          rec?.siteProfile ?? climateProfile,
          sel.polygon ?? polygonRing,
          buildings,
        )
        if (rec?.siteProfile) {
          const g = await fetch('/api/guild', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteProfile: rec.siteProfile, prefs }),
          }).then((r) => r.json()).catch(() => null)
          if (g?.plants?.length) {
            setGuildNote(
              `Guild (estimate): ${g.plants.slice(0, 6).join(', ')}${g.warn ? ` — ${g.warn}` : ''}`,
            )
          }
        }
      } catch (e) {
        setLoad('climate', false)
        const demo = await loadDemoFallback()
        if (demo) {
          setProfile(demo.siteProfile)
          setPresentProfile(demo.siteProfile)
          setPlants(demo.plants)
          setPresentPlants(demo.plants)
          setError('Climate fetch failed — showing cached Maastricht demo.')
        } else {
          setError(String((e as Error).message || e))
        }
      }
    },
    [buildings, computeSunGridAsync, enrichAndRecommend, polygonRing],
  )

  useEffect(() => {
    if (!profile || !polygonRing?.length) return
    computeSunGridAsync(profile, polygonRing, buildings)
  }, [buildings])

  const loadDemo = async () => {
    setDemoTrigger((n) => n + 1)
    setError(null)
    setScenario2050(false)
    setLoad('climate', true)
    try {
      const { profile: climateProfile } = await fetchClimateProfile(
        DEMO_LAT,
        DEMO_LON,
        12000,
      )
      setProfile(climateProfile)
      setPresentProfile(climateProfile)
      setLoad('climate', false)
      await enrichAndRecommend(climateProfile, { saveAsDemo: true })
    } catch {
      const demo = await loadDemoFallback()
      if (demo) {
        setProfile(demo.siteProfile)
        setPresentProfile(demo.siteProfile)
        setPlants(demo.plants)
        setPresentPlants(demo.plants)
        setError('Using cached demo after partial failure.')
      }
      setLoad('climate', false)
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
    setLoad('climate', true)
    try {
      const { profile: p2050, deltaNote } = await fetchClimate2050Profile(base)
      setClimate2050Note(`${t(lang, 'resilient')}: ${deltaNote}`)
      setLoad('climate', false)
      const rec = await enrichAndRecommend(p2050, { saveAsDemo2050: true })
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
      setLoad('climate', false)
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
      />
      <aside className="sidebar" ref={reportRef}>
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
          <button type="button" className="secondary" onClick={() => window.location.reload()}>
            {t(lang, 'clear')}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <UserGoals prefs={prefs} onChange={setPrefs} />
        <p className="meta note">{effortHoursLabel(prefs)}</p>
        <LayerToggles lang={lang} layers={mapLayers} setLayers={setMapLayers} />
        {bag3dNote && <p className="meta note">{bag3dNote}</p>}
        <p className="meta note">
          Draw rectangles on the map to add buildings (height below). Saved in share link.
        </p>
        {buildings.length > 0 && (
          <div className="card">
            <h2>Buildings (estimate heights)</h2>
            {buildings.map((b) => (
              <label key={b.id} className="status-row">
                {b.id.slice(0, 8)}… height (m)
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
        <SunHeatmap grid={sunGrid} />
        {guildNote && <p className="meta note">{guildNote}</p>}

        <div className="card">
          <h2>Data loading</h2>
          {(['climate', 'soil', 'pdok', 'plants'] as LoadingKey[]).map((key) => (
            <div className="status-row" key={key}>
              {loading[key] ? <span className="spinner" /> : <span>✓</span>}
              <span>
                {key === 'climate' && 'Open-Meteo climate'}
                {key === 'soil' && 'SoilGrids soil'}
                {key === 'pdok' && 'PDOK bodemkaart'}
                {key === 'plants' && 'Plant ranking'}
              </span>
            </div>
          ))}
        </div>

        {profile && <PlotScoreHero profile={profile} lang={lang} />}

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={scenario2050}
            onChange={(e) => void toggle2050(e.target.checked)}
          />
          {t(lang, 'climate2050')} <span className="estimate-tag">{t(lang, 'estimate')}</span>
        </label>
        {climate2050Note && <p className="meta note">{climate2050Note}</p>}
        {plantDiff && scenario2050 && <p className="meta">{plantDiff}</p>}

        {profile && (
          <div className="card">
            <h2>{t(lang, 'siteProfile')}</h2>
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
              void runRecommend(adjusted)
            }}
          />
          {t(lang, 'shade')}
        </label>

        {profile && plants.length > 0 && (
          <WaterSavingCard profile={profile} plants={plants} lang={lang} />
        )}

        {plants.length > 0 && (
          <div className="card">
            <h2>{t(lang, 'recommended')}</h2>
            {rankingNote && <p className="meta">{rankingNote}</p>}
            <div className="plant-grid">
              {plants.map((p) => (
                <div
                  className="plant-card card"
                  key={p.name}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPlant(p)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedPlant(p)}
                >
                  <h3>{p.name}</h3>
                  <p>{p.why}</p>
                  {p.why_structured && p.why_structured.length > 0 && (
                    <ul className="why-list compact">
                      {p.why_structured.map((w) => (
                        <li key={w.factor} className={w.ok ? 'why-ok' : 'why-bad'}>{w.text}</li>
                      ))}
                    </ul>
                  )}
                  <p className="meta">
                    Water: {p.water_need} · Sun: {p.sun_need}
                  </p>
                  <p className="meta">{t(lang, 'explain')}</p>
                  <ExplainBars profile={profile!} plant={p} />
                  <p className="meta cal-label">{t(lang, 'calendar')}</p>
                  <PlantCalendarStrip profile={profile!} plant={p} prefs={prefs} />
                </div>
              ))}
            </div>
          </div>
        )}

        {zonePlants.length > 0 && (
          <div className="card">
            <h2>By sun zone <span className="estimate-tag">estimate</span></h2>
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
