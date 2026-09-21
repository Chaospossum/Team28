import { useEffect, useState } from 'react'

interface FungiResponse {
  ok: boolean
  panel: string
  mycorrhiza_types?: string[]
  confidence?: string
  resolution?: string
  license?: string
  source_url?: string
}

export function FungiPanel({
  scientificName,
  urban,
}: {
  scientificName: string | null
  urban: boolean
}) {
  const [data, setData] = useState<FungiResponse | null>(null)

  useEffect(() => {
    if (!scientificName) {
      setData(null)
      return
    }
    void fetch(
      `/api/fungi?scientificName=${encodeURIComponent(scientificName)}&urban=${urban ? '1' : '0'}`,
    )
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ ok: false, panel: 'no data here' }))
  }, [scientificName, urban])

  return (
    <div className="card">
      <h2>Fungi / mycorrhiza <span className="estimate-tag">FungalRoot via GBIF</span></h2>
      {!scientificName && <p className="meta">Select a plant to look up associations.</p>}
      {data && (
        <>
          <p className="water-headline">{data.panel}</p>
          {data.ok && (
            <p className="meta">
              {data.mycorrhiza_types?.join(', ')} · {data.resolution} · {data.confidence} ·{' '}
              {data.license}
            </p>
          )}
          {!data.ok && <p className="meta">SPUN: no public API (not queried). Soudzilovskaia / FungalRoot via GBIF only.</p>}
        </>
      )}
    </div>
  )
}
