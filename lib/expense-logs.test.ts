// lib/expense-logs.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import { logExpenseEvent } from './expense-logs'

function mockInsert(result: { error: any } | null, opts: { throwSync?: boolean } = {}) {
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'expense_logs') {
      return {
        insert: vi.fn((_payload: any) => {
          if (opts.throwSync) {
            throw new Error('network exploded')
          }
          return Promise.resolve(result ?? { error: null })
        }),
      } as any
    }
    return {} as any
  })
}

function baseParams(overrides: Partial<Parameters<typeof logExpenseEvent>[0]> = {}) {
  return {
    expenseId: 'exp-1',
    action: 'created' as const,
    performedBy: 'user-1',
    expenseName: 'Flour',
    amount: 150,
    expenseDate: '2026-03-01',
    categoryId: 'cat-1',
    notes: 'Bulk purchase',
    ...overrides,
  }
}

describe('logExpenseEvent — payload shape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts a row with the params mapped to their snake_case columns', async () => {
    let captured: any = null
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'expense_logs') {
        return {
          insert: vi.fn((payload: any) => {
            captured = payload
            return Promise.resolve({ error: null })
          }),
        } as any
      }
      return {} as any
    })

    await logExpenseEvent(baseParams())

    expect(captured).toEqual({
      expense_id: 'exp-1',
      action: 'created',
      performed_by: 'user-1',
      expense_name: 'Flour',
      amount: 150,
      expense_date: '2026-03-01',
      category_id: 'cat-1',
      notes: 'Bulk purchase',
    })
  })

  it('defaults categoryId and notes to null when omitted', async () => {
    let captured: any = null
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'expense_logs') {
        return {
          insert: vi.fn((payload: any) => {
            captured = payload
            return Promise.resolve({ error: null })
          }),
        } as any
      }
      return {} as any
    })

    await logExpenseEvent(baseParams({ categoryId: undefined, notes: undefined }))

    expect(captured.category_id).toBeNull()
    expect(captured.notes).toBeNull()
  })

  it('passes expenseId through as null for actions with no linked expense yet', async () => {
    let captured: any = null
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'expense_logs') {
        return {
          insert: vi.fn((payload: any) => {
            captured = payload
            return Promise.resolve({ error: null })
          }),
        } as any
      }
      return {} as any
    })

    await logExpenseEvent(baseParams({ expenseId: null }))

    expect(captured.expense_id).toBeNull()
  })
})

describe('logExpenseEvent — never throws (fire-and-forget logging)', () => {
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
    consoleSpy.mockClear()
  })

  it('resolves normally on a successful insert', async () => {
    mockInsert({ error: null })

    await expect(logExpenseEvent(baseParams())).resolves.toBeUndefined()
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('resolves (does not throw/reject) when Supabase returns an error', async () => {
    mockInsert({ error: { message: 'insert failed' } })

    await expect(logExpenseEvent(baseParams())).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith('Failed to log expense event:', { message: 'insert failed' })
  })

  it('resolves (does not throw/reject) when the insert call throws synchronously', async () => {
    mockInsert(null, { throwSync: true })

    await expect(logExpenseEvent(baseParams())).resolves.toBeUndefined()
    expect(consoleSpy).toHaveBeenCalledWith('Failed to log expense event:', expect.any(Error))
  })

  it('logs each of the four action types without throwing', async () => {
    mockInsert({ error: null })

    for (const action of ['created', 'archived', 'restored', 'updated'] as const) {
      await expect(logExpenseEvent(baseParams({ action }))).resolves.toBeUndefined()
    }
  })
})