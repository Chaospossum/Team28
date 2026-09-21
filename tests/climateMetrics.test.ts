import { describe, expect, it } from 'vitest'
import { frostAndGddFromDaily } from '../src/climateMetrics'

describe('frost and GDD', () => {
  it('computes metrics from daily series', () => {
    const times = ['2019-01-15', '2019-07-15']
    const tmin = [-2, 12]
    const tmax = [1, 22]
    const m = frostAndGddFromDaily(times, tmin, tmax, '2019')
    expect(m.frost_days_median).toBe(1)
    expect(m.gdd_base5_growing).toBeGreaterThan(0)
    expect(m.source).toContain('Open-Meteo')
  })
})
