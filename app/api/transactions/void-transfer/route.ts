import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { transferId, voidReason, managerId } = await req.json()

    if (!transferId || !voidReason?.trim() || !managerId) {
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

    // 2. Fetch the transfer
    const { data: transfer, error: transferErr } = await supabaseAdmin
      .from('inventory_transfers')
      .select('*, product:products(name)')
      .eq('id', transferId)
      .single()

    if (transferErr || !transfer) {
      return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
    }

    if (transfer.is_voided) {
      return NextResponse.json({ error: 'Transfer is already voided' }, { status: 400 })
    }

    // 3. Mark transfer as voided
    const { error: voidErr } = await supabaseAdmin
      .from('inventory_transfers')
      .update({
        is_voided: true,
        voided_by: managerId,
        voided_at: new Date().toISOString(),
        void_reason: voidReason.trim(),
      })
      .eq('id', transferId)

    if (voidErr) throw voidErr

    // 4. Reverse stock: shop goes down, production goes up
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('shop_current_stock, production_current_stock')
      .eq('id', transfer.product_id)
      .single()

    if (product) {
      const shopBefore = product.shop_current_stock
      const shopAfter = shopBefore - transfer.quantity
      const prodBefore = product.production_current_stock
      const prodAfter = prodBefore + transfer.quantity

      await supabaseAdmin
        .from('products')
        .update({
          shop_current_stock: shopAfter,
          production_current_stock: prodAfter,
        })
        .eq('id', transfer.product_id)

      const productName = transfer.product?.name || 'Unknown product'

      // Log shop reduction
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          product_id: transfer.product_id,
          transaction_type: 'adjustment',
          location: 'shop',
          quantity_before: shopBefore,
          quantity_change: -transfer.quantity,
          quantity_after: shopAfter,
          notes: `Void of transfer (${productName}): ${voidReason.trim()}`,
          reference_id: transferId,
          performed_by: managerId,
        })

      // Log production restoration
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          product_id: transfer.product_id,
          transaction_type: 'adjustment',
          location: 'production',
          quantity_before: prodBefore,
          quantity_change: transfer.quantity,
          quantity_after: prodAfter,
          notes: `Void of transfer (${productName}): ${voidReason.trim()}`,
          reference_id: transferId,
          performed_by: managerId,
        })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Void transfer error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
