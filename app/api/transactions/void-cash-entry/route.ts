import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { entryId, voidReason, managerId } = await req.json()

    if (!entryId || !voidReason?.trim() || !managerId) {
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

    // 2. Fetch the cash register entry
    const { data: entry, error: entryErr } = await supabaseAdmin
      .from('cash_register')
      .select('*')
      .eq('id', entryId)
      .single()

    if (entryErr || !entry) {
      return NextResponse.json({ error: 'Cash entry not found' }, { status: 404 })
    }

    if (entry.is_voided) {
      return NextResponse.json({ error: 'Entry is already voided' }, { status: 400 })
    }

    // Only cash_in and cash_out can be reversed (not float)
    if (entry.type === 'float') {
      return NextResponse.json({ error: 'Float entries cannot be voided' }, { status: 400 })
    }

    // 3. Mark original entry as voided
    const { error: voidErr } = await supabaseAdmin
      .from('cash_register')
      .update({
        is_voided: true,
        voided_by: managerId,
        voided_at: new Date().toISOString(),
        void_reason: voidReason.trim(),
      })
      .eq('id', entryId)

    if (voidErr) throw voidErr

    // 4. Insert a counter entry to reverse the effect
    // cash_in gets reversed by cash_out and vice versa
    const reversalType = entry.type === 'cash_in' ? 'cash_out' : 'cash_in'

    await supabaseAdmin
      .from('cash_register')
      .insert({
        type: reversalType,
        amount: entry.amount,
        notes: `Reversal of ${entry.type.replace('_', ' ')} (₱${Number(entry.amount).toFixed(2)}): ${voidReason.trim()}`,
        performed_by: managerId,
        reference_id: entryId,
      })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Void cash entry error:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
