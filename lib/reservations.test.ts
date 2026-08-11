// lib/reservations.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { createReservation, type NewReservationItem } from './reservations'

function makeItem(overrides: Partial<NewReservationItem> = {}): NewReservationItem {
  return {
    product_id: 'prod-1',
    product_name: 'Pandesal',
    quantity: 2,
    unit_price: 50,
    ...overrides,
  }
}

// Builds a fake chainable Supabase response for a given table, capturing
// whatever gets passed to insert() so tests can assert on it.
function mockSupabaseFor(capture: { reservationInsert: any }) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'reservations') {
      return {
        insert: vi.fn((payload: any) => {
          capture.reservationInsert = payload
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'res-1', ...payload },
              error: null,
            }),
          }
        }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'res-1',
            customer_name: 'Test Customer',
            total_amount: capture.reservationInsert?.total_amount ?? 0,
            fee_amount: capture.reservationInsert?.fee_amount ?? 0,
            balance_amount: capture.reservationInsert?.balance_amount ?? 0,
            items: [],
          },
          error: null,
        }),
      } as any
    }
    if (table === 'reservation_items') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      } as any
    }
    return {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any
  })
}

describe('createReservation — validation', () => {
  it('throws if items array is empty', async () => {
    await expect(
      createReservation([], 'Maria Santos', 'user-1')
    ).rejects.toThrow('At least one item is required')
  })
})

describe('createReservation — fee/balance math', () => {
  let capture: { reservationInsert: any }

  beforeEach(() => {
    vi.clearAllMocks()
    capture = { reservationInsert: null }
    mockSupabaseFor(capture)
  })

  it('splits an even total exactly 50/50', async () => {
    const items = [makeItem({ quantity: 2, unit_price: 50 })] // total = 100

    await createReservation(items, 'Maria Santos', 'user-1')

    expect(capture.reservationInsert.total_amount).toBe(100)
    expect(capture.reservationInsert.fee_amount).toBe(50)
    expect(capture.reservationInsert.balance_amount).toBe(50)
  })

  it('sums multiple items correctly before splitting', async () => {
    const items = [
      makeItem({ product_id: 'prod-1', quantity: 3, unit_price: 20 }), // 60
      makeItem({ product_id: 'prod-2', quantity: 1, unit_price: 40 }), // 40
    ] // total = 100

    await createReservation(items, 'Maria Santos', 'user-1')

    expect(capture.reservationInsert.total_amount).toBe(100)
    expect(capture.reservationInsert.fee_amount).toBe(50)
    expect(capture.reservationInsert.balance_amount).toBe(50)
  })

  it('never loses or gains money to rounding — fee + balance always equals total', async () => {
    // Odd-cents total to stress-test the rounding logic
    const items = [makeItem({ quantity: 3, unit_price: 33.33 })] // total = 99.99

    await createReservation(items, 'Maria Santos', 'user-1')

    const { total_amount, fee_amount, balance_amount } = capture.reservationInsert
    expect(fee_amount + balance_amount).toBeCloseTo(total_amount, 2)
  })

  it('rounds fee and balance to 2 decimal places', async () => {
    const items = [makeItem({ quantity: 1, unit_price: 33.33 })] // total = 33.33

    await createReservation(items, 'Maria Santos', 'user-1')

    const { fee_amount, balance_amount } = capture.reservationInsert
    // No more than 2 decimal places on either value
    expect(Number(fee_amount.toFixed(2))).toBe(fee_amount)
    expect(Number(balance_amount.toFixed(2))).toBe(balance_amount)
  })
})