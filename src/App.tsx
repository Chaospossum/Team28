import { useCallback, useState } from 'react'
import './App.css'
import { MapDraw, type PlotSelection } from './MapDraw'
import { fetchClimateProfile, sunClass } from './climate'
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

export default function App() {
  const [demoTrigger, setDemoTrigger] = useState(0)
  const [loading, setLoading] = useState<Record<LoadingKey, boolean>>({
    climate: false,
    soil: false,
    pdok: false,
    plants: false,
  })
  const [profile, setProfile] = useState<SiteProfile | null>(null)
  const [plants, setPlants] = useState<PlantRecommendation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [manualShade, setManualShade] = useState(false)
  const [rankingNote, setRankingNote] = useState<string | null>(null)

  const setLoad = (key: LoadingKey, on: boolean) =>
    setLoading((prev) => ({ ...prev, [key]: on }))

  const applyShade = useCallback((p: SiteProfile): SiteProfile => {
    if (!manualShade) return p
    return { ...p, sun_class: 'shade', manual_shade: true }
  }, [manualShade])

  const runRecommend = useCallback(async (siteProfile: SiteProfile) => {
    setLoad('plants', true)
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteProfile: applyShade(siteProfile) }),
      })
      if (!res.ok) throw new Error(`recommend_${res.status}`)
      const data: RecommendResponse = await res.json()
      setProfile(data.siteProfile)
      setPlants(data.plants)
      setRankingNote(
        data.usedLlm
          ? 'Ranked with LLM'
          : `Rule-based EcoCrop shortlist (${data.rankingSource ?? 'fallback'})`,
      )
      if (data.fallback) setError('Live ranking failed — showing cached demo results.')
    } catch (e) {
      const demo = await loadDemoFallback()
      if (demo) {
        setProfile(demo.siteProfile)
        setPlants(demo.plants)
        setError('Could not reach API — showing cached Maastricht demo.')
        setRankingNote('Cached demo fallback')
      } else {
        setError(String((e as Error).message || e))
      }
    } finally {
      setLoad('plants', false)
    }
  }, [applyShade])

  const enrichAndRecommend = useCallback(
    async (base: SiteProfile) => {
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
        await runRecommend(data.siteProfile)
      } catch {
        setLoad('soil', false)
        setLoad('pdok', false)
        await runRecommend(base)
      }
    },
    [runRecommend],
  )

  const handlePlot = useCallback(
    async (sel: PlotSelection) => {
      setError(null)
      setPlants([])
      setRankingNote(null)
      setLoad('climate', true)
      try {
        const { profile: climateProfile } = await fetchClimateProfile(
          sel.lat,
          sel.lon,
          sel.area_m2,
        )
        setProfile(climateProfile)
        setLoad('climate', false)
        await enrichAndRecommend(climateProfile)
      } catch (e) {
        setLoad('climate', false)
        const demo = await loadDemoFallback()
        if (demo) {
          setProfile(demo.siteProfile)
          setPlants(demo.plants)
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
    setLoad('climate', true)
    try {
      const { profile: climateProfile } = await fetchClimateProfile(
        DEMO_LAT,
        DEMO_LON,
        12000,
      )
      setProfile(climateProfile)
      setLoad('climate', false)
      await enrichAndRecommend(climateProfile)
      await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteProfile: climateProfile, saveAsDemo: true }),
      })
    } catch {
      const demo = await loadDemoFallback()
      if (demo) {
        setProfile(demo.siteProfile)
        setPlants(demo.plants)
        setError('Using cached demo after partial failure.')
      }
      setLoad('climate', false)
    }
  }

  return (
    <div className="app">
      <MapDraw
        onSelect={handlePlot}
        demoLat={DEMO_LAT}
        demoLon={DEMO_LON}
        triggerDemo={demoTrigger}
      />
      <aside className="sidebar">
        <h1>Right Plant, Right Place</h1>
        <p className="subtitle">Draw your plot to match plants to sun, rain, and soil.</p>

        <div className="toolbar">
          <button type="button" onClick={loadDemo}>Load demo plot</button>
          <button type="button" className="secondary" onClick={() => window.location.reload()}>
            Clear
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

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

        {profile && (
          <div className="card">
            <h2>Site profile</h2>
            <dl>
              <dt>Centroid</dt>
              <dd>{fmt(profile.lat, 4)}°, {fmt(profile.lon, 4)}°</dd>
              <dt>Area</dt>
              <dd>{fmt(profile.area_m2, 0)} m²</dd>
              <dt>Sunshine</dt>
              <dd>{fmt(profile.sun_hours_per_day, 2)} h/day ({profile.sun_class})</dd>
              <dt>Radiation</dt>
              <dd>{fmt(profile.radiation_mj, 2)} MJ/m²/day</dd>
              <dt>Rain (2023)</dt>
              <dd>{fmt(profile.rain_mm_year, 0)} mm/yr ({profile.moisture_class})</dd>
              <dt>Growing-season temp</dt>
              <dd>{fmt(profile.temp_growing_season, 1)} °C (Apr–Sep)</dd>
              <dt>Soil pH</dt>
              <dd>{fmt(profile.soil_ph, 1)}</dd>
              <dt>Clay / sand</dt>
              <dd>{fmt(profile.clay_pct, 0)}% / {fmt(profile.sand_pct, 0)}%</dd>
              <dt>Texture</dt>
              <dd>{profile.texture_class}</dd>
              <dt>NL soil map</dt>
              <dd>{profile.soil_type_nl ?? '—'}</dd>
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
          This spot is shaded by buildings/trees
        </label>

        {plants.length > 0 && (
          <div className="card">
            <h2>Recommended plants</h2>
            {rankingNote && <p className="meta">{rankingNote}</p>}
            <div className="plant-grid">
              {plants.map((p) => (
                <div className="plant-card card" key={p.name}>
                  <h3>{p.name}</h3>
                  <p>{p.why}</p>
                  <p className="meta">
                    Water: {p.water_need} · Sun: {p.sun_need}
                    {p.risk ? ` · Risk: ${p.risk}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="honesty">
          Soil data ≈250 m resolution, climate ≈km scale. This is a neighbourhood estimate, not a
          soil test.
        </p>
      </aside>
    </div>
  )
}
