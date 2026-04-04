import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { saleId, voidReason, managerId } = await req.json()

    if (!saleId || !voidReason?.trim() || !managerId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Verify manager role
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', managerId)
      .single()

    if (profileErr || !profile || profile.role !== 'manager') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // 2. Fetch sale with items
    const { data: sale, error: saleErr } = await supabaseAdmin
      .from('sales')
      .select('*, sale_items(*)')
      .eq('id', saleId)
      .single()

    if (saleErr || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    if (sale.is_voided) {
      return NextResponse.json({ error: 'Sale is already voided' }, { status: 400 })
    }

    // 3. Mark sale as voided
    const { error: voidErr } = await supabaseAdmin
      .from('sales')
      .update({
        is_voided: true,
        voided_by: managerId,
        voided_at: new Date().toISOString(),
        void_reason: voidReason.trim(),
      })
      .eq('id', saleId)

    if (voidErr) throw voidErr

    // 4. Cash register is NOT touched on void — getCashSummary() reads
    // cash sales from the sales table filtered by is_voided=false, so
    // marking the sale voided above already removes it from the balance.

    // 5. Restore shop stock and log each item
    for (const item of sale.sale_items ?? []) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('shop_current_stock')
        .eq('id', item.product_id)
        .single()

      if (!product) continue

      const stockBefore = product.shop_current_stock
      const stockAfter = stockBefore + item.quantity

      await supabaseAdmin
        .from('products')
        .update({ shop_current_stock: stockAfter })
        .eq('id', item.product_id)

      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          product_id: item.product_id,
          transaction_type: 'adjustment',
          location: 'shop',
          quantity_before: stockBefore,
          quantity_change: item.quantity,
          quantity_after: stockAfter,
          notes: `Void of sale ${sale.sale_number}: ${voidReason.trim()}`,
          reference_id: saleId,
          performed_by: managerId,
        })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Void sale error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
