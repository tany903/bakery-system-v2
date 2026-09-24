'use client'

import { useRef } from 'react'
import type { Sale, SaleItem } from '@/lib/supabase'

interface ReceiptProps {
  sale: Sale & { sale_items: SaleItem[], profiles?: { full_name: string } }
  onClose: () => void
}

const VAT_RATE = 0.12

export default function Receipt({ sale, onClose }: ReceiptProps) {
  const receiptRef = useRef<HTMLDivElement>(null)

  const showCashBreakdown =
    sale.payment_method === 'cash' &&
    sale.amount_tendered !== null &&
    sale.amount_tendered !== undefined

  // Raw items total (before any whole-cart PWD/Senior discount) vs the
  // sale's actual total tells us the discount amount, with no extra column.
  const itemsRawTotal = sale.sale_items.reduce((sum, item) => sum + item.subtotal, 0)
  const pwdSeniorDiscountAmount = Math.max(0, itemsRawTotal - sale.total_amount)
  const hasPwdSeniorDiscount = pwdSeniorDiscountAmount > 0.005

  // Prices are VAT-inclusive, so the net (VAT-exclusive) amount is
  // Total Gross ÷ 1.12, computed off the final (already-discounted) total.
  const netAmount = sale.total_amount / (1 + VAT_RATE)
  const vatAmount = sale.total_amount - netAmount

  const handlePrint = () => {
    const printContent = receiptRef.current
    if (!printContent) return

    const printWindow = window.open('', '', 'width=800,height=600')
    if (!printWindow) return

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - ${sale.sale_number}</title>
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
            .discount-line {
              margin-top: 6px;
              font-size: 13px;
            }
            .vat-breakdown {
              margin-top: 8px;
              padding-top: 8px;
              border-top: 1px dashed #000;
              font-size: 12px;
            }
            .total {
              margin-top: 10px;
              padding-top: 10px;
              border-top: 2px solid #000;
              font-size: 16px;
              font-weight: bold;
            }
            .cash-breakdown {
              margin-top: 8px;
              padding-top: 8px;
              font-size: 14px;
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
          </div>

          {/* Sale Info */}
          <div className="info space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>Receipt #:</span>
              <span className="font-bold" style={{ color: '#111111' }}>{sale.sale_number}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>Date:</span>
              <span style={{ color: '#111111' }}>{new Date(sale.sale_date).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>Cashier:</span>
              <span style={{ color: '#111111' }}>{sale.profiles?.full_name || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>Payment:</span>
              <span className="uppercase font-bold" style={{ color: '#111111' }}>{sale.payment_method}</span>
            </div>
          </div>

          {/* Items */}
          <div className="items border-t border-b border-dashed border-gray-800 py-4 my-4">
            <div className="font-bold mb-2 text-sm" style={{ color: '#111111' }}>ITEMS</div>
            {sale.sale_items.map((item, index) => (
              <div key={index} className="mb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium" style={{ color: '#111111' }}>{item.product_name}</div>
                    <div className="text-sm" style={{ color: '#444444' }}>
                      {item.quantity} x ₱{item.unit_price.toFixed(2)}
                    </div>
                  </div>
                  <div className="font-bold" style={{ color: '#111111' }}>₱{item.subtotal.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* PWD/Senior Discount */}
          {hasPwdSeniorDiscount && (
            <div className="discount-line flex justify-between">
              <span style={{ color: '#555555' }}>Subtotal:</span>
              <span style={{ color: '#111111' }}>₱{itemsRawTotal.toFixed(2)}</span>
            </div>
          )}
          {hasPwdSeniorDiscount && (
            <div className="discount-line flex justify-between">
              <span style={{ color: '#D97706' }} className="font-bold">PWD/Senior Discount (5%):</span>
              <span style={{ color: '#D97706' }} className="font-bold">-₱{pwdSeniorDiscountAmount.toFixed(2)}</span>
            </div>
          )}

          {/* VAT Breakdown */}
          <div className="vat-breakdown space-y-1 text-sm">
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>VATable Sales:</span>
              <span style={{ color: '#111111' }}>₱{netAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#555555' }}>VAT (12%):</span>
              <span style={{ color: '#111111' }}>₱{vatAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Total */}
          <div className="total border-t-2 border-gray-800 pt-4 mt-4">
            <div className="flex justify-between text-xl">
              <span className="font-bold" style={{ color: '#111111' }}>TOTAL:</span>
              <span className="font-bold" style={{ color: '#111111' }}>₱{sale.total_amount.toFixed(2)}</span>
            </div>
          </div>

          {/* Cash Received / Change */}
          {showCashBreakdown && (
            <div className="cash-breakdown mt-2 pt-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: '#555555' }}>Amount Received:</span>
                <span className="font-bold" style={{ color: '#111111' }}>₱{sale.amount_tendered!.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span style={{ color: '#555555' }}>Change:</span>
                <span className="font-bold" style={{ color: '#111111' }}>₱{(sale.change_amount ?? 0).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="footer text-center mt-6 pt-4 border-t border-dashed border-gray-800 text-sm" style={{ color: '#444444' }}>
            <p>Thank you for your purchase!</p>
            <p className="mt-2">Visit us again soon</p>
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