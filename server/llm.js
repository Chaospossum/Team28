import { shortlistFallback } from './ecocrop.js'
import { whySentence } from './why.js'

function stripFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

/** Browser builds have no process.env, so the LLM rephrase is simply off there. */
const env = globalThis.process?.env ?? {}

const LANG_NAMES = { en: 'English', nl: 'Dutch', fr: 'French', de: 'German' }

function buildRephrasePrompt(plants, lang = 'en') {
  const language = LANG_NAMES[lang] ?? LANG_NAMES.en
  const facts = plants.map((p) => ({
    name: p.name,
    facts: (p.why_structured ?? []).map((w) => w.text).join(' '),
    water_need: p.water_need,
    sun_need: p.sun_need,
    risk: p.risk,
  }))
  return `Rephrase each plant "why" in ${language} for gardeners.
RULES: Use ONLY facts from the "facts" field. Do NOT add numbers, sources, or claims not already in facts.
Keep the same plant names. Return ONLY JSON array:
[{"name":"...","why":"..."}]
Input:
${JSON.stringify(facts, null, 2)}`
}

function extractNumbers(text) {
  const matches = text.match(/-?\d+(\.\d+)?/g) ?? []
  return new Set(matches.map((n) => Number(n).toFixed(2)))
}

function whyIsSafe(originalFacts, newWhy) {
  const allowed = extractNumbers(originalFacts)
  const used = extractNumbers(newWhy)
  for (const n of used) {
    if (!allowed.has(n)) return false
  }
  return true
}

async function callAnthropicRephrase(plants, lang) {
  const key = env.ANTHROPIC_API_KEY
  if (!key) return null
  const prompt = buildRephrasePrompt(plants, lang)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) throw new Error(`anthropic_${res.status}`)
  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

async function callOpenAIRephrase(plants, lang) {
  const key = env.OPENAI_API_KEY
  if (!key) return null
  const prompt = buildRephrasePrompt(plants, lang)
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  })
  if (!res.ok) throw new Error(`openai_${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

function mergeRephrased(basePlants, text) {
  const cleaned = stripFences(text)
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) throw new Error('not_array')
  const byName = new Map(parsed.map((p) => [String(p.name).toLowerCase(), String(p.why)]))
  return basePlants.map((p) => {
    const facts = (p.why_structured ?? []).map((w) => w.text).join(' ')
    const candidate = byName.get(p.name.toLowerCase())
    if (!candidate || !whyIsSafe(facts, candidate)) return p
    return { ...p, why: candidate }
  })
}

export async function rankPlants(siteProfile, shortlist, lang = 'en') {
  if (shortlist.length === 0) {
    return { plants: [], usedLlm: false, source: 'empty_shortlist' }
  }

  const basePlants = shortlistFallback(shortlist, siteProfile, 8)
  const hasKey = env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY
  if (!hasKey) {
    return { plants: basePlants, usedLlm: false, source: 'ecocrop_fallback' }
  }

  try {
    const text = env.ANTHROPIC_API_KEY
      ? await callAnthropicRephrase(basePlants, lang)
      : await callOpenAIRephrase(basePlants, lang)
    if (!text) return { plants: basePlants, usedLlm: false, source: 'ecocrop_fallback' }
    const plants = mergeRephrased(basePlants, text)
    return { plants, usedLlm: true, source: 'llm_rephrase_only' }
  } catch {
    return { plants: basePlants, usedLlm: false, source: 'ecocrop_rephrase_fallback' }
  }
}

export { whySentence }
