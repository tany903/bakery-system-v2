// lib/disposals.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { createDisposal } from './disposals'

function mockSupabaseFor(currentStock: number, capture: { updatePayload: any; disposalInsert: any }) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'products') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'prod-1',
            name: 'Pandesal',
            shop_current_stock: currentStock,
            production_current_stock: currentStock,
          },
          error: null,
        }),
        update: vi.fn((payload: any) => {
          capture.updatePayload = payload
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      } as any
    }
    if (table === 'stock_disposals') {
      return {
        insert: vi.fn((payload: any) => {
          capture.disposalInsert = payload
          return Promise.resolve({ error: null })
        }),
      } as any
    }
    return {
      insert: vi.fn().mockResolvedValue({ error: null }),
    } as any
  })
}

describe('createDisposal — guards', () => {
  let capture: { updatePayload: any; disposalInsert: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { updatePayload: null, disposalInsert: null }
  })

  it('throws when disposing more than available stock', async () => {
    mockSupabaseFor(5, capture) // only 5 in stock

    await expect(
      createDisposal('prod-1', 'pullout', 'Mold / spoiled', 10, 'shop', 'user-1')
    ).rejects.toThrow('Only 5 units available')
  })

  it('allows disposing exactly all available stock', async () => {
    mockSupabaseFor(5, capture)

    await expect(
      createDisposal('prod-1', 'pullout', 'Expired', 5, 'shop', 'user-1')
    ).resolves.toBeUndefined()

    expect(capture.updatePayload.shop_current_stock).toBe(0)
  })

  it('deducts from the correct stock location (production, not shop)', async () => {
    mockSupabaseFor(20, capture)

    await createDisposal('prod-1', 'oth', 'Staff meal', 3, 'production', 'user-1')

    expect(capture.updatePayload.production_current_stock).toBe(17)
    expect(capture.updatePayload.shop_current_stock).toBeUndefined()
  })
})

describe('createDisposal — type/reason recorded correctly', () => {
  let capture: { updatePayload: any; disposalInsert: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { updatePayload: null, disposalInsert: null }
  })

  it('records a pullout disposal with its reason', async () => {
    mockSupabaseFor(20, capture)

    await createDisposal('prod-1', 'pullout', 'Dropped / damaged', 2, 'shop', 'user-1')

    expect(capture.disposalInsert.type).toBe('pullout')
    expect(capture.disposalInsert.reason).toBe('Dropped / damaged')
    expect(capture.disposalInsert.quantity).toBe(2)
  })

  it('records an on-the-house (oth) disposal separately from pullout', async () => {
    mockSupabaseFor(20, capture)

    await createDisposal('prod-1', 'oth', 'Customer goodwill', 1, 'shop', 'user-1')

    expect(capture.disposalInsert.type).toBe('oth')
  })
})