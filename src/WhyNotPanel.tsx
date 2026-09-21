import { useState } from 'react'
import type { SiteProfile } from './types'

interface WhyLine {
  factor: string
  ok: boolean
  text: string
}

export function WhyNotPanel({ profile }: { profile: SiteProfile }) {
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<WhyLine[] | null>(null)
  const [near, setNear] = useState<{ name: string }[]>([])
  const [err, setErr] = useState<string | null>(null)

  const search = async () => {
    if (!query.trim()) return
    setErr(null)
    setLines(null)
    try {
      const res = await fetch('/api/why-plant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteProfile: profile, plantName: query.trim() }),
      })
      if (!res.ok) throw new Error(`why_${res.status}`)
      const data = await res.json()
      if (!data.found) {
        setErr('No EcoCrop match for that name — try tomato, lavender, pea.')
        setLines([])
        setNear(data.nearMisses ?? [])
        return
      }
      setLines(data.why_structured ?? [])
      setNear([])
    } catch (e) {
      setErr(String((e as Error).message || e))
    }
  }

  const loadNear = async () => {
    const res = await fetch('/api/why-near', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteProfile: profile }),
    })
    if (res.ok) {
      const data = await res.json()
      setNear((data.nearMisses ?? []).map((p: { name: string }) => ({ name: p.name })))
    }
  }

  return (
    <div className="card">
      <h2>Why not? <span className="estimate-tag">Rule-based</span></h2>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Plant name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
        />
        <button type="button" onClick={() => void search()}>Check</button>
        <button type="button" className="secondary" onClick={() => void loadNear()}>
          Near-misses
        </button>
      </div>
      {err && <p className="meta">{err}</p>}
      {lines && lines.length > 0 && (
        <ul className="why-list">
          {lines.map((l) => (
            <li key={l.factor} className={l.ok ? 'why-ok' : 'why-bad'}>{l.text}</li>
          ))}
        </ul>
      )}
      {near.length > 0 && (
        <p className="meta">
          Near-misses (one factor off): {near.map((n) => n.name).join(', ')}
        </p>
      )}
    </div>
  )
}
