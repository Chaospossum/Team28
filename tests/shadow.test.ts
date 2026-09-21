import { describe, expect, it } from 'vitest'
import { directSunHoursOnVerticalWall } from '../src/shadow/sun'

describe('shadow sanity', () => {
  it('north-facing wall has no December direct sun in Maastricht', () => {
    const dec21 = new Date(2023, 11, 21)
    const hours = directSunHoursOnVerticalWall(50.85, 5.69, dec21, 0, 15)
    expect(hours).toBe(0)
  })

  it('south-facing wall gets midwinter sun', () => {
    const dec21 = new Date(2023, 11, 21)
    const hours = directSunHoursOnVerticalWall(50.85, 5.69, dec21, 180, 15)
    expect(hours).toBeGreaterThan(0)
  })
})
