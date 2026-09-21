import { describe, expect, it } from 'vitest'
import { fetchFungalTraits } from '../server/fungi.js'

describe('fungi GBIF', () => {
  it('returns FungalRoot type for Lavandula', async () => {
    const data = await fetchFungalTraits('Lavandula', { refresh: true })
    expect(data.source_url).toContain('gbif.org')
    if (data.ok) expect(data.mycorrhiza_types.length).toBeGreaterThan(0)
  }, 30_000)
})
