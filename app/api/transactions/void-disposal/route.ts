import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { disposalId, voidReason, managerId } = await req.json()

    if (!disposalId || !voidReason?.trim() || !managerId) {
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

    // 2. Fetch disposal
    const { data: disposal, error: disposalErr } = await supabaseAdmin
      .from('stock_disposals')
      .select('*')
      .eq('id', disposalId)
      .single()

    if (disposalErr || !disposal) {
      return NextResponse.json({ error: 'Disposal not found' }, { status: 404 })
    }

    if (disposal.is_voided) {
      return NextResponse.json({ error: 'Disposal is already voided' }, { status: 400 })
    }

    // 3. Mark disposal as voided
    const { error: voidErr } = await supabaseAdmin
      .from('stock_disposals')
      .update({
        is_voided: true,
        voided_by: managerId,
        voided_at: new Date().toISOString(),
        void_reason: voidReason.trim(),
      })
      .eq('id', disposalId)

    if (voidErr) throw voidErr

    // 4. Restore stock
    const stockField = disposal.location === 'shop' ? 'shop_current_stock' : 'production_current_stock'

    const { data: product } = await supabaseAdmin
      .from('products')
      .select('shop_current_stock, production_current_stock')
      .eq('id', disposal.product_id)
      .single()

    if (!product) throw new Error('Product not found')

    const stockBefore = product[stockField]
    const stockAfter = stockBefore + disposal.quantity

    await supabaseAdmin
      .from('products')
      .update({ [stockField]: stockAfter })
      .eq('id', disposal.product_id)

    // 5. Log inventory transaction
    await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        product_id: disposal.product_id,
        transaction_type: 'adjustment',
        location: disposal.location,
        quantity_before: stockBefore,
        quantity_change: disposal.quantity,
        quantity_after: stockAfter,
        notes: `Void of ${disposal.type === 'pullout' ? 'pull-out' : 'OTH'}: ${voidReason.trim()}`,
        reference_id: disposalId,
        performed_by: managerId,
      })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Void disposal error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
