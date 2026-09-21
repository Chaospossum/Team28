import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let interactions = []

export function loadInteractions() {
  const raw = fs.readFileSync(path.join(__dirname, 'data', 'interactions.csv'), 'utf8')
  interactions = []
  for (const line of raw.split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue
    const [a, b, interaction, evidence, source] = line.split(',')
    if (!source?.trim()) continue
    const kind = (interaction ?? '').includes('avoid') ? 'avoid' : 'good'
    interactions.push({
      plant_a: a?.trim(),
      plant_b: b?.trim(),
      kind,
      evidence: evidence?.trim(),
      source: source?.trim(),
    })
  }
}

export function partnersFor(plants) {
  const names = new Set(plants.map((p) => p.name.toLowerCase()))
  const good = []
  const avoid = []
  for (const row of interactions) {
    const la = row.plant_a?.toLowerCase()
    const lb = row.plant_b?.toLowerCase()
    if (!names.has(la) && !names.has(lb)) continue
    const other = names.has(la) ? row.plant_b : row.plant_a
    if (row.kind === 'good') good.push({ with: other, evidence: row.evidence, source: row.source })
    if (row.kind === 'avoid') avoid.push({ with: other, evidence: row.evidence, source: row.source })
  }
  return { good, avoid }
}

/** Pick up to 6 plants from shortlist honoring prefs effort cap (warn if over). */
export function suggestGuild(shortlist, prefs, limit = 6) {
  const picked = shortlist.slice(0, limit)
  const effortHigh = picked.filter((p) => (p.effortPenalty ?? 0) > 0.45).length
  const warn =
    prefs?.effort === 'minimal' && effortHigh > 1
      ? 'Guild may exceed minimal effort — includes shrubs/trees (estimate).'
      : null
  return { plants: picked.map((p) => p.name), warn, partners: partnersFor(picked) }
}
