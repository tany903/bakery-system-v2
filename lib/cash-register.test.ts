// lib/cash-register.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { getCashSummary } from './cash-register'

function getTodayStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
}

function getYesterdayStart(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString()
}

interface FixtureData {
  todayEntries: any[]
  yesterdayEntries: any[]
  yesterdaySales: any[]
  todaySales: any[]
}

function mockSupabaseFor(fixtures: FixtureData) {
  const todayStart = getTodayStart()
  const yesterdayStart = getYesterdayStart()

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'cash_register') {
      // Track which gte() value this chain was built with, so the response
      // is keyed to the actual date range requested — not call order.
      let requestedFrom: string | null = null
      return {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn((_col: string, value: string) => {
          requestedFrom = value
          return {
            // Today's query: gte(todayStart).order(...) — no upper bound
            order: vi.fn().mockResolvedValue({
              data: requestedFrom === todayStart ? fixtures.todayEntries : [],
              error: null,
            }),
            // Yesterday's query: gte(yesterdayStart).lt(todayStart)
            lt: vi.fn((_col2: string, _upper: string) =>
              Promise.resolve({
                data: requestedFrom === yesterdayStart ? fixtures.yesterdayEntries : [],
                error: null,
              })
            ),
          }
        }),
      } as any
    }

    if (table === 'sales') {
      let requestedFrom: string | null = null
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn((_col: string, value: string) => {
          requestedFrom = value
          return {
            // Today's sales query: gte(todayStart) — no upper bound, resolves here
            then: (resolve: any) =>
              resolve({
                data: requestedFrom === todayStart ? fixtures.todaySales : [],
                error: null,
              }),
            // Yesterday's sales query: gte(yesterdayStart).lt(todayStart)
            lt: vi.fn((_col2: string, _upper: string) =>
              Promise.resolve({
                data: requestedFrom === yesterdayStart ? fixtures.yesterdaySales : [],
                error: null,
              })
            ),
          }
        }),
      } as any
    }

    return {} as any
  })
}

describe('getCashSummary — float carry-forward math', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("carries yesterday's leftover cash forward as today's starting float", async () => {
    mockSupabaseFor({
      todayEntries: [],
      yesterdayEntries: [{ type: 'float', amount: 500, is_voided: false }],
      yesterdaySales: [{ total_amount: 200 }],
      todaySales: [],
    })

    const summary = await getCashSummary()

    // cashFloat = yesterdayFloat(500) + yesterdayCashSales(200) + cashIn(0) - cashOut(0) = 700
    expect(summary.cashFloat).toBe(700)
  })

  it('adds today\'s cash sales on top of the carried-forward float', async () => {
    mockSupabaseFor({
      todayEntries: [],
      yesterdayEntries: [{ type: 'float', amount: 300, is_voided: false }],
      yesterdaySales: [],
      todaySales: [{ total_amount: 150 }],
    })

    const summary = await getCashSummary()

    expect(summary.cashFloat).toBe(300) // carried forward, unaffected by today's sales
    expect(summary.todayCashSales).toBe(150)
    expect(summary.cashOnHand).toBe(450) // 300 float + 150 today's sales
  })

  it('accounts for cash_in and cash_out entries today', async () => {
    mockSupabaseFor({
      todayEntries: [
        { type: 'cash_in', amount: 100, is_voided: false },
        { type: 'cash_out', amount: 40, is_voided: false },
      ],
      yesterdayEntries: [{ type: 'float', amount: 200, is_voided: false }],
      yesterdaySales: [],
      todaySales: [],
    })

    const summary = await getCashSummary()

    expect(summary.totalCashIn).toBe(100)
    expect(summary.totalCashOut).toBe(40)
    expect(summary.cashOnHand).toBe(260) // 200 float + 0 sales + 100 in - 40 out
  })

  it('ignores voided cash_register entries when computing totals', async () => {
    mockSupabaseFor({
      todayEntries: [
        { type: 'cash_in', amount: 500, is_voided: true }, // should be excluded
        { type: 'cash_in', amount: 50, is_voided: false },
      ],
      yesterdayEntries: [],
      yesterdaySales: [],
      todaySales: [],
    })

    const summary = await getCashSummary()

    expect(summary.totalCashIn).toBe(50)
  })

  it('never returns a negative cash float or cash on hand', async () => {
    mockSupabaseFor({
      todayEntries: [{ type: 'cash_out', amount: 10000, is_voided: false }],
      yesterdayEntries: [],
      yesterdaySales: [],
      todaySales: [],
    })

    const summary = await getCashSummary()

    expect(summary.cashFloat).toBeGreaterThanOrEqual(0)
    expect(summary.cashOnHand).toBeGreaterThanOrEqual(0)
  })
})