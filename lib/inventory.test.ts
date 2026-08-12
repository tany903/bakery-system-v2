// lib/inventory.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { adjustStock, transferStock } from './inventory'

function mockProductTable(product: any, capture: { updatePayload: any }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: product, error: null }),
    update: vi.fn((payload: any) => {
      capture.updatePayload = payload
      return { eq: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }
}

function baseProduct(overrides: any = {}) {
  return {
    id: 'prod-1',
    name: 'Pandesal',
    shop_current_stock: 10,
    production_current_stock: 20,
    shop_minimum_threshold: 5,
    production_minimum_threshold: 10,
    ...overrides,
  }
}

describe('adjustStock — guards', () => {
  let capture: { updatePayload: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { updatePayload: null }
  })

  it('throws when a negative adjustment would take shop stock below zero', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') return mockProductTable(baseProduct({ shop_current_stock: 5 }), capture) as any
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
    })

    await expect(
      adjustStock('prod-1', 'shop', -10, 'damaged goods', 'user-1')
    ).rejects.toThrow('Cannot reduce stock below 0')
  })

  it('allows an adjustment that brings shop stock exactly to zero', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') return mockProductTable(baseProduct({ shop_current_stock: 5 }), capture) as any
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
    })

    await expect(
      adjustStock('prod-1', 'shop', -5, 'sold out', 'user-1')
    ).resolves.toBeUndefined()

    expect(capture.updatePayload.shop_current_stock).toBe(0)
  })

  it('adjusts production stock independently of shop stock', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') return mockProductTable(baseProduct({ production_current_stock: 20 }), capture) as any
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
    })

    await adjustStock('prod-1', 'production', 15, 'baked more', 'user-1')

    expect(capture.updatePayload.production_current_stock).toBe(35)
    // Should not touch shop_current_stock at all
    expect(capture.updatePayload.shop_current_stock).toBeUndefined()
  })
})

describe('transferStock — guards', () => {
  let capture: { updatePayload: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { updatePayload: null }
  })

  it('throws when transferring more than available production stock', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') return mockProductTable(baseProduct({ production_current_stock: 5 }), capture) as any
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
    })

    await expect(
      transferStock('prod-1', 10, 'restocking shop', 'user-1')
    ).rejects.toThrow('Not enough stock in production')
  })

  it('moves stock correctly between production and shop', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return mockProductTable(
          baseProduct({ production_current_stock: 20, shop_current_stock: 10 }),
          capture
        ) as any
      }
      if (table === 'inventory_transfers') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'transfer-1' }, error: null }),
        } as any
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
    })

    await transferStock('prod-1', 8, 'restocking shop', 'user-1')

    expect(capture.updatePayload.production_current_stock).toBe(12) // 20 - 8
    expect(capture.updatePayload.shop_current_stock).toBe(18) // 10 + 8
  })

  it('allows transferring exactly all available production stock', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return mockProductTable(
          baseProduct({ production_current_stock: 10, shop_current_stock: 5 }),
          capture
        ) as any
      }
      if (table === 'inventory_transfers') {
        return {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'transfer-1' }, error: null }),
        } as any
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
    })

    await transferStock('prod-1', 10, 'clearing out production', 'user-1')

    expect(capture.updatePayload.production_current_stock).toBe(0)
    expect(capture.updatePayload.shop_current_stock).toBe(15)
  })
})