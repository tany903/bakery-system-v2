// lib/restock-requests.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import {
  createRestockRequest,
  autoGenerateLowStockRequests,
  fulfillRequest,
  getRestockStats,
} from './restock-requests'

// =============================================
// createRestockRequest
// =============================================

describe('createRestockRequest — guards and math', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws when items is an empty array', async () => {
    await expect(
      createRestockRequest([], 'manual_order', 'user-1')
    ).rejects.toThrow('At least one item is required')
  })

  function mockCreateFlow({
    insertedRequestId = 'req-1',
    itemsInsertError = null as any,
  } = {}) {
    const capturedRequestInsert: any[] = []
    const capturedItemsInsert: any[] = []
    let deletedId: string | undefined

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'restock_requests') {
        return {
          insert: vi.fn((payload: any) => {
            capturedRequestInsert.push(payload)
            const builder: any = {}
            builder.select = vi.fn(() => builder)
            builder.single = vi.fn(() =>
              Promise.resolve({ data: { id: insertedRequestId, ...payload }, error: null })
            )
            return builder
          }),
          delete: vi.fn(() => ({
            eq: vi.fn((_col: string, val: string) => {
              deletedId = val
              return Promise.resolve({ error: null })
            }),
          })),
        } as any
      }
      if (table === 'restock_request_items') {
        return {
          insert: vi.fn((rows: any[]) => {
            capturedItemsInsert.push(...rows)
            return Promise.resolve({ error: itemsInsertError })
          }),
        } as any
      }
      return {} as any
    })

    return { capturedRequestInsert, capturedItemsInsert, getDeletedId: () => deletedId }
  }

  it('sums requested_quantity across items into the parent request total', async () => {
    const { capturedRequestInsert } = mockCreateFlow()

    await createRestockRequest(
      [
        { product_id: 'p1', requested_quantity: 5 },
        { product_id: 'p2', requested_quantity: 3 },
      ],
      'manual_order',
      'user-1'
    )

    expect(capturedRequestInsert[0].requested_quantity).toBe(8)
  })

  it("sets product_id to the item's product_id when there is exactly one item", async () => {
    const { capturedRequestInsert } = mockCreateFlow()

    await createRestockRequest([{ product_id: 'p1', requested_quantity: 5 }], 'manual_order', 'user-1')

    expect(capturedRequestInsert[0].product_id).toBe('p1')
  })

  it('sets product_id to null when there are multiple items (multi-product request)', async () => {
    const { capturedRequestInsert } = mockCreateFlow()

    await createRestockRequest(
      [
        { product_id: 'p1', requested_quantity: 5 },
        { product_id: 'p2', requested_quantity: 3 },
      ],
      'manual_order',
      'user-1'
    )

    expect(capturedRequestInsert[0].product_id).toBeNull()
  })

  it('inserts one item row per item, defaulting notes to null when omitted', async () => {
    const { capturedItemsInsert } = mockCreateFlow({ insertedRequestId: 'req-42' })

    await createRestockRequest(
      [
        { product_id: 'p1', requested_quantity: 5, notes: 'urgent' },
        { product_id: 'p2', requested_quantity: 3 },
      ],
      'manual_order',
      'user-1'
    )

    expect(capturedItemsInsert).toEqual([
      { restock_request_id: 'req-42', product_id: 'p1', requested_quantity: 5, notes: 'urgent' },
      { restock_request_id: 'req-42', product_id: 'p2', requested_quantity: 3, notes: null },
    ])
  })

  it('rolls back (deletes) the parent request if inserting items fails', async () => {
    const { getDeletedId } = mockCreateFlow({
      insertedRequestId: 'req-99',
      itemsInsertError: { message: 'items insert failed' },
    })

    await expect(
      createRestockRequest([{ product_id: 'p1', requested_quantity: 5 }], 'manual_order', 'user-1')
    ).rejects.toEqual({ message: 'items insert failed' })

    expect(getDeletedId()).toBe('req-99')
  })
})

// =============================================
// autoGenerateLowStockRequests
// =============================================

describe('autoGenerateLowStockRequests — threshold and dedup logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  interface Fixtures {
    products: Array<{ id: string; name: string; shop_current_stock: number; shop_minimum_threshold: number }>
    activeRequestIds: string[]
    activeItemsProductIds: string[]
  }

  function mockAutoFlow(fixtures: Fixtures) {
    const capturedItemsInsert: any[] = []

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'products') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: fixtures.products, error: null })),
          })),
        } as any
      }
      if (table === 'restock_requests') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() =>
              Promise.resolve({ data: fixtures.activeRequestIds.map(id => ({ id })), error: null })
            ),
          })),
          insert: vi.fn((payload: any) => {
            const builder: any = {}
            builder.select = vi.fn(() => builder)
            builder.single = vi.fn(() =>
              Promise.resolve({ data: { id: 'batch-req-1', ...payload }, error: null })
            )
            return builder
          }),
        } as any
      }
      if (table === 'restock_request_items') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() =>
              Promise.resolve({
                data: fixtures.activeItemsProductIds.map(pid => ({ product_id: pid })),
                error: null,
              })
            ),
          })),
          insert: vi.fn((rows: any[]) => {
            capturedItemsInsert.push(...rows)
            return Promise.resolve({ error: null })
          }),
        } as any
      }
      return {} as any
    })

    return { capturedItemsInsert }
  }

  it('returns no requests when no product is below its minimum threshold', async () => {
    mockAutoFlow({
      products: [{ id: 'p1', name: 'Bread', shop_current_stock: 10, shop_minimum_threshold: 5 }],
      activeRequestIds: [],
      activeItemsProductIds: [],
    })

    const result = await autoGenerateLowStockRequests('user-1')

    expect(result).toEqual([])
  })

  it('treats stock exactly AT the minimum threshold as not low (strict less-than boundary)', async () => {
    mockAutoFlow({
      products: [{ id: 'p1', name: 'Bread', shop_current_stock: 5, shop_minimum_threshold: 5 }],
      activeRequestIds: [],
      activeItemsProductIds: [],
    })

    const result = await autoGenerateLowStockRequests('user-1')

    expect(result).toEqual([])
  })

  it('creates a batched request for low-stock products with quantity = threshold minus current stock', async () => {
    const { capturedItemsInsert } = mockAutoFlow({
      products: [{ id: 'p1', name: 'Bread', shop_current_stock: 2, shop_minimum_threshold: 10 }],
      activeRequestIds: [],
      activeItemsProductIds: [],
    })

    const result = await autoGenerateLowStockRequests('user-1')

    expect(result).toHaveLength(1)
    expect(capturedItemsInsert).toEqual([
      expect.objectContaining({ product_id: 'p1', requested_quantity: 8 }),
    ])
  })

  it('excludes a low-stock product that already has an active pending restock request', async () => {
    mockAutoFlow({
      products: [{ id: 'p1', name: 'Bread', shop_current_stock: 2, shop_minimum_threshold: 10 }],
      activeRequestIds: ['req-x'],
      activeItemsProductIds: ['p1'],
    })

    const result = await autoGenerateLowStockRequests('user-1')

    expect(result).toEqual([])
  })

  it('creates a request only for the eligible subset when some low-stock products are already pending', async () => {
    const { capturedItemsInsert } = mockAutoFlow({
      products: [
        { id: 'p1', name: 'Bread', shop_current_stock: 2, shop_minimum_threshold: 10 }, // already pending
        { id: 'p2', name: 'Croissant', shop_current_stock: 1, shop_minimum_threshold: 6 }, // eligible
      ],
      activeRequestIds: ['req-x'],
      activeItemsProductIds: ['p1'],
    })

    const result = await autoGenerateLowStockRequests('user-1')

    expect(result).toHaveLength(1)
    expect(capturedItemsInsert).toEqual([
      expect.objectContaining({ product_id: 'p2', requested_quantity: 5 }),
    ])
  })
})

// =============================================
// fulfillRequest
// =============================================

describe('fulfillRequest — fulfilled vs partially_fulfilled status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  interface FulfillFixtures {
    request: {
      id: string
      requested_quantity: number
      items: Array<{ id: string; product_id: string; requested_quantity: number }>
    }
    products?: Record<string, { name: string; production_current_stock: number; shop_current_stock: number }>
  }

  function mockFulfillFlow(fixtures: FulfillFixtures) {
    const capturedRequestUpdate: any[] = []
    const capturedItemUpdates: { id: string; payload: any }[] = []
    const capturedProductUpdates: { id: string; payload: any }[] = []

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'restock_requests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: fixtures.request, error: null })),
            })),
          })),
          update: vi.fn((payload: any) => {
            capturedRequestUpdate.push(payload)
            return { eq: vi.fn(() => Promise.resolve({ error: null })) }
          }),
        } as any
      }
      if (table === 'restock_request_items') {
        return {
          update: vi.fn((payload: any) => ({
            eq: vi.fn((_col: string, id: string) => {
              capturedItemUpdates.push({ id, payload })
              return Promise.resolve({ error: null })
            }),
          })),
        } as any
      }
      if (table === 'products') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, id: string) => ({
              single: vi.fn(() => {
                const p = fixtures.products?.[id]
                return Promise.resolve(
                  p
                    ? { data: { id, name: p.name, production_current_stock: p.production_current_stock, shop_current_stock: p.shop_current_stock }, error: null }
                    : { data: null, error: { message: 'not found' } }
                )
              }),
            })),
          })),
          update: vi.fn((payload: any) => ({
            eq: vi.fn((_col: string, id: string) => {
              capturedProductUpdates.push({ id, payload })
              return Promise.resolve({ error: null })
            }),
          })),
        } as any
      }
      if (table === 'inventory_transactions') {
        return {
          insert: vi.fn(() => Promise.resolve({ error: null })),
        } as any
      }
      return {} as any
    })

    return { capturedRequestUpdate, capturedItemUpdates, capturedProductUpdates }
  }

  it('marks the request fulfilled when fulfilledQuantity meets the total requested', async () => {
    const { capturedRequestUpdate } = mockFulfillFlow({
      request: { id: 'req-1', requested_quantity: 10, items: [] },
    })

    await fulfillRequest('req-1', 10, 'user-1')

    expect(capturedRequestUpdate[0].status).toBe('fulfilled')
  })

  it('marks the request partially_fulfilled when fulfilledQuantity is less than the total requested', async () => {
    const { capturedRequestUpdate } = mockFulfillFlow({
      request: { id: 'req-1', requested_quantity: 10, items: [] },
    })

    await fulfillRequest('req-1', 6, 'user-1')

    expect(capturedRequestUpdate[0].status).toBe('partially_fulfilled')
  })

  it('throws "Request not found" when the request lookup returns no data', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'restock_requests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        } as any
      }
      return {} as any
    })

    await expect(fulfillRequest('missing', 5, 'user-1')).rejects.toThrow('Request not found')
  })

  it('updates per-item fulfilled quantities when itemFulfillments is provided', async () => {
    const { capturedItemUpdates } = mockFulfillFlow({
      request: { id: 'req-1', requested_quantity: 10, items: [] },
    })

    await fulfillRequest('req-1', 10, 'user-1', undefined, [
      { item_id: 'item-1', quantity: 4 },
      { item_id: 'item-2', quantity: 6 },
    ])

    expect(capturedItemUpdates).toEqual([
      { id: 'item-1', payload: { fulfilled_quantity: 4 } },
      { id: 'item-2', payload: { fulfilled_quantity: 6 } },
    ])
  })

  it("transfers stock using the item's requested_quantity when no itemFulfillments override is given", async () => {
    const { capturedProductUpdates } = mockFulfillFlow({
      request: {
        id: 'req-1',
        requested_quantity: 5,
        items: [{ id: 'item-1', product_id: 'prod-1', requested_quantity: 5 }],
      },
      products: { 'prod-1': { name: 'Croissant', production_current_stock: 20, shop_current_stock: 3 } },
    })

    await fulfillRequest('req-1', 5, 'user-1')

    const update = capturedProductUpdates.find(u => u.id === 'prod-1')
    expect(update?.payload).toEqual({ production_current_stock: 15, shop_current_stock: 8 })
  })

  it('uses the itemFulfillments override quantity for the stock transfer instead of requested_quantity', async () => {
    const { capturedProductUpdates } = mockFulfillFlow({
      request: {
        id: 'req-1',
        requested_quantity: 5,
        items: [{ id: 'item-1', product_id: 'prod-1', requested_quantity: 5 }],
      },
      products: { 'prod-1': { name: 'Croissant', production_current_stock: 20, shop_current_stock: 3 } },
    })

    await fulfillRequest('req-1', 3, 'user-1', undefined, [{ item_id: 'item-1', quantity: 3 }])

    const update = capturedProductUpdates.find(u => u.id === 'prod-1')
    expect(update?.payload).toEqual({ production_current_stock: 17, shop_current_stock: 6 })
  })

  it('throws when production stock is insufficient to cover the transfer', async () => {
    mockFulfillFlow({
      request: {
        id: 'req-1',
        requested_quantity: 10,
        items: [{ id: 'item-1', product_id: 'prod-1', requested_quantity: 10 }],
      },
      products: { 'prod-1': { name: 'Croissant', production_current_stock: 4, shop_current_stock: 3 } },
    })

    await expect(fulfillRequest('req-1', 10, 'user-1')).rejects.toThrow(/Insufficient production stock/)
  })

  it('skips the stock transfer entirely when an item is fulfilled with zero quantity', async () => {
    const { capturedProductUpdates } = mockFulfillFlow({
      request: {
        id: 'req-1',
        requested_quantity: 5,
        items: [{ id: 'item-1', product_id: 'prod-1', requested_quantity: 5 }],
      },
      products: { 'prod-1': { name: 'Croissant', production_current_stock: 20, shop_current_stock: 3 } },
    })

    await fulfillRequest('req-1', 0, 'user-1', undefined, [{ item_id: 'item-1', quantity: 0 }])

    expect(capturedProductUpdates).toHaveLength(0)
  })
})

// =============================================
// getRestockStats
// =============================================

describe('getRestockStats — status aggregation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockStats(data: Array<{ status: string }> | null) {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'restock_requests') {
        return {
          select: vi.fn(() => Promise.resolve({ data, error: null })),
        } as any
      }
      return {} as any
    })
  }

  it('counts each status bucket correctly across a mixed set', async () => {
    mockStats([
      { status: 'requested' },
      { status: 'requested' },
      { status: 'acknowledged' },
      { status: 'in_progress' },
      { status: 'fulfilled' },
      { status: 'fulfilled' },
      { status: 'fulfilled' },
      { status: 'partially_fulfilled' },
      { status: 'declined' },
    ])

    const stats = await getRestockStats()

    expect(stats).toEqual({
      total: 9,
      requested: 2,
      acknowledged: 1,
      inProgress: 1,
      fulfilled: 3,
      partial: 1,
      declined: 1,
    })
  })

  it('returns all-zero stats for an empty result set', async () => {
    mockStats([])

    const stats = await getRestockStats()

    expect(stats).toEqual({
      total: 0,
      requested: 0,
      acknowledged: 0,
      inProgress: 0,
      fulfilled: 0,
      partial: 0,
      declined: 0,
    })
  })

  it('handles a null data response defensively (no throw, all-zero stats)', async () => {
    mockStats(null)

    const stats = await getRestockStats()

    expect(stats.total).toBe(0)
    expect(stats.requested).toBe(0)
  })

  it('does not miscount or crash on an unrecognized status value', async () => {
    mockStats([{ status: 'requested' }, { status: 'some_future_status' as any }])

    const stats = await getRestockStats()

    // total still reflects every row, but the unrecognized status isn't
    // attributed to any bucket (no default case in the switch)
    expect(stats.total).toBe(2)
    expect(stats.requested).toBe(1)
    const bucketSum =
      stats.requested + stats.acknowledged + stats.inProgress + stats.fulfilled + stats.partial + stats.declined
    expect(bucketSum).toBe(1)
  })
})