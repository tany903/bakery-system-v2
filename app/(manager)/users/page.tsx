'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getUserProfile, getAllUsers, createUser, deactivateUser, signOut } from '@/lib/auth'
import type { Profile, UserRole } from '@/lib/supabase'
import ManagerSidebar from '@/components/ManagerSidebar'

export default function UsersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<Profile[]>([])
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'cashier' as UserRole,
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    const user = await getCurrentUser()
    if (!user) { router.push('/login'); return }
    const profile = await getUserProfile(user.id)
    if (!profile || profile.role !== 'manager') { router.push('/login'); return }
    await loadUsers()
    setLoading(false)
  }

  async function loadUsers() {
    try {
      setUsers(await getAllUsers())
    } catch {
      setError('Failed to load users')
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSubmitting(true)
    try {
      await createUser(formData.email, formData.password, formData.fullName, formData.role)
      setSuccess('User created successfully!')
      setShowModal(false)
      setFormData({ email: '', password: '', fullName: '', role: 'cashier' })
      await loadUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(userId: string) {
    if (!confirm('Are you sure you want to deactivate this user?')) return
    try {
      await deactivateUser(userId)
      setSuccess('User deactivated')
      await loadUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch {
      setError('Failed to deactivate user')
    }
  }

  const handleLogout = async () => { await signOut(); router.push('/login') }

  // const sidebarLinks = [
  //   { href: '/restock-requests', icon: '/icons/Plus_square.svg', label: 'Restock' },
  //   { href: '/inventory', icon: '/icons/Box.svg', label: 'Inventory' },
  //   { href: '/expenses', icon: '/icons/payment.svg', label: 'Expenses' },
  //   { href: '/analytics', icon: '/icons/Bar_chart.svg', label: 'Analytics' },
  //   { href: '/users', icon: '/icons/person.svg', label: 'Staff', active: true },
  //   { href: '/products', icon: '/icons/Tag.svg', label: 'Products' },
  //   { href: '/ingredients', icon: '/icons/flour.svg', label: 'Ingredients' },
  //   { href: '/audit-logs', icon: '/icons/Book.svg', label: 'Audit' },
  //   { href: '/dashboard', icon: '/icons/menu.svg', label: 'Dashboard' },
  // ]

  const activeCount = users.filter(u => u.is_active).length
  const inputClass = "w-full text-sm px-3 py-2 rounded-sm border border-gray-200 bg-gray-50 focus:outline-none focus:border-gray-400"
  const labelClass = "block text-xs font-bold text-gray-500 mb-1"

  function RoleBadge({ role }: { role: string }) {
    const colors: Record<string, string> = {
      manager: '#7B1111',
      production: '#1a2340',
      cashier: '#6B8F8F',
    }
    return (
      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white capitalize"
        style={{ backgroundColor: colors[role] || '#6B7280' }}>
        {role}
      </span>
    )
  }

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
      <div className="relative z-10 w-full flex items-center justify-between px-6 py-3 shrink-0" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <div className="w-10 h-10 rounded-full bg-yellow-300 border-2 border-white flex items-center justify-center overflow-hidden">
            <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
          </div>
          <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
        </div>
        <button onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 transition-colors">
          <span className="text-base font-bold">→</span>
          <span className="text-xs font-semibold">Logout</span>
        </button>
      </div>

      {/* BODY */}
      <div className="flex flex-1 relative">

        {/* Watermark */}
        <img src="/logo-big.png" alt="" className="fixed pointer-events-none select-none"
          style={{ opacity: 0.3, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '50%', zIndex: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />

        {/* SIDEBAR */}
     <ManagerSidebar />

        {/* MAIN CONTENT */}
        <div className="relative z-10 flex-1 p-6 overflow-y-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-black text-gray-900">Staff Management</h1>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-sm font-bold text-white text-sm"
              style={{ backgroundColor: '#1a2340' }}>
              <img src="/icons/Plus_circle.svg" alt="" className="w-4 h-4" style={{ filter: 'brightness(0) invert(1)' }} />
              Add Staff
            </button>
          </div>

          {error && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-red-500">{error} <button onClick={() => setError('')} className="ml-3 underline text-xs">Dismiss</button></div>}
          {success && <div className="mb-4 px-4 py-3 rounded-sm text-sm font-semibold text-white bg-green-500">{success}</div>}

          {/* Stat Cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Total Staff</p>
              <p className="text-3xl font-black text-white">{users.length}</p>
              <p className="text-white text-xs opacity-50 mt-1">All accounts</p>
            </div>
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Active</p>
              <p className="text-3xl font-black text-white">{activeCount}</p>
              <p className="text-white text-xs opacity-50 mt-1">Can log in</p>
            </div>
            <div className="rounded-sm p-6" style={{ backgroundColor: '#220901', boxShadow: '4px 4px 10px rgba(0,0,0,0.3)' }}>
              <p className="text-white text-xs font-bold uppercase tracking-widest mb-2 opacity-60">Inactive</p>
              <p className="text-3xl font-black text-white">{users.length - activeCount}</p>
              <p className="text-white text-xs opacity-50 mt-1">Deactivated</p>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-sm overflow-hidden" style={{ boxShadow: '0px 0px 10px rgba(0,0,0,0.3)' }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ backgroundColor: '#1a2340' }}>
              <img src="/icons/person.svg" alt="" className="w-5 h-5" style={{ filter: 'brightness(0) invert(1)' }} />
              <h2 className="font-bold text-white">All Staff Accounts</h2>
              <span className="ml-auto text-xs text-white opacity-60">{users.length} accounts</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-5 py-3 font-semibold">Name</th>
                  <th className="px-5 py-3 font-semibold">Email</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">
                      No staff accounts yet — add your first one!
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm font-semibold text-gray-800">{user.full_name}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{user.email}</td>
                      <td className="px-5 py-3"><RoleBadge role={user.role} /></td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          user.is_active ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-3">
                        {user.is_active && (
                          <button onClick={() => handleDeactivate(user.id)}
                            className="text-xs font-bold px-3 py-1 rounded-full text-white bg-red-500 hover:bg-red-600">
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── CREATE USER MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 text-gray-900 placeholder-gray-400">
          <div className="bg-white rounded-sm p-6 max-w-md w-full" style={{ boxShadow: '4px 4px 20px rgba(0,0,0,0.4)' }}>
            <h2 className="text-xl font-black text-gray-900 mb-5">Add New Staff</h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className={labelClass}>Full Name *</label>
                <input type="text" value={formData.fullName} onChange={e => setFormData({ ...formData, fullName: e.target.value })} required className={inputClass} placeholder="e.g., Juan dela Cruz" />
              </div>
              <div>
                <label className={labelClass}>Email *</label>
                <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required className={inputClass} placeholder="e.g., juan@isfreds.com" />
              </div>
              <div>
                <label className={labelClass}>Password *</label>
                <input type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} required minLength={6} className={inputClass} placeholder="Minimum 6 characters" />
              </div>
              <div>
                <label className={labelClass}>Role *</label>
                <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })} className={inputClass}>
                  <option value="cashier">Cashier</option>
                  <option value="production">Production</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={submitting}
                  className="flex-1 py-2 rounded-sm font-bold text-white text-sm disabled:opacity-50"
                  style={{ backgroundColor: '#1a2340' }}>
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setError('') }}
                  className="px-5 py-2 rounded-sm border border-gray-200 text-sm font-semibold hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
