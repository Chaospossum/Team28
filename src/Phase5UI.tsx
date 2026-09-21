import { useEffect, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { plantingCalendar } from './calendar'
import { plantRangeBars } from './explain'
import type { Lang } from './i18n'
import { t } from './i18n'
import { computePlotScore } from './score'
import type { PlantRecommendation, SiteProfile } from './types'
import { estimateWaterSaving } from './water'

export function PlotScoreHero({
  profile,
  lang,
}: {
  profile: SiteProfile
  lang: Lang
}) {
  const score = computePlotScore(profile)
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const target = score.value
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900)
      setDisplay(Math.round(target * p))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [score.value])

  const ring = 2 * Math.PI * 54
  const offset = ring - (display / 100) * ring
  const color = display >= 75 ? '#2d6a4f' : display >= 55 ? '#e9c46a' : '#e76f51'

  return (
    <div className="card score-hero">
      <h2>{t(lang, 'plotScore')} <span className="estimate-tag">{t(lang, 'estimate')}</span></h2>
      <div className="score-ring-wrap">
        <svg width="130" height="130" viewBox="0 0 130 130" aria-hidden>
          <circle cx="65" cy="65" r="54" fill="none" stroke="#e0e8e2" strokeWidth="10" />
          <circle
            cx="65"
            cy="65"
            r="54"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={ring}
            strokeDashoffset={offset}
            transform="rotate(-90 65 65)"
            strokeLinecap="round"
          />
          <text x="65" y="72" textAnchor="middle" fontSize="28" fontWeight="700" fill="#163828">
            {display}
          </text>
        </svg>
        <p className="score-verdict">{score.verdict}</p>
      </div>
    </div>
  )
}

export function ExplainBars({
  profile,
  plant,
}: {
  profile: SiteProfile
  plant: PlantRecommendation
}) {
  const bars = plantRangeBars(profile, plant.ranges ?? {})
  return (
    <div className="explain-bars">
      {bars.map((b) => (
        <div key={b.label} className="bar-row">
          <span className="bar-label">{b.label}</span>
          <div className={`bar-track bar-${b.status}`}>
            <div
              className="bar-site"
              style={{
                left: `${Math.min(95, Math.max(5, ((b.site ?? 0) / ((b.max ?? 1) * 1.2)) * 100))}%`,
              }}
            />
          </div>
          <span className="bar-meta">
            {b.site != null ? b.site.toFixed(b.label === 'pH' ? 1 : 0) : '—'} {b.unit}
          </span>
        </div>
      ))}
    </div>
  )
}

export function WaterSavingCard({
  profile,
  plants,
  lang,
}: {
  profile: SiteProfile
  plants: PlantRecommendation[]
  lang: Lang
}) {
  const est = estimateWaterSaving(profile, plants)
  return (
    <div className="card">
      <h2>{t(lang, 'waterSaving')} <span className="estimate-tag">{t(lang, 'estimate')}</span></h2>
      <p className="water-headline">{est.headline}</p>
      <p className="meta">{est.detail}</p>
    </div>
  )
}

export function PlantCalendarStrip({
  profile,
  plant,
}: {
  profile: SiteProfile
  plant: PlantRecommendation
}) {
  const months = plantingCalendar(profile, plant.name)
  return (
    <div className="calendar-strip" aria-label={`Calendar for ${plant.name}`}>
      {months.map((m) => (
        <div
          key={m.month}
          className={`cal-cell cal-${m.phase || 'idle'}`}
          title={m.phase || 'dormant'}
        >
          {m.label}
        </div>
      ))}
    </div>
  )
}

export function ShareExport({
  profile,
  lang,
  reportRef,
}: {
  profile: SiteProfile | null
  lang: Lang
  reportRef: React.RefObject<HTMLElement | null>
}) {
  const copyLink = async () => {
    if (!profile) return
    const url = new URL(window.location.href)
    url.searchParams.set('lat', profile.lat.toFixed(4))
    url.searchParams.set('lon', profile.lon.toFixed(4))
    url.searchParams.set('demo', '1')
    await navigator.clipboard.writeText(url.toString())
  }

  const exportPdf = async () => {
    if (!reportRef.current) return
    const canvas = await html2canvas(reportRef.current, { scale: 2 })
    const img = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const w = pdf.internal.pageSize.getWidth()
    const h = (canvas.height * w) / canvas.width
    pdf.addImage(img, 'PNG', 0, 0, w, Math.min(h, pdf.internal.pageSize.getHeight()))
    pdf.save('right-plant-plot-report.pdf')
  }

  return (
    <div className="card">
      <h2>{t(lang, 'share')}</h2>
      <div className="toolbar">
        <button type="button" className="secondary" onClick={() => void copyLink()} disabled={!profile}>
          {t(lang, 'copyLink')}
        </button>
        <button type="button" className="secondary" onClick={() => void exportPdf()} disabled={!profile}>
          {t(lang, 'exportPdf')}
        </button>
      </div>
    </div>
  )
}

export function LayerToggles({
  lang,
  layers,
  setLayers,
}: {
  lang: Lang
  layers: { radiation: boolean; pdok: boolean; ndvi: boolean }
  setLayers: (l: { radiation: boolean; pdok: boolean; ndvi: boolean }) => void
}) {
  return (
    <div className="card layer-toggles">
      <h2>{t(lang, 'layers')}</h2>
      {(
        [
          ['radiation', 'layerRadiation'],
          ['pdok', 'layerPdok'],
          ['ndvi', 'layerNdvi'],
        ] as const
      ).map(([key, labelKey]) => (
        <label key={key} className="toggle-row layer-row">
          <input
            type="checkbox"
            checked={layers[key]}
            onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })}
          />
          {t(lang, labelKey)}
        </label>
      ))}
    </div>
  )
}
