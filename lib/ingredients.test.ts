// lib/ingredients.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { adjustIngredientStock } from './ingredients'

function mockSupabaseFor(currentStock: number, capture: { updatePayload: any; procurementInsert: any }) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'ingredients') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'ing-1', name: 'Flour', current_stock: currentStock, minimum_threshold: 10 },
          error: null,
        }),
        update: vi.fn((payload: any) => {
          capture.updatePayload = payload
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      } as any
    }
    if (table === 'ingredient_procurement') {
      return {
        insert: vi.fn((payload: any) => {
          capture.procurementInsert = payload
          return Promise.resolve({ error: null })
        }),
      } as any
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any
  })
}

describe('adjustIngredientStock — guards', () => {
  let capture: { updatePayload: any; procurementInsert: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { updatePayload: null, procurementInsert: null }
  })

  it('throws when the adjustment would take stock below zero', async () => {
    mockSupabaseFor(10, capture) // current stock = 10

    await expect(
      adjustIngredientStock('ing-1', -15, 'user-1', 'too much removed')
    ).rejects.toThrow('Insufficient stock')
  })

  it('allows an adjustment that brings stock exactly to zero', async () => {
    mockSupabaseFor(10, capture)

    await expect(
      adjustIngredientStock('ing-1', -10, 'user-1', 'used it all')
    ).resolves.toBeUndefined()

    expect(capture.updatePayload.current_stock).toBe(0)
  })

  it('correctly adds stock for a positive adjustment', async () => {
    mockSupabaseFor(10, capture)

    await adjustIngredientStock('ing-1', 25, 'user-1', 'restocked')

    expect(capture.updatePayload.current_stock).toBe(35)
  })
})

describe('adjustIngredientStock — procurement logging', () => {
  let capture: { updatePayload: any; procurementInsert: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { updatePayload: null, procurementInsert: null }
  })

  it('logs a positive quantity with no [REMOVAL] prefix for additions', async () => {
    mockSupabaseFor(10, capture)

    await adjustIngredientStock('ing-1', 20, 'user-1', 'delivery received')

    expect(capture.procurementInsert.quantity).toBe(20)
    expect(capture.procurementInsert.notes).toBe('delivery received')
  })

  it('logs a negative quantity with [REMOVAL] prefix for removals', async () => {
    mockSupabaseFor(20, capture)

    await adjustIngredientStock('ing-1', -5, 'user-1', 'spoiled batch')

    expect(capture.procurementInsert.quantity).toBe(-5)
    expect(capture.procurementInsert.notes).toBe('[REMOVAL] spoiled batch')
  })

  it('uses bare [REMOVAL] tag when no notes are given for a removal', async () => {
    mockSupabaseFor(20, capture)

    await adjustIngredientStock('ing-1', -5, 'user-1')

    expect(capture.procurementInsert.notes).toBe('[REMOVAL]')
  })
})