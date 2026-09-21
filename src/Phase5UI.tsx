import { useEffect, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { plantingCalendar, type CalendarPlantTraits } from './calendar'
import { plantRangeBars } from './explain'
import type { Lang } from './i18n'
import { t } from './i18n'
import { computePlotScore } from './score'
import { buildShareUrl } from './share'
import type { SharePayload } from './shareState'
import { monthlyWorkloadIndex } from './effort'
import type { PlantRecommendation, SiteProfile, UserPrefs } from './types'
import { estimateWaterSaving } from './water'
import type { SunGridCell, SunGridResult } from './shadow/gridCore'
import { zoneHoursSummary } from './SunHeatmap'

function calendarTraitsFromPlant(plant: PlantRecommendation): string | CalendarPlantTraits {
  const r = plant.ranges as (CalendarPlantTraits & Record<string, number | string | null | undefined>) | undefined
  if (!r || r.gmin == null || r.gmax == null) return plant.name
  return {
    gmin: r.gmin,
    gmax: r.gmax,
    topmn: r.topmn ?? null,
    topmx: r.topmx ?? null,
    lispy: typeof r.lispy === 'string' ? r.lispy : null,
  }
}

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
      <div
        className="score-ring-wrap"
        role="img"
        aria-label={`${t(lang, 'plotScore')}: ${display} ${t(lang, 'scoreOutOf')}. ${score.verdict}`}
      >
        <svg width="130" height="130" viewBox="0 0 130 130" aria-hidden="true" focusable="false">
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
  prefs,
}: {
  profile: SiteProfile
  plant: PlantRecommendation
  prefs?: UserPrefs
}) {
  const months = plantingCalendar(profile, calendarTraitsFromPlant(plant))
  const workload = prefs ? monthlyWorkloadIndex(prefs) : null
  return (
    <div className="calendar-wrap">
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
      {workload && (
        <div className="calendar-strip workload" aria-label="Monthly effort estimate">
          {workload.map((w, i) => (
            <div
              key={i}
              className="cal-cell cal-work"
              style={{ opacity: 0.35 + (w / 100) * 0.65 }}
              title={`~${w}% effort index`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ShareExport({
  sharePayload,
  lang,
  reportRef,
}: {
  sharePayload: SharePayload | null
  lang: Lang
  reportRef: React.RefObject<HTMLElement | null>
}) {
  const copyLink = async () => {
    if (!sharePayload) return
    await navigator.clipboard.writeText(buildShareUrl(sharePayload))
  }

  const exportPdf = async () => {
    if (!reportRef.current) return
    const canvas = await html2canvas(reportRef.current, { scale: 2 })
    const img = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgH = (canvas.height * pageW) / canvas.width
    const maxPages = 8
    if (imgH <= pageH) {
      pdf.addImage(img, 'PNG', 0, 0, pageW, imgH)
      pdf.save('right-plant-plot-report.pdf')
      return
    }
    const sliceH = (canvas.height * pageH) / imgH
    let pages = Math.ceil(canvas.height / sliceH)
    if (pages > maxPages) {
      window.alert(t(lang, 'pdfTooLong'))
      return
    }
    for (let p = 0; p < pages; p++) {
      if (p > 0) pdf.addPage()
      const sy = p * sliceH
      const sh = Math.min(sliceH, canvas.height - sy)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sh
      const ctx = pageCanvas.getContext('2d')
      if (!ctx) {
        window.alert(t(lang, 'pdfTooLong'))
        return
      }
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh)
      const slice = pageCanvas.toDataURL('image/png')
      const drawH = (sh * pageW) / canvas.width
      pdf.addImage(slice, 'PNG', 0, 0, pageW, drawH)
      pdf.setFontSize(9)
      pdf.text(`${t(lang, 'pdfPage')} ${p + 1}/${pages}`, pageW - 72, pageH - 16)
    }
    pdf.save('right-plant-plot-report.pdf')
  }

  return (
    <div className="card">
      <h2>{t(lang, 'share')}</h2>
      <div className="toolbar">
        <button type="button" className="secondary" onClick={() => void copyLink()} disabled={!sharePayload}>
          {t(lang, 'copyLink')}
        </button>
        <button type="button" className="secondary" onClick={() => void exportPdf()} disabled={!sharePayload}>
          {t(lang, 'exportPdf')}
        </button>
      </div>
    </div>
  )
}

function Phase5A11yStyles() {
  return (
    <style>{`
      .plant-card-btn {
        width: 100%;
        text-align: left;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        font: inherit;
        color: inherit;
      }
      .plant-card-btn:focus-visible,
      .goals-toolbar button:focus-visible,
      .lang-row button:focus-visible,
      .toolbar button:focus-visible {
        outline: 2px solid #1b4332;
        outline-offset: 2px;
      }
      .meta.meta-contrast {
        color: #2d4a3e;
      }
      .map-radiation-legend {
        display: flex;
        justify-content: space-between;
        padding: 0.35rem 0.5rem;
        font-size: 0.75rem;
        background: rgba(255, 255, 255, 0.92);
      }
      .map-outer {
        position: relative;
        flex: 1;
        min-height: 280px;
      }
    `}</style>
  )
}

export function RecommendedPlantsSection({
  profile,
  plants,
  lang,
  rankingNote,
  prefs,
  onSelectPlant,
}: {
  profile: SiteProfile
  plants: PlantRecommendation[]
  lang: Lang
  rankingNote: string | null
  prefs: UserPrefs
  onSelectPlant: (p: PlantRecommendation) => void
}) {
  return (
    <section className="plants-hero card" aria-labelledby="plants-heading">
      <Phase5A11yStyles />
      <h2 id="plants-heading">{t(lang, 'recommended')}</h2>
      {rankingNote && <p className="meta meta-contrast">{rankingNote}</p>}
      <div className="plant-grid">
        {plants.map((p) => (
          <article className="plant-card card" key={p.name}>
            <button
              type="button"
              className="plant-card-btn"
              onClick={() => onSelectPlant(p)}
              aria-label={`${t(lang, 'selectPlant')} ${p.name}`}
            >
              <h3>{p.name}</h3>
              <p>{p.why}</p>
            </button>
            {p.why_structured && p.why_structured.length > 0 && (
              <ul className="why-list compact">
                {p.why_structured.map((w) => (
                  <li key={w.factor} className={w.ok ? 'why-ok' : 'why-bad'}>{w.text}</li>
                ))}
              </ul>
            )}
            <p className="meta meta-contrast">
              {t(lang, 'waterNeed')}: {p.water_need} · {t(lang, 'sunNeed')}: {p.sun_need}
            </p>
            <p className="meta meta-contrast">{t(lang, 'explain')}</p>
            <ExplainBars profile={profile} plant={p} />
            <p className="meta meta-contrast cal-label">{t(lang, 'calendar')}</p>
            <PlantCalendarStrip profile={profile} plant={p} prefs={prefs} />
          </article>
        ))}
      </div>
    </section>
  )
}

const HEAT_MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function SunHeatmapCard({ grid, lang }: { grid: SunGridResult | null; lang: Lang }) {
  if (!grid || grid.cells.length === 0) {
    return <p className="meta meta-contrast">{t(lang, 'sunGridEmpty')}</p>
  }

  const monthlyAvg = HEAT_MONTHS.map((_, mi) => {
    const sum = grid.cells.reduce((s, c) => s + c.monthlyGeometricHours[mi] * grid.clearSkyFraction, 0)
    return sum / grid.cells.length
  })
  const maxM = Math.max(...monthlyAvg, 0.1)

  const yearly = grid.cells.map((c) => c.growingEffectiveHours)
  const minY = Math.min(...yearly)
  const maxY = Math.max(...yearly, 0.1)

  return (
    <div className="card sun-heatmap">
      <h2>
        {t(lang, 'sunZones')} <span className="estimate-tag">{t(lang, 'estimate')}</span>
      </h2>
      <p className="meta meta-contrast">{grid.label}</p>
      <p className="meta meta-contrast">
        Cells: {grid.cells.length} ({grid.zones.full} full ≥6h · {grid.zones.part} part 3–6h ·{' '}
        {grid.zones.shade} shade &lt;3h growing season)
      </p>
      <p className="meta meta-contrast cal-label">{t(lang, 'monthlySun')}</p>
      <div className="calendar-strip">
        {monthlyAvg.map((h, i) => (
          <div
            key={i}
            className="cal-cell cal-grow"
            style={{ opacity: 0.35 + (h / maxM) * 0.65 }}
            title={`${HEAT_MONTHS[i]}: ~${h.toFixed(1)} h/day`}
          >
            {HEAT_MONTHS[i]}
            <div className="heat-val">{h.toFixed(1)}</div>
          </div>
        ))}
      </div>
      <p className="meta meta-contrast cal-label">{t(lang, 'yearlyHeat')}</p>
      <p className="meta meta-contrast sun-heat-legend">{t(lang, 'sunHeatLegend')}</p>
      <div
        className="year-heat"
        style={{
          gridTemplateColumns: `repeat(${grid.cols}, minmax(4px, 1fr))`,
        }}
      >
        {Array.from({ length: grid.rows * grid.cols }, (_, idx) => {
          const j = Math.floor(idx / grid.cols)
          const i = idx % grid.cols
          const cell = grid.cells.find((c) => c.i === i && c.j === j)
          if (!cell) return <span key={idx} className="heat-cell heat-empty" />
          const tNorm = (cell.growingEffectiveHours - minY) / (maxY - minY || 1)
          const color =
            cell.zone === 'full' ? '#2d6a4f' : cell.zone === 'part' ? '#52b788' : '#e9c46a'
          const borderW = 1 + Math.round(tNorm * 2)
          return (
            <span
              key={idx}
              className="heat-cell"
              style={{
                background: color,
                opacity: 0.35 + tNorm * 0.65,
                boxShadow: `inset 0 0 0 ${borderW}px rgba(27, 67, 50, 0.45)`,
              }}
              title={`~${cell.growingEffectiveHours.toFixed(1)} h/day`}
            />
          )
        })}
      </div>
    </div>
  )
}

export { zoneHoursSummary }
export type { SunGridCell }

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
