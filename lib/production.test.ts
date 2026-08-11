// lib/production.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { recordProduction, getTodaysProductionStats, getTodaysProductionRecords } from './production'

// =============================================
// recordProduction
// =============================================

describe('recordProduction — stock math, guard, and logging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockRecordProductionFlow({
    product,
    productionInsertId = 'prod-rec-1',
  }: {
    product: { id: string; production_current_stock: number } | null
    productionInsertId?: string
  }) {
    const capturedProductUpdate: { id: string; payload: any }[] = []
    const capturedProductionInsert: any[] = []
    const capturedTransactions: any[] = []

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: product,
                  error: product ? null : { message: 'not found' },
                })
              ),
            })),
          })),
          update: vi.fn((payload: any) => ({
            eq: vi.fn((_col: string, id: string) => {
              capturedProductUpdate.push({ id, payload })
              return Promise.resolve({ error: null })
            }),
          })),
        } as any
      }
      if (table === 'production') {
        return {
          insert: vi.fn((payload: any) => {
            capturedProductionInsert.push(payload)
            const builder: any = {}
            builder.select = vi.fn(() => builder)
            builder.single = vi.fn(() =>
              Promise.resolve({ data: { id: productionInsertId, ...payload }, error: null })
            )
            return builder
          }),
        } as any
      }
      if (table === 'inventory_transactions') {
        return {
          insert: vi.fn((payload: any) => {
            capturedTransactions.push(payload)
            return Promise.resolve({ error: null })
          }),
        } as any
      }
      return {} as any
    })

    return { capturedProductUpdate, capturedProductionInsert, capturedTransactions }
  }

  it('throws "Product not found" when the product does not exist', async () => {
    mockRecordProductionFlow({ product: null })

    await expect(recordProduction('missing', 10, 'user-1')).rejects.toThrow('Product not found')
  })

  it('adds the produced quantity onto the current production stock', async () => {
    const { capturedProductUpdate } = mockRecordProductionFlow({
      product: { id: 'p1', production_current_stock: 50 },
    })

    await recordProduction('p1', 20, 'user-1')

    expect(capturedProductUpdate[0]).toEqual({
      id: 'p1',
      payload: { production_current_stock: 70 },
    })
  })

  it('records a production entry with the correct fields, defaulting notes to null when omitted', async () => {
    const { capturedProductionInsert } = mockRecordProductionFlow({
      product: { id: 'p1', production_current_stock: 0 },
    })

    await recordProduction('p1', 15, 'user-2')

    expect(capturedProductionInsert[0]).toEqual({
      product_id: 'p1',
      quantity_produced: 15,
      produced_by: 'user-2',
      notes: null,
    })
  })

  it('preserves provided notes on the production entry', async () => {
    const { capturedProductionInsert } = mockRecordProductionFlow({
      product: { id: 'p1', production_current_stock: 0 },
    })

    await recordProduction('p1', 15, 'user-2', 'Morning batch')

    expect(capturedProductionInsert[0].notes).toBe('Morning batch')
  })

  it('logs an inventory transaction reflecting the stock change (before/change/after)', async () => {
    const { capturedTransactions } = mockRecordProductionFlow({
      product: { id: 'p1', production_current_stock: 30 },
    })

    await recordProduction('p1', 5, 'user-1', 'Morning batch')

    expect(capturedTransactions[0]).toEqual({
      product_id: 'p1',
      transaction_type: 'production',
      location: 'production',
      quantity_before: 30,
      quantity_change: 5,
      quantity_after: 35,
      notes: 'Morning batch',
      performed_by: 'user-1',
    })
  })

  it("falls back to 'Production recorded' as the transaction note when no notes are given", async () => {
    const { capturedTransactions } = mockRecordProductionFlow({
      product: { id: 'p1', production_current_stock: 10 },
    })

    await recordProduction('p1', 5, 'user-1')

    expect(capturedTransactions[0].notes).toBe('Production recorded')
  })
})

// =============================================
// getTodaysProductionStats
// =============================================

describe('getTodaysProductionStats — aggregation logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockStatsFlow(records: any[] | null) {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'production') {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: records, error: null })),
            })),
          })),
        } as any
      }
      return {} as any
    })
  }

  it('returns all-zero stats with a null mostProducedProduct when there are no records', async () => {
    mockStatsFlow([])

    const stats = await getTodaysProductionStats()

    expect(stats).toEqual({
      totalProduced: 0,
      uniqueProducts: 0,
      productionSessions: 0,
      mostProducedProduct: null,
    })
  })

  it('handles a null data response defensively (no throw, all-zero stats)', async () => {
    mockStatsFlow(null)

    const stats = await getTodaysProductionStats()

    expect(stats.totalProduced).toBe(0)
    expect(stats.mostProducedProduct).toBeNull()
  })

  it('excludes voided production records from all aggregate totals (regression guard for the is_voided fix)', async () => {
    // The mock doesn't filter rows itself (Postgres does that in prod) — this
    // asserts the app-level query now requests is_voided=false, so a real DB
    // would never hand back a voided row to be summed into the stats.
    let capturedEqCalls: [string, any][] = []
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'production') {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              eq: vi.fn((col: string, val: any) => {
                capturedEqCalls.push([col, val])
                return Promise.resolve({
                  data: [{ quantity_produced: 10, products: { name: 'Bread' } }],
                  error: null,
                })
              }),
            })),
          })),
        } as any
      }
      return {} as any
    })

    await getTodaysProductionStats()

    expect(capturedEqCalls).toContainEqual(['is_voided', false])
  })

  it('sums totalProduced across all records and counts productionSessions', async () => {
    mockStatsFlow([
      { quantity_produced: 10, products: { name: 'Bread' } },
      { quantity_produced: 5, products: { name: 'Bread' } },
      { quantity_produced: 8, products: { name: 'Croissant' } },
    ])

    const stats = await getTodaysProductionStats()

    expect(stats.totalProduced).toBe(23)
    expect(stats.productionSessions).toBe(3)
  })

  it('counts uniqueProducts by distinct product name', async () => {
    mockStatsFlow([
      { quantity_produced: 10, products: { name: 'Bread' } },
      { quantity_produced: 5, products: { name: 'Bread' } },
      { quantity_produced: 8, products: { name: 'Croissant' } },
    ])

    const stats = await getTodaysProductionStats()

    expect(stats.uniqueProducts).toBe(2)
  })

  it('identifies the most produced product by summed quantity', async () => {
    mockStatsFlow([
      { quantity_produced: 10, products: { name: 'Bread' } },
      { quantity_produced: 5, products: { name: 'Bread' } },
      { quantity_produced: 8, products: { name: 'Croissant' } },
    ])

    const stats = await getTodaysProductionStats()

    expect(stats.mostProducedProduct).toEqual({ name: 'Bread', quantity: 15 })
  })

  it("falls back to 'Unknown' when a record has no linked product", async () => {
    mockStatsFlow([{ quantity_produced: 4, products: null }])

    const stats = await getTodaysProductionStats()

    expect(stats.uniqueProducts).toBe(1)
    expect(stats.mostProducedProduct).toEqual({ name: 'Unknown', quantity: 4 })
  })

  it('breaks quantity ties by keeping the last-encountered product (reduce with strict >)', async () => {
    mockStatsFlow([
      { quantity_produced: 10, products: { name: 'A' } },
      { quantity_produced: 10, products: { name: 'B' } },
    ])

    const stats = await getTodaysProductionStats()

    // reduce's comparator is `prev.quantity > curr.quantity ? prev : curr` —
    // strict `>` means a tie falls through to `curr`, so with more than one
    // tied product the LAST one encountered wins, not the first. This pins
    // down current behavior as a regression guard — not necessarily a
    // statement that it's the "right" tie-break rule. Worth a product
    // decision if ties matter in practice.
    expect(stats.mostProducedProduct).toEqual({ name: 'B', quantity: 10 })
  })
})

// =============================================
// getTodaysProductionRecords
// =============================================

describe('getTodaysProductionRecords — excludes voided rows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests is_voided = false alongside the today-boundary filter (used by the production floor dashboard)', async () => {
    // Regression guard: app/production/page.tsx feeds this straight into the
    // "Today's Production" list with no void styling — a voided entry
    // showing up there would look like real, uncounted stock. The mock
    // doesn't filter rows itself (Postgres does that in prod); this confirms
    // the app-level query actually asks for is_voided = false.
    const capturedEqCalls: [string, any][] = []
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'production') {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              eq: vi.fn((col: string, val: any) => {
                capturedEqCalls.push([col, val])
                return {
                  order: vi.fn(() => Promise.resolve({ data: [], error: null })),
                }
              }),
            })),
          })),
        } as any
      }
      return {} as any
    })

    await getTodaysProductionRecords()

    expect(capturedEqCalls).toContainEqual(['is_voided', false])
  })
})