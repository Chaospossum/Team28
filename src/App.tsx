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
import { readShareParams } from './share'
import type { LoadingKey, PlantRecommendation, RecommendResponse, SiteProfile } from './types'

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
      opts?: { saveAsDemo?: boolean; saveAsDemo2050?: boolean },
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
          }),
        })
        if (!res.ok) throw new Error(`recommend_${res.status}`)
        const data: RecommendResponse = await res.json()
        setProfile(data.siteProfile)
        setPlants(data.plants)
        if (!scenario2050) {
          setPresentProfile(data.siteProfile)
          setPresentPlants(data.plants)
        }
        setRankingNote(
          data.usedLlm
            ? 'Ranked with LLM'
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
    [applyShade, lang, scenario2050],
  )

  const enrichAndRecommend = useCallback(
    async (base: SiteProfile, opts?: { saveAsDemo?: boolean; saveAsDemo2050?: boolean }) => {
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

  const handlePlot = useCallback(
    async (sel: PlotSelection) => {
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
        await enrichAndRecommend(climateProfile)
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
    [enrichAndRecommend],
  )

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
    const shared = readShareParams()
    if (shared?.demo) void loadDemo()
  }, [])

  return (
    <div className="app">
      <MapDraw
        onSelect={handlePlot}
        demoLat={DEMO_LAT}
        demoLon={DEMO_LON}
        triggerDemo={demoTrigger}
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

        <LayerToggles lang={lang} layers={mapLayers} setLayers={setMapLayers} />

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
              <dt>Soil pH</dt>
              <dd>{fmt(profile.soil_ph, 1)}</dd>
              <dt>Clay / sand</dt>
              <dd>{fmt(profile.clay_pct, 0)}% / {fmt(profile.sand_pct, 0)}%</dd>
              <dt>NL grondsoort</dt>
              <dd>
                {profile.soil_type_nl ??
                  (profile.pdok_unavailable ? t(lang, 'noNlSoil') : '—')}
              </dd>
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
                <div className="plant-card card" key={p.name}>
                  <h3>{p.name}</h3>
                  <p>{p.why}</p>
                  <p className="meta">
                    Water: {p.water_need} · Sun: {p.sun_need}
                  </p>
                  <p className="meta">{t(lang, 'explain')}</p>
                  <ExplainBars profile={profile!} plant={p} />
                  <p className="meta cal-label">{t(lang, 'calendar')}</p>
                  <PlantCalendarStrip profile={profile!} plant={p} />
                </div>
              ))}
            </div>
          </div>
        )}

        <ShareExport profile={profile} lang={lang} reportRef={reportRef} />

        <p className="honesty">{t(lang, 'honesty')}</p>
      </aside>
    </div>
  )
}
