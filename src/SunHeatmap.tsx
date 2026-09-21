import type { SunGridCell, SunGridResult } from './shadow/gridCore'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function SunHeatmap({ grid }: { grid: SunGridResult | null }) {
  if (!grid || grid.cells.length === 0) {
    return <p className="meta">Sun grid: no data here (draw a plot first).</p>
  }

  const monthlyAvg = MONTHS.map((_, mi) => {
    const sum = grid.cells.reduce((s, c) => s + c.monthlyGeometricHours[mi] * grid.clearSkyFraction, 0)
    return sum / grid.cells.length
  })
  const maxM = Math.max(...monthlyAvg, 0.1)

  const yearly = grid.cells.map((c) => c.growingEffectiveHours)
  const minY = Math.min(...yearly)
  const maxY = Math.max(...yearly, 0.1)

  return (
    <div className="card sun-heatmap">
      <h2>Sun zones <span className="estimate-tag">estimate</span></h2>
      <p className="meta">{grid.label}</p>
      <p className="meta">
        Cells: {grid.cells.length} ({grid.zones.full} full ≥6h · {grid.zones.part} part 3–6h ·{' '}
        {grid.zones.shade} shade &lt;3h growing season)
      </p>
      <p className="meta cal-label">Monthly direct sun (h/day, effective)</p>
      <div className="calendar-strip">
        {monthlyAvg.map((h, i) => (
          <div
            key={i}
            className="cal-cell cal-grow"
            style={{ opacity: 0.35 + (h / maxM) * 0.65 }}
            title={`${MONTHS[i]}: ~${h.toFixed(1)} h/day`}
          >
            {MONTHS[i]}
            <div className="heat-val">{h.toFixed(1)}</div>
          </div>
        ))}
      </div>
      <p className="meta cal-label">Yearly growing-season heatmap (cell colors)</p>
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
          const t = (cell.growingEffectiveHours - minY) / (maxY - minY || 1)
          const color =
            cell.zone === 'full' ? '#e76f51' : cell.zone === 'part' ? '#f4a261' : '#90be6d'
          return (
            <span
              key={idx}
              className="heat-cell"
              style={{ background: color, opacity: 0.35 + t * 0.65 }}
              title={`~${cell.growingEffectiveHours.toFixed(1)} h/day`}
            />
          )
        })}
      </div>
    </div>
  )
}

export function zoneHoursSummary(cells: SunGridCell[]) {
  const zones = ['full', 'part', 'shade'] as const
  return zones.map((z) => {
    const vals = cells.filter((c) => c.zone === z).map((c) => c.growingEffectiveHours)
    if (!vals.length) return { zone: z, hours: null as number | null }
    vals.sort((a, b) => a - b)
    return { zone: z, hours: vals[Math.floor(vals.length / 2)] }
  })
}
