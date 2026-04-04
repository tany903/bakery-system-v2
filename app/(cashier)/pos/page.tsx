'use client'

import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, signOut } from '@/lib/auth'
import { getAllProducts, getAllCategories } from '@/lib/products'
import {
  createRestockRequest,
  type NewRestockItem,
} from '@/lib/restock-requests'
import {
  createSale, getTodaysSalesStats, getMaxDiscountPct, getItemSubtotal,
  type CartItem, type SalesStats,
} from '@/lib/sales'
import type { Product } from '@/lib/supabase'
import ProductGrid from '@/components/ProductGrid'
import Receipt from '@/components/Receipt'
import CashRegisterWidget from '@/components/CashRegisterWidget'

// Convert a datetime-local string (treated as Asia/Manila) to UTC ISO string
function manilaLocalToUTC(localStr: string): string {
  if (!localStr) return localStr
  const [datePart, timePart = '00:00'] = localStr.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hour, minute] = timePart.split(':').map(Number)
  // PHT = UTC+8, so subtract 8 hours to get UTC
  const utc = new Date(Date.UTC(year, month - 1, day, hour - 8, minute))
  return utc.toISOString()
}

// Get current Manila time as a datetime-local string (for input min)
function getManilaLocalNow(): string {
  const now = new Date()
  const manila = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${manila.getFullYear()}-${pad(manila.getMonth() + 1)}-${pad(manila.getDate())}T${pad(manila.getHours())}:${pad(manila.getMinutes())}`
}

export default function POSPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash')
  const [searchQuery, setSearchQuery] = useState('')
  const [stats, setStats] = useState<SalesStats | null>(null)
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSale, setLastSale] = useState<any>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [maxDiscountPct, setMaxDiscountPct] = useState(30)
  const [showCash, setShowCash] = useState(false)

  // Custom discount modal
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountTargetId, setDiscountTargetId] = useState<string | null>(null)
  const [discountInput, setDiscountInput] = useState('')

  // Restock / advance order modal
  const [showRestockModal, setShowRestockModal] = useState(false)
  const [restockProducts, setRestockProducts] = useState<any[]>([])
  const [restockItems, setRestockItems] = useState<{ product_id: string; requested_quantity: string; notes: string }[]>([
    { product_id: '', requested_quantity: '', notes: '' }
  ])
  const [restockOrderNotes, setRestockOrderNotes] = useState('')
  const [restockDeliveryDate, setRestockDeliveryDate] = useState('')
  const [restockSubmitting, setRestockSubmitting] = useState(false)
  const [restockError, setRestockError] = useState('')
  const [restockSuccess, setRestockSuccess] = useState('')

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || (profile.role !== 'cashier' && profile.role !== 'manager')) {
      router.push('/login'); return
    }
    setUserId(user.id)
    await loadData()
    setLoading(false)
  }

  async function loadData() {
    try {
      const [productsData, statsData, categoriesData, maxDisc] = await Promise.all([
        getAllProducts(),
        getTodaysSalesStats(),
        getAllCategories(),
        getMaxDiscountPct(),
      ])
      setProducts(productsData.filter(p => !p.is_archived))
      setStats(statsData)
      setCategories(categoriesData)
      setMaxDiscountPct(maxDisc)
    } catch { setError('Failed to load data') }
  }

  function addToCart(product: Product) {
    if (product.shop_current_stock === 0) {
      setError('Product out of stock')
      setTimeout(() => setError(''), 3000)
      return
    }
    const existingItem = cart.find(item => item.product.id === product.id)
    if (existingItem) {
      if (existingItem.quantity >= product.shop_current_stock) {
        setError(`Only ${product.shop_current_stock} available`)
        setTimeout(() => setError(''), 3000)
        return
      }
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1, subtotal: getItemSubtotal({ ...item, quantity: item.quantity + 1 }) }
          : item
      ))
    } else {
      const newItem: CartItem = { product, quantity: 1, subtotal: product.price }
      setCart([...cart, newItem])
    }
  }

  function updateQuantity(productId: string, newQuantity: number) {
    if (newQuantity === 0) { removeFromCart(productId); return }
    const item = cart.find(i => i.product.id === productId)
    if (!item) return
    if (newQuantity > item.product.shop_current_stock) {
      setError(`Only ${item.product.shop_current_stock} available`)
      setTimeout(() => setError(''), 3000)
      return
    }
    setCart(cart.map(cartItem =>
      cartItem.product.id === productId
        ? { ...cartItem, quantity: newQuantity, subtotal: getItemSubtotal({ ...cartItem, quantity: newQuantity }) }
        : cartItem
    ))
  }

  function toggleOldStock(productId: string) {
    setCart(cart.map(item => {
      if (item.product.id !== productId) return item
      const isOldStock = !item.isOldStock
      return { ...item, isOldStock, discountPct: isOldStock ? 0 : item.discountPct, subtotal: getItemSubtotal({ ...item, isOldStock, discountPct: isOldStock ? 0 : item.discountPct }) }
    }))
  }

  function openDiscountModal(productId: string) {
    const item = cart.find(i => i.product.id === productId)
    setDiscountTargetId(productId)
    setDiscountInput(item?.discountPct ? item.discountPct.toString() : '')
    setShowDiscountModal(true)
  }

  function applyDiscount() {
    const pct = parseFloat(discountInput)
    if (!discountInput || isNaN(pct) || pct <= 0 || pct > maxDiscountPct) {
      setError('Please select a discount option')
      setTimeout(() => setError(''), 3000)
      return
    }
    setCart(cart.map(item => {
      if (item.product.id !== discountTargetId) return item
      return { ...item, discountPct: pct, isOldStock: false, subtotal: getItemSubtotal({ ...item, discountPct: pct, isOldStock: false }) }
    }))
    setShowDiscountModal(false)
    setDiscountTargetId(null)
    setDiscountInput('')
  }

  function removeDiscount(productId: string) {
    setCart(cart.map(item => {
      if (item.product.id !== productId) return item
      return { ...item, discountPct: 0, subtotal: getItemSubtotal({ ...item, discountPct: 0 }) }
    }))
  }

  function removeFromCart(productId: string) {
    setCart(cart.filter(item => item.product.id !== productId))
  }

  function clearCart() { setCart([]) }

  async function processPayment() {
    if (cart.length === 0) { setError('Cart is empty'); setTimeout(() => setError(''), 3000); return }
    setProcessing(true); setError('')
    try {
      const sale = await createSale(cart, paymentMethod, userId)
      const { data: fullSale } = await supabase
        .from('sales')
        .select('*, sale_items (*), profiles (full_name)')
        .eq('id', sale.id)
        .single()
      setLastSale(fullSale)
      setShowReceipt(true)
      clearCart()
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Payment failed')
    } finally { setProcessing(false) }
  }

  async function openRestockModal() {
    const data = await getAllProducts()
    setRestockProducts(data.filter((p: any) => !p.is_archived))
    setRestockItems([{ product_id: '', requested_quantity: '', notes: '' }])
    setRestockOrderNotes('')
    setRestockDeliveryDate('')
    setRestockError('')
    setRestockSuccess('')
    setShowRestockModal(true)
  }

  function addRestockItem() {
    setRestockItems(prev => [...prev, { product_id: '', requested_quantity: '', notes: '' }])
  }

  function removeRestockItem(index: number) {
    setRestockItems(prev => prev.filter((_, i) => i !== index))
  }

  function updateRestockItem(index: number, field: string, value: string) {
    setRestockItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function getAvailableRestockProducts(currentIndex: number) {
    const selectedIds = restockItems
      .filter((_, i) => i !== currentIndex)
      .map(item => item.product_id)
      .filter(Boolean)
    return restockProducts.filter((p: any) => !selectedIds.includes(p.id))
  }

  function getDeliveryDateInfo(deliveryDate: string | null | undefined) {
    if (!deliveryDate) return null

    // Parse correctly: UTC ISO from DB, or datetime-local from input (Manila time)
    let due: Date
    if (deliveryDate.endsWith('Z') || deliveryDate.includes('+')) {
      due = new Date(deliveryDate)
    } else {
      const [datePart, timePart = '00:00'] = deliveryDate.split('T')
      const [year, month, day] = datePart.split('-').map(Number)
      const [hour, minute] = timePart.split(':').map(Number)
      due = new Date(Date.UTC(year, month - 1, day, hour - 8, minute))
    }

    const now = new Date()
    const diffMs = due.getTime() - now.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const timeStr = due.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Manila' })
    const dateStr = due.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

    if (diffMs < 0)       return { label: `Overdue — ${dateStr} ${timeStr}`,                    color: '#EF4444', bg: '#FEE2E2' }
    if (diffHours <= 3)   return { label: `Needed Soon — by ${timeStr}`,                        color: '#DC2626', bg: '#FEE2E2' }
    if (diffHours <= 24)  return { label: `Needed Today — by ${timeStr}`,                       color: '#DC2626', bg: '#FEE2E2' }
    if (diffDays <= 1)    return { label: `Needed Tomorrow — by ${timeStr}`,                    color: '#D97706', bg: '#FEF3C7' }
    if (diffDays <= 3)    return { label: `Needed in ${diffDays}d — by ${timeStr}`,             color: '#D97706', bg: '#FEF3C7' }
    return                { label: `Needed by ${dateStr} ${timeStr}`,                           color: '#6B7280', bg: '#F3F4F6' }
  }

  async function handleRestockSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validItems = restockItems.filter(i => i.product_id && parseInt(i.requested_quantity) > 0)
    if (validItems.length === 0) { setRestockError('Add at least one product with a valid quantity'); return }
    const items: NewRestockItem[] = validItems.map(i => ({
      product_id: i.product_id,
      requested_quantity: parseInt(i.requested_quantity),
      notes: i.notes || undefined,
    }))
    setRestockSubmitting(true); setRestockError('')
    try {
      // Convert Manila local datetime to UTC before saving
      const deliveryDateUTC = restockDeliveryDate ? manilaLocalToUTC(restockDeliveryDate) : undefined
      await createRestockRequest(
        items,
        'manual_order',
        userId,
        restockOrderNotes || undefined,
        deliveryDateUTC
      )
      setRestockSuccess(`Restock request created with ${items.length} product${items.length !== 1 ? 's' : ''}`)
      setTimeout(() => { setShowRestockModal(false); setRestockSuccess('') }, 1500)
    } catch (err: any) {
      setRestockError(err.message || 'Failed to create request')
    } finally { setRestockSubmitting(false) }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  const cartTotal = cart.reduce((sum, item) => sum + getItemSubtotal(item), 0)
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const filteredProducts = searchQuery
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : products

  const navLinks = [
    { href: '/pos', label: 'POS', active: true },
    { href: '/inventory', label: 'Inventory' },
    { href: '/restock-requests', label: 'Restock' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5A623' }}>
        <div className="text-2xl font-black text-white">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>

      {/* TOP NAVBAR */}
      <div className="relative z-10 w-full flex items-center gap-6 px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
            <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
        </div>
        <div className="flex gap-2">
          {navLinks.map(link => (
            <a key={link.label} href={link.href}
              className="px-4 py-1.5 rounded-sm text-xs font-bold no-underline transition-colors"
              style={link.active
                ? { backgroundColor: '#F5A623', color: '#7B1111' }
                : { backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }
              }>
              {link.label}
            </a>
          ))}
        </div>
        {stats && (
          <div className="flex items-center gap-4 ml-auto">
            <div className="text-right">
              <p className="text-white text-xs opacity-60 font-semibold uppercase tracking-wide">Today's Sales</p>
              <p className="text-white font-black text-lg leading-none">₱{stats.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</p>
              <p className="text-white text-xs opacity-50">{stats.totalSales} transactions</p>
            </div>
          </div>
        )}
        {userId && (
          <button onClick={() => setShowCash(true)}
            className="flex flex-col items-center gap-0.5 px-4 py-2 rounded-sm font-bold text-sm shrink-0"
            style={{ backgroundColor: '#F5A623', color: '#7B1111' }}>
            <span className="text-base font-black">₱</span>
            <span className="text-xs font-semibold">Cash</span>
          </button>
        )}
        <button onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors shrink-0">
          <span className="text-base font-bold">→</span>
          <span className="text-xs font-semibold">Logout</span>
        </button>
      </div>

      {/* BODY */}
      <div className="flex flex-1 relative overflow-hidden">
        <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
          style={{ opacity: 0.15, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

        {/* PRODUCTS PANEL */}
        <div className="relative z-10 flex-1 flex flex-col p-4 overflow-hidden">
          {error && <div className="mb-3 px-4 py-2 rounded-sm text-sm font-semibold text-white bg-red-500">{error}</div>}
          <input type="text" placeholder="Search products..." value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full text-sm font-semibold px-4 py-2.5 rounded-sm border-0 bg-white text-gray-900 placeholder-gray-400 focus:outline-none mb-4"
            style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.15)' }} />
          <div className="flex-1 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="text-5xl mb-3">🔍</div>
                <p className="font-semibold">No products found</p>
              </div>
            ) : (
              <ProductGrid products={filteredProducts} categories={categories} onAddToCart={addToCart} />
            )}
          </div>
        </div>

        {/* CART PANEL */}
        <div className="relative z-10 w-80 shrink-0 flex flex-col m-4 ml-0 rounded-sm overflow-hidden"
          style={{ backgroundColor: 'white', boxShadow: '0px 0px 15px rgba(0,0,0,0.25)' }}>

          <div className="px-5 py-4 shrink-0" style={{ backgroundColor: '#220901' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-white font-black text-lg">Cart</h2>
              <div className="flex items-center gap-2">
                <button onClick={openRestockModal}
                  className="text-xs font-bold px-2 py-1 rounded-sm flex items-center gap-1"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'white' }}
                  title="New Restock Request">
                  Advance Order
                </button>
                <span className="text-white text-sm font-bold opacity-70">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                <div className="text-5xl mb-3">🛒</div>
                <p className="text-sm font-semibold">Cart is empty</p>
                <p className="text-xs mt-1">Tap a product to add it</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const effectivePrice = item.isOldStock
                    ? item.product.price * 0.5
                    : item.discountPct ? item.product.price * (1 - item.discountPct / 100)
                    : item.product.price
                  const hasDiscount = item.isOldStock || (item.discountPct && item.discountPct > 0)

                  return (
                    <div key={item.product.id} className={`border-b border-gray-100 pb-3 last:border-0 rounded-sm p-2 ${hasDiscount ? 'bg-orange-50' : ''}`}>
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex-1 pr-2">
                          <p className="text-sm font-semibold text-gray-800 leading-tight">{item.product.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {hasDiscount ? (
                              <>
                                <span className="text-xs text-gray-400 line-through">₱{item.product.price.toFixed(2)}</span>
                                <span className="text-xs font-bold text-orange-600">₱{effectivePrice.toFixed(2)}</span>
                                {item.isOldStock && <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-orange-400 text-white">DAY-OLD</span>}
                                {item.discountPct ? <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-blue-400 text-white">{item.discountPct}% OFF</span> : null}
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">₱{item.product.price.toFixed(2)} each</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => removeFromCart(item.product.id)}
                          className="text-xs text-red-400 hover:text-red-600 font-semibold shrink-0">✕</button>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="w-7 h-7 rounded-sm font-black text-sm flex items-center justify-center"
                            style={{ backgroundColor: '#F5A623', color: 'white' }}>−</button>
                          <span className="w-8 text-center font-black text-sm">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="w-7 h-7 rounded-sm font-black text-sm flex items-center justify-center"
                            style={{ backgroundColor: '#F5A623', color: 'white' }}>+</button>
                        </div>
                        <span className="font-black text-sm text-gray-900">₱{getItemSubtotal(item).toFixed(2)}</span>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <button onClick={() => toggleOldStock(item.product.id)}
                          className="text-xs font-bold px-2 py-1 rounded-sm border transition-colors"
                          style={item.isOldStock
                            ? { backgroundColor: '#F5A623', borderColor: '#F5A623', color: '#7B1111' }
                            : { borderColor: '#e5e7eb', color: '#6b7280' }
                          }>
                          🍞 Day-Old
                        </button>
                        {item.discountPct && item.discountPct > 0 ? (
                          <button onClick={() => removeDiscount(item.product.id)}
                            className="text-xs font-bold px-2 py-1 rounded-sm border"
                            style={{ backgroundColor: '#3B82F6', borderColor: '#3B82F6', color: 'white' }}>
                            {item.discountPct}% ✕
                          </button>
                        ) : (
                          <button onClick={() => openDiscountModal(item.product.id)}
                            disabled={item.isOldStock}
                            className="text-xs font-bold px-2 py-1 rounded-sm border transition-colors disabled:opacity-30"
                            style={{ borderColor: '#e5e7eb', color: '#6b7280' }}>
                            % Discount
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Cart Footer */}
          {cart.length > 0 && (
            <div className="px-4 py-4 border-t border-gray-100 shrink-0">
              {cart.some(i => i.isOldStock || (i.discountPct && i.discountPct > 0)) && (
                <div className="flex justify-between text-xs font-bold mb-2 px-1">
                  <span className="text-gray-500">Original</span>
                  <span className="text-gray-400 line-through">
                    ₱{cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <span className="font-black text-gray-900 text-lg">Total</span>
                <span className="font-black text-2xl" style={{ color: '#7B1111' }}>
                  ₱{cartTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => setPaymentMethod('cash')}
                  className="py-2 rounded-sm text-xs font-bold border-2 transition-colors"
                  style={paymentMethod === 'cash'
                    ? { borderColor: '#7B1111', backgroundColor: '#7B1111', color: 'white' }
                    : { borderColor: '#e5e7eb', color: '#374151' }
                  }>💵 Cash</button>
                <button onClick={() => setPaymentMethod('online')}
                  className="py-2 rounded-sm text-xs font-bold border-2 transition-colors"
                  style={paymentMethod === 'online'
                    ? { borderColor: '#1a2340', backgroundColor: '#1a2340', color: 'white' }
                    : { borderColor: '#e5e7eb', color: '#374151' }
                  }>💳 Online</button>
              </div>
              {paymentMethod === 'online' && (
                <div className="mb-3 px-3 py-2 rounded-sm border border-blue-200 bg-blue-50">
                  <p className="text-xs font-black text-blue-700 mb-0.5">💳 Online Payment</p>
                  <p className="text-xs text-blue-600 leading-relaxed">
                    This sale will <span className="font-bold">not</span> be added to the cash register.
                  </p>
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    <p className="text-xs text-blue-500">✓ Recorded in sales & analytics</p>
                    <p className="text-xs text-blue-500">✓ Inventory will be deducted</p>
                    <p className="text-xs text-blue-500">✗ Cash on hand NOT affected</p>
                  </div>
                </div>
              )}
              <button onClick={processPayment} disabled={processing}
                className="w-full py-3 rounded-sm font-black text-white text-base disabled:opacity-50 mb-2 transition-colors"
                style={{ backgroundColor: paymentMethod === 'online' ? '#1a2340' : '#10B981' }}>
                {processing
                  ? 'Processing...'
                  : paymentMethod === 'online'
                    ? `Confirm Online ₱${cartTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                    : `Charge ₱${cartTotal.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                }
              </button>
              <button onClick={clearCart}
                className="w-full py-2 rounded-sm font-bold text-xs text-gray-500 hover:bg-gray-50 transition-colors border border-gray-200">
                Clear Cart
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Custom Discount Modal */}
      {showDiscountModal && discountTargetId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm overflow-hidden w-full max-w-xs" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black">Apply Discount</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">
                {cart.find(i => i.product.id === discountTargetId)?.product.name}
              </p>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs text-gray-400 mb-3">Max allowed: {maxDiscountPct}%</p>
              <select value={discountInput} onChange={e => setDiscountInput(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:border-gray-400 mb-4"
                autoFocus>
                <option value="">Select discount...</option>
                {[1, 2, 3, 20, 30].filter(pct => pct <= maxDiscountPct).map(pct => (
                  <option key={pct} value={pct}>{pct}% off</option>
                ))}
              </select>
              <div className="flex gap-3">
                <button onClick={applyDiscount}
                  className="flex-1 py-2 rounded-sm font-bold text-white text-sm"
                  style={{ backgroundColor: '#1a2340' }}>Apply</button>
                <button onClick={() => { setShowDiscountModal(false); setDiscountTargetId(null) }}
                  className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Register Slide-over */}
      {showCash && userId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-end z-50 p-4">
          <div className="w-full max-w-md mt-16 flex flex-col gap-3">
            <div className="flex justify-end">
              <button onClick={() => setShowCash(false)}
                className="px-4 py-2 bg-white rounded-sm text-sm font-bold text-gray-700 hover:bg-gray-100"
                style={{ boxShadow: '2px 2px 7px rgba(0,0,0,0.2)' }}>
                ✕ Close
              </button>
            </div>
            <CashRegisterWidget userId={userId} userRole="cashier" />
          </div>
        </div>
      )}

      {/* Advance Order / Restock Modal */}
      {showRestockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-sm w-full max-w-lg max-h-[90vh] flex flex-col" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <div className="px-6 py-4 shrink-0" style={{ backgroundColor: '#220901' }}>
              <h2 className="text-white font-black text-lg">📦 Advance Order</h2>
              <p className="text-white text-xs opacity-50 mt-0.5">Reserve products for tomorrow or future orders</p>
            </div>

            <form onSubmit={handleRestockSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
                {restockError && <div className="px-3 py-2 rounded-sm text-xs font-semibold text-white bg-red-500">{restockError}</div>}
                {restockSuccess && <div className="px-3 py-2 rounded-sm text-xs font-semibold text-white bg-green-500">{restockSuccess}</div>}

                {restockItems.map((item, index) => {
                  const selectedProduct = restockProducts.find((p: any) => p.id === item.product_id)
                  return (
                    <div key={index} className="rounded-sm border border-gray-200 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-500">Item {index + 1}</span>
                        {restockItems.length > 1 && (
                          <button type="button" onClick={() => removeRestockItem(index)}
                            className="text-xs text-red-400 font-bold hover:text-red-600">Remove</button>
                        )}
                      </div>
                      <div className="px-3 py-3 space-y-2">
                        <select value={item.product_id} onChange={e => updateRestockItem(index, 'product_id', e.target.value)} required
                          className="w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:border-gray-400">
                          <option value="">Select a product...</option>
                          {getAvailableRestockProducts(index).map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — Shop: {p.shop_current_stock} | Prod: {p.production_current_stock}
                            </option>
                          ))}
                        </select>
                        {selectedProduct && (
                          <div className="rounded-sm px-3 py-2 flex gap-4" style={{ backgroundColor: '#220901' }}>
                            <div>
                              <p className="text-white text-xs opacity-50">Shop Stock</p>
                              <p className={`font-black text-base ${selectedProduct.shop_current_stock < selectedProduct.shop_minimum_threshold ? 'text-red-400' : 'text-white'}`}>
                                {selectedProduct.shop_current_stock}
                                <span className="text-xs opacity-50 ml-1">/ min {selectedProduct.shop_minimum_threshold}</span>
                              </p>
                            </div>
                            <div>
                              <p className="text-white text-xs opacity-50">Prod Stock</p>
                              <p className="text-white font-black text-base">{selectedProduct.production_current_stock}</p>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <input type="number" min="1" value={item.requested_quantity}
                              onChange={e => updateRestockItem(index, 'requested_quantity', e.target.value)}
                              required placeholder="Quantity"
                              className="w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:border-gray-400" />
                          </div>
                          <div className="flex-1">
                            <input type="text" value={item.notes}
                              onChange={e => updateRestockItem(index, 'notes', e.target.value)}
                              placeholder="Notes (optional)"
                              className="w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:border-gray-400" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {restockItems.length < restockProducts.length && (
                  <button type="button" onClick={addRestockItem}
                    className="w-full py-2 rounded-sm border-2 border-dashed border-gray-300 text-xs font-bold text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors">
                    + Add Another Product
                  </button>
                )}

                {/* Needed By + Order Notes */}
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      Needed By <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={restockDeliveryDate}
                      onChange={e => setRestockDeliveryDate(e.target.value)}
                      min={getManilaLocalNow()}
                      className="w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 focus:outline-none focus:border-gray-400"
                    />
                    {restockDeliveryDate && (() => {
                      const info = getDeliveryDateInfo(restockDeliveryDate)
                      return info ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-sm mt-1" style={{ backgroundColor: info.bg }}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: info.color }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs font-black" style={{ color: info.color }}>{info.label}</span>
                        </div>
                      ) : null
                    })()}
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      Order Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea value={restockOrderNotes} onChange={e => setRestockOrderNotes(e.target.value)} rows={2}
                      placeholder="e.g., Customer reservation for tomorrow"
                      className="w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-400" />
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
                <button type="submit" disabled={restockSubmitting}
                  className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
                  style={{ backgroundColor: '#1a2340' }}>
                  {restockSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button type="button" onClick={() => setShowRestockModal(false)}
                  className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <Receipt sale={lastSale} onClose={() => { setShowReceipt(false); setLastSale(null) }} />
      )}
    </div>
  )
}
