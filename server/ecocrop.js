import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CSV_PATH = path.join(__dirname, 'data', 'EcoCrop_DB.csv')

const PREFERRED_KEYWORDS = [
  'tomato',
  'potato',
  'carrot',
  'lettuce',
  'bean',
  'pea',
  'cabbage',
  'onion',
  'garlic',
  'pepper',
  'cucumber',
  'zucchini',
  'courgette',
  'spinach',
  'kale',
  'strawberry',
  'apple',
  'pear',
  'grape',
  'wheat',
  'maize',
  'corn',
  'barley',
  'oat',
  'sunflower',
  'pumpkin',
  'squash',
  'beet',
  'radish',
  'basil',
  'parsley',
  'mint',
  'thyme',
  'rosemary',
  'chive',
  'broccoli',
  'cauliflower',
  'leek',
  'celery',
  'asparagus',
  'raspberry',
  'blackberry',
  'blueberry',
  'cherry',
  'plum',
  'apricot',
  'peach',
  'rhubarb',
  'chard',
  'turnip',
  'parsnip',
  'fennel',
  'dill',
  'coriander',
  'cilantro',
  'sage',
  'oregano',
  'lavender',
  'marigold',
  'nasturtium',
]

/** @type {Array<Record<string, string>>} */
let rows = []

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

export function loadEcoCrop() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const header = parseCsvLine(lines[0])
  rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const row = {}
    header.forEach((h, i) => {
      row[h] = cols[i] ?? ''
    })
    return row
  })
  console.log(`[ecocrop] loaded ${rows.length} species`)
}

function num(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

function displayName(row) {
  const com = (row.COMNAME || '').split(',')[0]?.trim()
  if (com && com.length > 1 && com.length < 80) return com
  return row.ScientificName || 'Unknown'
}

function isPreferred(name) {
  const lower = name.toLowerCase()
  return PREFERRED_KEYWORDS.some((k) => lower.includes(k))
}

function inRange(value, min, max) {
  if (value == null) return true
  if (min != null && value < min) return false
  if (max != null && value > max) return false
  return true
}

/**
 * @param {import('./types.js').SiteProfile} site
 */
export function filterEcoCrop(site, cap = 30) {
  const temp = site.temp_growing_season
  const rain = site.rain_mm_year
  const ph = site.soil_ph

  const matches = []
  for (const row of rows) {
    const tmin = num(row.TMIN)
    const tmax = num(row.TMAX)
    const rmin = num(row.RMIN)
    const rmax = num(row.RMAX)
    const phmin = num(row.PHMIN)
    const phmax = num(row.PHMAX)

    if (!inRange(temp, tmin, tmax)) continue
    if (!inRange(rain, rmin, rmax)) continue
    if (ph != null && !inRange(ph, phmin, phmax)) continue

    const name = displayName(row)
    matches.push({
      name,
      scientific: row.ScientificName,
      preferred: isPreferred(name),
      tmin,
      tmax,
      rmin,
      rmax,
      phmin,
      phmax,
    })
  }

  matches.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return matches.slice(0, cap)
}

export function shortlistFallback(shortlist, count = 8) {
  return shortlist.slice(0, count).map((s) => ({
    name: s.name,
    why: `EcoCrop tolerates ~${s.tmin ?? '?'}-${s.tmax ?? '?'}°C, ${s.rmin ?? '?'}-${s.rmax ?? '?'} mm rain, pH ${s.phmin ?? '?'}-${s.phmax ?? '?'}.`,
    water_need: 'moderate',
    sun_need: 'varies',
    risk: 'Verify locally; rule-based match only.',
  }))
}
