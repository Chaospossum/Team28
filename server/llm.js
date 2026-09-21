import { shortlistFallback } from './ecocrop.js'

function stripFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

async function callAnthropic(siteProfile, shortlist) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null

  const prompt = buildPrompt(siteProfile, shortlist)
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
  const text = data.content?.[0]?.text ?? ''
  return parsePlantsJson(text)
}

async function callOpenAI(siteProfile, shortlist) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null

  const prompt = buildPrompt(siteProfile, shortlist)
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  })
  if (!res.ok) throw new Error(`openai_${res.status}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  return parsePlantsJson(text)
}

function buildPrompt(siteProfile, shortlist) {
  const names = shortlist.map((s) => s.name).join(', ')
  return `You are a horticulture advisor for home gardeners in Europe.

Site profile (use these exact numbers in your reasons):
${JSON.stringify(siteProfile, null, 2)}

Candidate plants from EcoCrop (choose from this list only):
${names}

Rank the 8 best plants for this site. Return ONLY a JSON array, no markdown:
[{"name":"...","why":"one sentence citing actual site numbers","water_need":"low|moderate|high","sun_need":"full sun|part shade|shade","risk":"brief risk note"}]`
}

function parsePlantsJson(text) {
  const cleaned = stripFences(text)
  const parsed = JSON.parse(cleaned)
  if (!Array.isArray(parsed)) throw new Error('not_array')
  return parsed.slice(0, 8).map((p) => ({
    name: String(p.name),
    why: String(p.why),
    water_need: String(p.water_need ?? 'moderate'),
    sun_need: String(p.sun_need ?? 'part shade'),
    risk: String(p.risk ?? ''),
  }))
}

export async function rankPlants(siteProfile, shortlist) {
  if (shortlist.length === 0) {
    return { plants: [], usedLlm: false, source: 'empty_shortlist' }
  }

  const tryOnce = async () => {
    if (process.env.ANTHROPIC_API_KEY) return await callAnthropic(siteProfile, shortlist)
    if (process.env.OPENAI_API_KEY) return await callOpenAI(siteProfile, shortlist)
    return null
  }

  try {
    let plants = await tryOnce()
    if (!plants) {
      return {
        plants: shortlistFallback(shortlist),
        usedLlm: false,
        source: 'ecocrop_fallback',
      }
    }
    return { plants, usedLlm: true, source: 'llm' }
  } catch {
    try {
      const plants = await tryOnce()
      if (plants) return { plants, usedLlm: true, source: 'llm_retry' }
    } catch {
      /* fall through */
    }
    return {
      plants: shortlistFallback(shortlist),
      usedLlm: false,
      source: 'ecocrop_parse_fallback',
    }
  }
}
