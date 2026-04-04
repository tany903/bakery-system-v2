import { supabase } from './supabase'
import { adjustIngredientStock } from './ingredients'
import { createExpense } from './expenses'

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  is_archived: boolean
  created_at: string
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  ingredient_id: string | null
  ingredient_name_snapshot: string
  unit: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: number
  total_cost: number
  notes: string | null
  created_at: string
}

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string | null
  supplier_name_snapshot: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'partially_received' | 'received' | 'cancelled'
  total_amount: number
  notes: string | null
  rejection_reason: string | null
  expected_delivery_date: string | null
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  received_by: string | null
  received_at: string | null
  expense_id: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderWithDetails extends PurchaseOrder {
  items: PurchaseOrderItem[]
  // Supabase returns joined data as unknown — explicitly typed here so pages don't need casts
  created_by_profile: { full_name: string } | null
  approved_by_profile: { full_name: string } | null
  received_by_profile: { full_name: string } | null
  suppliers: Supplier | null
}

export interface NewPOItem {
  ingredient_id: string
  ingredient_name_snapshot: string
  unit: string
  quantity_ordered: number
  unit_cost: number
  notes?: string
}

// =============================================
// SUPPLIERS
// =============================================

export async function getAllSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_archived', false)
    .order('name')
  if (error) throw error
  return data || []
}

export async function createSupplier(supplier: {
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
}): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: supplier.name,
      contact_person: supplier.contact_person || null,
      phone: supplier.phone || null,
      email: supplier.email || null,
      address: supplier.address || null,
      notes: supplier.notes || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSupplier(id: string, updates: Partial<Omit<Supplier, 'id' | 'created_at' | 'is_archived'>>): Promise<void> {
  const { error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
  if (error) throw error
}

export async function archiveSupplier(id: string): Promise<void> {
  const { error } = await supabase
    .from('suppliers')
    .update({ is_archived: true })
    .eq('id', id)
  if (error) throw error
}

// =============================================
// GENERATE PO NUMBER
// =============================================

async function generatePONumber(): Promise<string> {
  const { data, error } = await supabase.rpc('nextval', { seq: 'po_number_seq' })
  if (error || !data) {
    // Fallback: use timestamp
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `PO-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Date.now().toString().slice(-4)}`
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const now = new Date()
  return `PO-${now.getFullYear()}${pad(now.getMonth() + 1)}-${String(data).padStart(4, '0')}`
}

// =============================================
// CREATE PURCHASE ORDER
// =============================================

export async function createPurchaseOrder(
  items: NewPOItem[],
  createdBy: string,
  options: {
    supplier_id?: string
    supplier_name: string
    notes?: string
    expected_delivery_date?: string
  }
): Promise<PurchaseOrder> {
  const po_number = await generatePONumber()
  const total_amount = items.reduce((sum, i) => sum + i.quantity_ordered * i.unit_cost, 0)

  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .insert({
      po_number,
      supplier_id: options.supplier_id || null,
      supplier_name_snapshot: options.supplier_name,
      status: 'draft',
      total_amount,
      notes: options.notes || null,
      expected_delivery_date: options.expected_delivery_date || null,
      created_by: createdBy,
    })
    .select()
    .single()

  if (poError) throw poError

  const itemRows = items.map(item => ({
    purchase_order_id: po.id,
    ingredient_id: item.ingredient_id,
    ingredient_name_snapshot: item.ingredient_name_snapshot,
    unit: item.unit,
    quantity_ordered: item.quantity_ordered,
    quantity_received: 0,
    unit_cost: item.unit_cost,
    total_cost: item.quantity_ordered * item.unit_cost,
    notes: item.notes || null,
  }))

  const { error: itemsError } = await supabase
    .from('purchase_order_items')
    .insert(itemRows)

  if (itemsError) {
    await supabase.from('purchase_orders').delete().eq('id', po.id)
    throw itemsError
  }

  return po
}

// =============================================
// GET PURCHASE ORDERS
// =============================================

export async function getAllPurchaseOrders(): Promise<PurchaseOrderWithDetails[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      items:purchase_order_items (*),
      suppliers (*),
      created_by_profile:profiles!purchase_orders_created_by_fkey (full_name),
      approved_by_profile:profiles!purchase_orders_approved_by_fkey (full_name),
      received_by_profile:profiles!purchase_orders_received_by_fkey (full_name)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as unknown as PurchaseOrderWithDetails[]) || []
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrderWithDetails | null> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      items:purchase_order_items (*),
      suppliers (*),
      created_by_profile:profiles!purchase_orders_created_by_fkey (full_name),
      approved_by_profile:profiles!purchase_orders_approved_by_fkey (full_name),
      received_by_profile:profiles!purchase_orders_received_by_fkey (full_name)
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data as unknown as PurchaseOrderWithDetails
}

// =============================================
// STATUS TRANSITIONS
// =============================================

export async function submitPurchaseOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'submitted', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function approvePurchaseOrder(id: string, approvedBy: string): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function rejectPurchaseOrder(id: string, approvedBy: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({
      status: 'rejected',
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

export async function cancelPurchaseOrder(id: string): Promise<void> {
  const { error } = await supabase
    .from('purchase_orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// =============================================
// RECEIVE ITEMS — updates ingredient stock + creates expense
// =============================================

export async function receivePurchaseOrder(
  id: string,
  receivedBy: string,
  itemReceipts: { item_id: string; quantity_received: number }[],
  expenseCategoryId: string,
  paymentNotes?: string
): Promise<void> {
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .eq('id', id)
    .single()

  if (poError || !po) throw new Error('Purchase order not found')

  // Update each item's received quantity
  for (const receipt of itemReceipts) {
    const item = (po as any).items.find((i: PurchaseOrderItem) => i.id === receipt.item_id)
    if (!item) continue

    await supabase
      .from('purchase_order_items')
      .update({ quantity_received: receipt.quantity_received })
      .eq('id', receipt.item_id)

    // Add to ingredient stock
    if (item.ingredient_id && receipt.quantity_received > 0) {
      await adjustIngredientStock(
        item.ingredient_id,
        receipt.quantity_received,
        receivedBy,
        `Received via PO ${po.po_number}`
      )
    }
  }

  // Determine new status
  const totalOrdered = (po as any).items.reduce((sum: number, i: PurchaseOrderItem) => sum + Number(i.quantity_ordered), 0)
  const totalReceived = itemReceipts.reduce((sum, r) => sum + r.quantity_received, 0)
  const newStatus = totalReceived >= totalOrdered ? 'received' : 'partially_received'

  // Create expense entry for the received amount
  const receivedAmount = itemReceipts.reduce((sum, receipt) => {
    const item = (po as any).items.find((i: PurchaseOrderItem) => i.id === receipt.item_id)
    return sum + (item ? receipt.quantity_received * Number(item.unit_cost) : 0)
  }, 0)

  let expenseId: string | null = null
  if (receivedAmount > 0) {
    const expense = await createExpense(
      `PO ${po.po_number} — ${po.supplier_name_snapshot}`,
      receivedAmount,
      new Date().toISOString().split('T')[0],
      receivedBy,
      expenseCategoryId,
      paymentNotes || `Purchase order ${po.po_number} received`
    )
    expenseId = expense.id
  }

  await supabase
    .from('purchase_orders')
    .update({
      status: newStatus,
      received_by: receivedBy,
      received_at: new Date().toISOString(),
      expense_id: expenseId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
}
