// lib/analytics.test.ts
import { describe, it, expect } from 'vitest'
import { runExponentialSmoothing } from './analytics'

describe('runExponentialSmoothing', () => {
  it('returns a flat forecast when demand is perfectly constant', () => {
    const series = [10, 10, 10, 10, 10, 10, 10]

    const { nextForecast, mape } = runExponentialSmoothing(series)

    expect(nextForecast).toBeCloseTo(10, 5)
    // Perfect predictions mean 0% error
    expect(mape).toBe(0)
  })

  it('produces a forecast between the min and max of a varying series', () => {
    const series = [5, 15, 5, 15, 5, 15, 5]

    const { nextForecast } = runExponentialSmoothing(series)

    expect(nextForecast).toBeGreaterThanOrEqual(5)
    expect(nextForecast).toBeLessThanOrEqual(15)
  })

  it('weights recent data more heavily than old data (responds to a trend)', () => {
    // Demand ramps up over time — forecast should trend upward, not stay flat
    const rampUp = [2, 2, 2, 2, 2, 10, 10, 10, 10, 10]
    const flat = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6]

    const rampForecast = runExponentialSmoothing(rampUp).nextForecast
    const flatForecast = runExponentialSmoothing(flat).nextForecast

    // The ramping series should forecast noticeably higher than the flat
    // average, since the smoothing should lean toward the recent (higher) values
    expect(rampForecast).toBeGreaterThan(flatForecast)
  })

  it('handles a series that includes zero-sale days without crashing', () => {
    const series = [0, 0, 5, 0, 3, 0, 0]

    const { nextForecast, mape } = runExponentialSmoothing(series)

    expect(nextForecast).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(nextForecast)).toBe(true)
    // mape skips zero-actual days (division by zero guard), so it should
    // still compute a valid number, not NaN
    expect(mape === null || Number.isFinite(mape)).toBe(true)
  })

  it('returns null mape when every actual value is zero (no valid error to measure)', () => {
    const series = [0, 0, 0, 0, 0]

    const { mape } = runExponentialSmoothing(series)

    expect(mape).toBeNull()
  })

  it('produces exactly (length - 1) history points for an n-day series', () => {
    const series = [4, 6, 8, 10, 12]

    const { history } = runExponentialSmoothing(series)

    expect(history).toHaveLength(series.length - 1)
  })

  it('rounds mape to one decimal place as a percentage', () => {
    const series = [10, 12, 8, 11, 9]

    const { mape } = runExponentialSmoothing(series)

    if (mape !== null) {
      expect(Number(mape.toFixed(1))).toBe(mape)
    }
  })
})