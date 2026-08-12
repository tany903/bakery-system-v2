// lib/purchase-orders.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { createPurchaseOrder, type NewPOItem } from './purchase-orders'

// createPurchaseOrder calls adjustIngredientStock indirectly via receivePurchaseOrder
// in other flows, but createPurchaseOrder itself only touches purchase_orders
// and purchase_order_items — so we only need to mock those two tables plus rpc.

function makeItem(overrides: Partial<NewPOItem> = {}): NewPOItem {
  return {
    ingredient_id: 'ing-1',
    ingredient_name_snapshot: 'Flour',
    unit: 'kg',
    quantity_ordered: 10,
    unit_cost: 25,
    ...overrides,
  }
}

function mockSupabaseFor(capture: { poInsert: any; itemsInsert: any }) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'purchase_orders') {
      return {
        insert: vi.fn((payload: any) => {
          capture.poInsert = payload
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'po-1', ...payload },
              error: null,
            }),
          }
        }),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      } as any
    }
    if (table === 'purchase_order_items') {
      return {
        insert: vi.fn((payload: any) => {
          capture.itemsInsert = payload
          return Promise.resolve({ error: null })
        }),
      } as any
    }
    return {} as any
  })
  vi.mocked(supabase.rpc).mockResolvedValue({ data: 42, error: null } as any)
}

describe('createPurchaseOrder — total calculation', () => {
  let capture: { poInsert: any; itemsInsert: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { poInsert: null, itemsInsert: null }
    mockSupabaseFor(capture)
  })

  it('calculates total_amount as sum of quantity * unit_cost across items', async () => {
    const items = [
      makeItem({ ingredient_id: 'ing-1', quantity_ordered: 10, unit_cost: 25 }), // 250
      makeItem({ ingredient_id: 'ing-2', quantity_ordered: 4, unit_cost: 50 }),  // 200
    ]

    await createPurchaseOrder(items, 'user-1', { supplier_name: 'ABC Supplies' })

    expect(capture.poInsert.total_amount).toBe(450)
  })

  it('sets each line item total_cost to quantity_ordered * unit_cost', async () => {
    const items = [
      makeItem({ ingredient_id: 'ing-1', quantity_ordered: 3, unit_cost: 15 }), // 45
    ]

    await createPurchaseOrder(items, 'user-1', { supplier_name: 'ABC Supplies' })

    expect(capture.itemsInsert[0].total_cost).toBe(45)
  })

  it('initializes quantity_received to 0 for every new line item', async () => {
    const items = [makeItem(), makeItem({ ingredient_id: 'ing-2' })]

    await createPurchaseOrder(items, 'user-1', { supplier_name: 'ABC Supplies' })

    expect(capture.itemsInsert.every((i: any) => i.quantity_received === 0)).toBe(true)
  })

  it('sets a new purchase order to draft status', async () => {
    const items = [makeItem()]

    await createPurchaseOrder(items, 'user-1', { supplier_name: 'ABC Supplies' })

    expect(capture.poInsert.status).toBe('draft')
  })

  it('handles a single-item order correctly', async () => {
    const items = [makeItem({ quantity_ordered: 1, unit_cost: 99.5 })]

    await createPurchaseOrder(items, 'user-1', { supplier_name: 'ABC Supplies' })

    expect(capture.poInsert.total_amount).toBe(99.5)
  })
})

describe('createPurchaseOrder — rollback on item insert failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the parent PO if inserting line items fails', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'purchase_orders') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'po-1' }, error: null }),
          }),
          delete: vi.fn().mockReturnValue({ eq: deleteEq }),
        } as any
      }
      if (table === 'purchase_order_items') {
        return {
          insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
        } as any
      }
      return {} as any
    })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 1, error: null } as any)

    const items = [makeItem()]

    await expect(
      createPurchaseOrder(items, 'user-1', { supplier_name: 'ABC Supplies' })
    ).rejects.toBeTruthy()

    // Confirm the rollback delete was actually attempted
    expect(deleteEq).toHaveBeenCalledWith('id', 'po-1')
  })
})