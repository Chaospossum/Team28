import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { whySentence, buildStructuredWhy } from './why.js'

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
      limn: num(row.LIMN),
      limx: num(row.LIMX),
      cat: row.CAT,
      lifo: row.LIFO,
      lispy: row.LISPA,
      gmin: num(row.GMIN),
      gmax: num(row.GMAX),
      ktmp: num(row.KTMP),
    })
  }

  matches.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return matches.slice(0, cap)
}

function waterNeedFromRain(siteRain, rmin, rmax) {
  if (siteRain == null) return 'moderate'
  const mid = ((rmin ?? 500) + (rmax ?? 1200)) / 2
  if (siteRain < mid * 0.85) return 'low'
  if (siteRain > mid * 1.15) return 'high'
  return 'moderate'
}

function sunNeedFromClass(sunClass) {
  if (sunClass === 'full sun') return 'full sun'
  if (sunClass === 'shade') return 'shade'
  return 'part shade'
}

function buildWhy(s, site) {
  const bits = []
  if (site.temp_growing_season != null && s.tmin != null && s.tmax != null) {
    bits.push(
      `your ${site.temp_growing_season.toFixed(1)}°C Apr–Sep mean sits inside its ${s.tmin}–${s.tmax}°C band`,
    )
  }
  if (site.rain_mm_year != null && s.rmin != null && s.rmax != null) {
    bits.push(
      `~${Math.round(site.rain_mm_year)} mm/yr rainfall matches its ${s.rmin}–${s.rmax} mm tolerance`,
    )
  }
  if (site.soil_ph != null && s.phmin != null && s.phmax != null) {
    bits.push(`pH ${site.soil_ph.toFixed(1)} fits ${s.phmin}–${s.phmax}`)
  }
  if (site.sun_class) {
    bits.push(`${site.sun_class} light suits typical garden culture here`)
  }
  if (!bits.length) {
    return `EcoCrop lists it for similar climates (${s.tmin ?? '?'}-${s.tmax ?? '?'}°C, ${s.rmin ?? '?'}-${s.rmax ?? '?'} mm).`
  }
  return bits.slice(0, 2).join('; ') + '.'
}

export function shortlistFallback(shortlist, site, count = 8) {
  return shortlist.slice(0, count).map((s) => ({
    name: s.name,
    why: whySentence(buildStructuredWhy(s, site)),
    why_structured: buildStructuredWhy(s, site),
    water_need: waterNeedFromRain(site.rain_mm_year, s.rmin, s.rmax),
    sun_need: sunNeedFromClass(site.sun_class),
    risk:
      site.soil_ph == null
        ? 'Soil pH was estimated nearby — confirm with a soil test.'
        : 'Neighbourhood-scale match; watch pests and drainage locally.',
    ranges: {
      tmin: s.tmin,
      tmax: s.tmax,
      rmin: s.rmin,
      rmax: s.rmax,
      phmin: s.phmin,
      phmax: s.phmax,
      limn: s.limn,
      limx: s.limx,
    },
  }))
}
