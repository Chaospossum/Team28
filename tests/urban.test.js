import { describe, expect, it } from 'vitest'
import { classifySiteContext } from '../server/urban.js'

describe('urban context', () => {
  it('classifies Maastricht with buildings', async () => {
    const ctx = await classifySiteContext(50.85, 5.69)
    expect(ctx.buildingCount100m).toBeGreaterThan(0)
    expect(['urban', 'suburban', 'rural']).toContain(ctx.class)
    expect(ctx.sources.some((s) => s.includes('3DBAG'))).toBe(true)
  }, 30_000)
})
