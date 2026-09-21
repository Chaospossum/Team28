import { describe, expect, it } from 'vitest'
import { decodeSharePayload, encodeSharePayload } from '../src/shareState'

describe('share polygon round-trip', () => {
  it('round-trips polygon and prefs', () => {
    const payload = {
      lat: 50.85,
      lon: 5.69,
      polygon: [
        [5.688, 50.848],
        [5.692, 50.848],
        [5.692, 50.852],
        [5.688, 50.852],
        [5.688, 50.848],
      ],
      prefs: { pollinators: 50, ornamental: 25, food: 25, effort: 'minimal' as const },
    }
    const enc = encodeSharePayload(payload)
    const dec = decodeSharePayload(enc)
    expect(dec?.lat).toBe(50.85)
    expect(dec?.polygon?.length).toBe(5)
    expect(dec?.prefs?.pollinators).toBe(50)
  })
})
