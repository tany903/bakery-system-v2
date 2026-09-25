'use client'

import { useRef } from 'react'
import type { ReservationWithDetails } from '@/lib/reservations'

interface ReservationReceiptProps {
  reservation: ReservationWithDetails
  // 'deposit' — printed right after booking, when the fee/deposit is collected.
  // 'pickup'  — printed after the customer picks up and pays the balance.
  mode: 'deposit' | 'pickup'
  onClose: () => void
}

function peso(n: number) {
  return `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPHT(isoStr: string): string {
  return new Date(isoStr).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Manila',
  })
}

export default function ReservationReceipt({ reservation, mode, onClose }: ReservationReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null)

  const r = reservation
  const isDeposit = mode === 'deposit'

  // The staff member and timestamp relevant to *this* receipt — booking
  // staff/time for the deposit receipt, completing staff/time for pickup.
  const staffName = isDeposit
    ? r.created_by_profile?.full_name || 'Unknown'
    : r.completed_by_profile?.full_name || 'Unknown'
  const eventDate = isDeposit ? r.created_at : (r.completed_at || new Date().toISOString())

  const paymentLabel = r.payment_method === 'cash' ? 'CASH' : r.payment_method === 'online' ? 'ONLINE' : '—'

  const handlePrint = () => {
    const printContent = receiptRef.current
    if (!printContent) return

    const printWindow = window.open('', '', 'width=800,height=600')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>${isDeposit ? 'Deposit Receipt' : 'Pickup Receipt'} - ${r.customer_name}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              margin: 20px;
              font-size: 14px;
            }
            .receipt {
              max-width: 300px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              border-bottom: 2px dashed #000;
              padding-bottom: 10px;
            }
            .info {
              margin: 10px 0;
              font-size: 12px;
            }
            .items {
              border-top: 1px dashed #000;
              border-bottom: 1px dashed #000;
              padding: 10px 0;
              margin: 10px 0;
            }
            .item {
              display: flex;
              justify-content: space-between;
              margin: 5px 0;
            }
            .summary-line {
              margin-top: 6px;
              font-size: 13px;
            }
            .total {
              margin-top: 10px;
              padding-top: 10px;
              border-top: 2px solid #000;
              font-size: 16px;
              font-weight: bold;
            }
            .footer {
              text-align: center;
              margin-top: 20px;
              font-size: 12px;
              border-top: 1px dashed #000;
              padding-top: 10px;
            }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div ref={receiptRef} className="receipt">
          {/* Header */}
          <div className="header text-center mb-6 pb-4 border-b-2 border-dashed border-gray-800">
            <div className="text-3xl mb-2">🥖</div>
            <h1 className="text-2xl font-bold" style={{ color: '#111111' }}>FREDS PIES</h1>
            <p className="text-sm" style={{ color: '#444444' }}>Is Fred Is Good</p>
            <p className="text-xs font-bold mt-2 uppercase tracking-wide" style={{ color: '#7B1111' }}>
              {isDeposit ? 'Reservation — Deposit Receipt' : 'Reservation — Pickup Receipt'}
            </p>
          </div>

          {/* Reservation Info */}
          <div className="info space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>Customer:</span>
              <span className="font-bold" style={{ color: '#111111' }}>{r.customer_name}</span>
            </div>
            {r.customer_phone && (
              <div className="flex justify-between">
                <span style={{ color: '#555555' }}>Phone:</span>
                <span style={{ color: '#111111' }}>{r.customer_phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>{isDeposit ? 'Booked:' : 'Picked up:'}</span>
              <span style={{ color: '#111111' }}>{formatPHT(eventDate)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>{isDeposit ? 'Booked by:' : 'Served by:'}</span>
              <span style={{ color: '#111111' }}>{staffName}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>Payment:</span>
              <span className="font-bold" style={{ color: '#111111' }}>{paymentLabel}</span>
            </div>
            {isDeposit && r.needed_by && (
              <div className="flex justify-between">
                <span style={{ color: '#555555' }}>Needed by:</span>
                <span className="font-bold" style={{ color: '#7B1111' }}>{formatPHT(r.needed_by)}</span>
              </div>
            )}
          </div>

          {/* Items */}
          <div className="items border-t border-b border-dashed border-gray-800 py-4 my-4">
            <div className="font-bold mb-2 text-sm" style={{ color: '#111111' }}>ITEMS</div>
            {r.items.map((item) => (
              <div key={item.id} className="mb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium" style={{ color: '#111111' }}>{item.product_name_snapshot}</div>
                    <div className="text-sm" style={{ color: '#444444' }}>
                      {item.quantity} x {peso(item.unit_price_snapshot)}
                    </div>
                  </div>
                  <div className="font-bold" style={{ color: '#111111' }}>{peso(item.subtotal)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Payment summary — differs by mode */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>Total Order Value:</span>
              <span style={{ color: '#111111' }}>{peso(r.total_amount)}</span>
            </div>

            {isDeposit ? (
              <>
                <div className="flex justify-between">
                  <span style={{ color: '#555555' }}>Deposit / Fee Paid:</span>
                  <span className="font-bold" style={{ color: '#10B981' }}>{peso(r.fee_amount)}</span>
                </div>
                <div className="summary-line flex justify-between">
                  <span className="font-bold" style={{ color: '#555555' }}>Balance Due at Pickup:</span>
                  <span className="font-bold" style={{ color: '#7B1111' }}>{peso(r.balance_amount)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span style={{ color: '#555555' }}>Deposit Already Paid:</span>
                  <span style={{ color: '#111111' }}>{peso(r.fee_amount)}</span>
                </div>
                <div className="summary-line flex justify-between">
                  <span className="font-bold" style={{ color: '#555555' }}>Balance Collected Now:</span>
                  <span className="font-bold" style={{ color: '#10B981' }}>{peso(r.balance_amount)}</span>
                </div>
              </>
            )}
          </div>

          {/* Total */}
          <div className="total border-t-2 border-gray-800 pt-4 mt-4">
            <div className="flex justify-between text-xl">
              <span className="font-bold" style={{ color: '#111111' }}>
                {isDeposit ? 'PAID TODAY:' : 'TOTAL PAID (FULL ORDER):'}
              </span>
              <span className="font-bold" style={{ color: '#111111' }}>
                {peso(isDeposit ? r.fee_amount : r.total_amount)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="footer text-center mt-6 pt-4 border-t border-dashed border-gray-800 text-sm" style={{ color: '#444444' }}>
            {isDeposit ? (
              <>
                <p>Please keep this receipt.</p>
                <p className="mt-1">Present it when picking up your order.</p>
              </>
            ) : (
              <p>Thank you for your order!</p>
            )}
            <p className="mt-4 text-xs" style={{ color: '#777777' }}>** NOT AN OFFICIAL RECEIPT **</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-4 mt-6 pt-6 border-t">
          <button
            onClick={handlePrint}
            className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
          >
            Print Receipt
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-900"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}