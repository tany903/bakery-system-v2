// lib/expenses.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from './supabase'
import {
  getAllExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  archiveExpenseCategory,
  getArchivedExpenseCategories,
  restoreExpenseCategory,
  deleteExpenseCategory,
  getAllExpenses,
  getArchivedExpenses,
  getExpensesByDateRange,
  createExpense,
  updateExpense,
  archiveExpense,
  restoreExpense,
  getMonthlyExpenseSummary,
} from './expenses'
import { logExpenseEvent } from './expense-logs'

vi.mock('./expense-logs', () => ({
  logExpenseEvent: vi.fn(),
}))

interface Fixtures {
  expenses?: any[]
  sales?: any[]
  categories?: any[]
}

interface CapturedArgs {
  expenses?: { gte?: string; lte?: string; eq?: Record<string, any> }
  sales?: { gte?: string; lt?: string }
}

function mockSupabaseFor(fixtures: Fixtures): CapturedArgs {
  const captured: CapturedArgs = {}

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'expenses') {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col: string, val: any) => {
          captured.expenses = captured.expenses || {}
          captured.expenses.eq = captured.expenses.eq || {}
          captured.expenses.eq[col] = val
          return builder
        }),
        gte: vi.fn((_col: string, gteVal: string) => {
          captured.expenses = captured.expenses || {}
          captured.expenses.gte = gteVal
          return builder
        }),
        lte: vi.fn((_col2: string, lteVal: string) => {
          captured.expenses = captured.expenses || {}
          captured.expenses.lte = lteVal
          return Promise.resolve({ data: fixtures.expenses || [], error: null })
        }),
        order: vi.fn().mockResolvedValue({ data: fixtures.expenses || [], error: null }),
        insert: vi.fn((data: any) => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-123', ...data },
              error: null,
            }),
          }),
        })),
        update: vi.fn((data: any) => ({
          eq: vi.fn((_col: string, idVal: string) => ({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: idVal,
                  name: data.name ?? 'Sample Expense',
                  amount: data.amount ?? 150,
                  expense_date: data.expense_date ?? '2026-03-01',
                  category_id: data.category_id ?? 'cat-1',
                  notes: data.notes ?? 'Note',
                },
                error: null,
              }),
            }),
          })),
        })),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
      return builder
    }

    if (table === 'sales') {
      return {
        select: vi.fn().mockReturnThis(),
        gte: vi.fn((_col: string, gteVal: string) => ({
          lt: vi.fn((_col2: string, ltVal: string) => {
            captured.sales = { gte: gteVal, lt: ltVal }
            return Promise.resolve({ data: fixtures.sales || [], error: null })
          }),
        })),
      } as any
    }

    if (table === 'expense_categories') {
      const catBuilder: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: fixtures.categories || [], error: null }),
        insert: vi.fn((data: any) => ({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'cat-123', ...data },
              error: null,
            }),
          }),
        })),
        update: vi.fn((data: any) => ({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'cat-123', ...data },
                error: null,
              }),
            }),
            then: (resolve: any) => resolve({ error: null }),
          }),
        })),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }
      return catBuilder
    }

    return {} as any
  })

  return captured
}

describe('EXPENSE CATEGORIES CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches non-archived expense categories ordered by name', async () => {
    const mockData = [{ id: '1', name: 'Rent', is_archived: false }]
    mockSupabaseFor({ categories: mockData })

    const res = await getAllExpenseCategories()
    expect(res).toEqual(mockData)
  })

  it('creates a new expense category', async () => {
    mockSupabaseFor({})
    const res = await createExpenseCategory('Utilities', 'Electric & Water')

    expect(res).toEqual({
      id: 'cat-123',
      name: 'Utilities',
      description: 'Electric & Water',
    })
  })

  it('updates an existing expense category', async () => {
    mockSupabaseFor({})
    const res = await updateExpenseCategory('cat-1', 'Updated Category')

    expect(res).toEqual({
      id: 'cat-123',
      name: 'Updated Category',
      description: null,
    })
  })

  it('archives an expense category', async () => {
    mockSupabaseFor({})
    await expect(archiveExpenseCategory('cat-1')).resolves.not.toThrow()
  })

  it('fetches archived expense categories', async () => {
    const mockData = [{ id: '2', name: 'Old Category', is_archived: true }]
    mockSupabaseFor({ categories: mockData })

    const res = await getArchivedExpenseCategories()
    expect(res).toEqual(mockData)
  })

  it('restores an archived expense category', async () => {
    mockSupabaseFor({})
    await expect(restoreExpenseCategory('cat-1')).resolves.not.toThrow()
  })

  it('deletes an expense category directly', async () => {
    mockSupabaseFor({})
    await expect(deleteExpenseCategory('cat-1')).resolves.not.toThrow()
  })
})

describe('EXPENSES CRUD & AUDIT LOGGING', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches active expenses', async () => {
    const mockData = [{ id: 'exp-1', name: 'Flour', amount: 500 }]
    mockSupabaseFor({ expenses: mockData })

    const res = await getAllExpenses()
    expect(res).toEqual(mockData)
  })

  it('fetches archived expenses', async () => {
    const mockData = [{ id: 'exp-2', name: 'Sugar', amount: 200, is_archived: true }]
    mockSupabaseFor({ expenses: mockData })

    const res = await getArchivedExpenses()
    expect(res).toEqual(mockData)
  })

  it('creates an expense and triggers audit logging', async () => {
    mockSupabaseFor({})

    const res = await createExpense('Baking Powder', 150, '2026-03-01', 'user-1', 'cat-1', 'Bulk purchase')

    expect(res.id).toBe('exp-123')
    expect(logExpenseEvent).toHaveBeenCalledWith({
      expenseId: 'exp-123',
      action: 'created',
      performedBy: 'user-1',
      expenseName: 'Baking Powder',
      amount: 150,
      expenseDate: '2026-03-01',
      categoryId: 'cat-1',
      notes: 'Bulk purchase',
    })
  })

  it('updates an expense and triggers audit logging', async () => {
    mockSupabaseFor({})

    await updateExpense('exp-1', { title: 'Updated Powder', amount: 180 }, 'user-1')

    expect(logExpenseEvent).toHaveBeenCalledWith({
      expenseId: 'exp-1',
      action: 'updated',
      performedBy: 'user-1',
      expenseName: 'Updated Powder',
      amount: 180,
      expenseDate: '2026-03-01',
      categoryId: 'cat-1',
      notes: 'Note',
    })
  })

  it('archives an expense (soft delete) and logs the event', async () => {
    mockSupabaseFor({})

    await archiveExpense('exp-1', 'user-1')

    expect(logExpenseEvent).toHaveBeenCalledWith({
      expenseId: 'exp-1',
      action: 'archived',
      performedBy: 'user-1',
      expenseName: 'Sample Expense',
      amount: 150,
      expenseDate: '2026-03-01',
      categoryId: 'cat-1',
      notes: 'Note',
    })
  })

  it('restores an archived expense and logs the event', async () => {
    mockSupabaseFor({})

    await restoreExpense('exp-1', 'user-1')

    expect(logExpenseEvent).toHaveBeenCalledWith({
      expenseId: 'exp-1',
      action: 'restored',
      performedBy: 'user-1',
      expenseName: 'Sample Expense',
      amount: 150,
      expenseDate: '2026-03-01',
      categoryId: 'cat-1',
      notes: 'Note',
    })
  })
})

describe('getMonthlyExpenseSummary — totals and net income', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sums expense amounts into totalExpenses and expenseCount', async () => {
    mockSupabaseFor({
      expenses: [
        { amount: 100, expense_categories: { name: 'Utilities' } },
        { amount: 250, expense_categories: { name: 'Rent' } },
      ],
      sales: [],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.totalExpenses).toBe(350)
    expect(summary.expenseCount).toBe(2)
  })

  it('sums sale totals into totalRevenue', async () => {
    mockSupabaseFor({
      expenses: [],
      sales: [{ total_amount: 500 }, { total_amount: 320 }],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.totalRevenue).toBe(820)
  })

  it('computes netIncome as revenue minus expenses (positive case)', async () => {
    mockSupabaseFor({
      expenses: [{ amount: 200, expense_categories: null }],
      sales: [{ total_amount: 900 }],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.netIncome).toBe(700)
  })

  it('computes netIncome correctly (and allows negative) when expenses exceed revenue', async () => {
    mockSupabaseFor({
      expenses: [{ amount: 1000, expense_categories: null }],
      sales: [{ total_amount: 300 }],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.netIncome).toBe(-700)
  })

  it('returns all-zero summary when there are no expenses or sales', async () => {
    mockSupabaseFor({ expenses: [], sales: [] })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.totalExpenses).toBe(0)
    expect(summary.totalRevenue).toBe(0)
    expect(summary.netIncome).toBe(0)
    expect(summary.expenseCount).toBe(0)
    expect(summary.expensesByCategory).toEqual([])
  })
})

describe('getMonthlyExpenseSummary — category grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('groups and sums expenses by category name', async () => {
    mockSupabaseFor({
      expenses: [
        { amount: 100, expense_categories: { name: 'Utilities' } },
        { amount: 50, expense_categories: { name: 'Utilities' } },
        { amount: 200, expense_categories: { name: 'Rent' } },
      ],
      sales: [],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    const utilities = summary.expensesByCategory.find(c => c.category === 'Utilities')
    const rent = summary.expensesByCategory.find(c => c.category === 'Rent')
    expect(utilities?.total).toBe(150)
    expect(rent?.total).toBe(200)
  })

  it("falls back to 'Uncategorized' when an expense has no category relation", async () => {
    mockSupabaseFor({
      expenses: [
        { amount: 75, expense_categories: null },
        { amount: 25, expense_categories: undefined },
      ],
      sales: [],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.expensesByCategory).toEqual([{ category: 'Uncategorized', total: 100 }])
  })

  it('sorts expensesByCategory descending by total', async () => {
    mockSupabaseFor({
      expenses: [
        { amount: 50, expense_categories: { name: 'Small' } },
        { amount: 500, expense_categories: { name: 'Big' } },
        { amount: 200, expense_categories: { name: 'Medium' } },
      ],
      sales: [],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.expensesByCategory.map(c => c.category)).toEqual(['Big', 'Medium', 'Small'])
  })
})

describe('getMonthlyExpenseSummary — month date-range boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes the correct start/end dates for a standard 31-day month (Jan 2026)', async () => {
    const captured = mockSupabaseFor({ expenses: [], sales: [] })

    await getMonthlyExpenseSummary(2026, 1)

    expect(captured.expenses?.gte).toBe('2026-01-01')
    expect(captured.expenses?.lte).toBe('2026-01-31')
  })

  it('computes the correct end date for February in a leap year (2024)', async () => {
    const captured = mockSupabaseFor({ expenses: [], sales: [] })

    await getMonthlyExpenseSummary(2024, 2)

    expect(captured.expenses?.gte).toBe('2024-02-01')
    expect(captured.expenses?.lte).toBe('2024-02-29')
  })

  it('computes the correct end date for February in a non-leap year (2026)', async () => {
    const captured = mockSupabaseFor({ expenses: [], sales: [] })

    await getMonthlyExpenseSummary(2026, 2)

    expect(captured.expenses?.gte).toBe('2026-02-01')
    expect(captured.expenses?.lte).toBe('2026-02-28')
  })

  it('handles December correctly without rolling into the wrong year', async () => {
    const captured = mockSupabaseFor({ expenses: [], sales: [] })

    await getMonthlyExpenseSummary(2026, 12)

    expect(captured.expenses?.gte).toBe('2026-12-01')
    expect(captured.expenses?.lte).toBe('2026-12-31')
  })
})

describe('getMonthlyExpenseSummary — sales revenue window (timestamptz boundary)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses an exclusive upper bound at the start of the next month, not midnight of the last day', async () => {
    const captured = mockSupabaseFor({ expenses: [], sales: [] })

    await getMonthlyExpenseSummary(2026, 3)

    expect(captured.sales?.gte).toBe(new Date(2026, 2, 1).toISOString())
    expect(captured.sales?.lt).toBe(new Date(2026, 3, 1).toISOString())
  })

  it('rolls the sales window into January of the following year for December', async () => {
    const captured = mockSupabaseFor({ expenses: [], sales: [] })

    await getMonthlyExpenseSummary(2026, 12)

    expect(captured.sales?.gte).toBe(new Date(2026, 11, 1).toISOString())
    expect(captured.sales?.lt).toBe(new Date(2027, 0, 1).toISOString())
  })

  it('includes a sale made late on the last day of the month in totalRevenue', async () => {
    const lateSaleOnLastDay = new Date(2026, 2, 31, 23, 59, 0)

    mockSupabaseFor({
      expenses: [],
      sales: [{ total_amount: 450, sale_date: lateSaleOnLastDay.toISOString() }],
    })

    const summary = await getMonthlyExpenseSummary(2026, 3)

    expect(summary.totalRevenue).toBe(450)
    expect(new Date(lateSaleOnLastDay.toISOString()).getTime()).toBeLessThan(
      new Date(new Date(2026, 3, 1).toISOString()).getTime()
    )
  })
})

describe('getExpensesByDateRange — date-boundary formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockExpensesTable(fixture: any[]): { gte?: string; lte?: string } {
    const captured: { gte?: string; lte?: string } = {}
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'expenses') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn((_col: string, gteVal: string) => {
            captured.gte = gteVal
            return {
              lte: vi.fn((_col2: string, lteVal: string) => {
                captured.lte = lteVal
                return {
                  order: vi.fn().mockResolvedValue({ data: fixture, error: null }),
                }
              }),
            }
          }),
        } as any
      }
      return {} as any
    })
    return captured
  }

  it('passes YYYY-MM-DD strings straight through to the query with no Date conversion', async () => {
    const captured = mockExpensesTable([])

    await getExpensesByDateRange('2026-03-01', '2026-03-31')

    expect(captured.gte).toBe('2026-03-01')
    expect(captured.lte).toBe('2026-03-31')
  })

  it('is timezone-agnostic by construction', async () => {
    const captured = mockExpensesTable([])

    await getExpensesByDateRange('2026-12-01', '2026-12-31')

    expect(captured.gte).toBe('2026-12-01')
    expect(captured.lte).toBe('2026-12-31')
  })
})