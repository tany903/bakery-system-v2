import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { productionId, voidReason, managerId } = await req.json()

    if (!productionId || !voidReason?.trim() || !managerId) {
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

    // 2. Fetch production record
    const { data: record, error: recordErr } = await supabaseAdmin
      .from('production')
      .select('*, products(name)')
      .eq('id', productionId)
      .single()

    if (recordErr || !record) {
      return NextResponse.json({ error: 'Production record not found' }, { status: 404 })
    }

    if (record.is_voided) {
      return NextResponse.json({ error: 'Production record is already voided' }, { status: 400 })
    }

    // 3. Mark as voided
    const { error: voidErr } = await supabaseAdmin
      .from('production')
      .update({
        is_voided: true,
        voided_by: managerId,
        voided_at: new Date().toISOString(),
        void_reason: voidReason.trim(),
      })
      .eq('id', productionId)

    if (voidErr) throw voidErr

    // 4. Reverse production stock
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('production_current_stock')
      .eq('id', record.product_id)
      .single()

    if (product) {
      const stockBefore = product.production_current_stock
      const stockAfter = Math.max(0, stockBefore - record.quantity_produced)

      await supabaseAdmin
        .from('products')
        .update({ production_current_stock: stockAfter })
        .eq('id', record.product_id)

      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          product_id: record.product_id,
          transaction_type: 'adjustment',
          location: 'production',
          quantity_before: stockBefore,
          quantity_change: -(record.quantity_produced),
          quantity_after: stockAfter,
          notes: `Void of production batch (${record.products?.name ?? 'Unknown'}): ${voidReason.trim()}`,
          reference_id: productionId,
          performed_by: managerId,
        })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Void production error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
