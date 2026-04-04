'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, getUserProfile } from '@/lib/auth'


export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await signIn(email, password)
      if (!data.user) throw new Error('Login failed')

     const profile = await getUserProfile(data.user.id)
      if (!profile) throw new Error('Profile not found')

      if (profile.role === 'manager') router.push('/dashboard')
      else if (profile.role === 'cashier') router.push('/pos')
      else if (profile.role === 'production') router.push('/production')
      else router.push('/dashboard')
    } catch (err: any) {
      console.error('Login error:', err.message)
      setError('Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5A623' }}>

      {/* ── TOP NAVBAR ── */}
      <div className="w-full flex items-center px-8 py-4" style={{ backgroundColor: '#7B1111' }}>
        <div className="flex items-center gap-3">
          <span className="text-white font-black text-xl tracking-wide">IS FREDS</span>
          <img src="/FREDS_ICON1.png" alt="Logo" className="w-10 h-10 object-contain" />
          <span className="text-white font-black text-xl tracking-wide">IS GOOD</span>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 flex relative overflow-hidden">

        {/* Left Side - Mascot Watermark */}
        <div className="w-1/2 relative">
          <img
            src="/logo-big.png"
            alt="Mascot"
            className="absolute inset-0 w-full h-full object-cover object-left"
            style={{ opacity: 0.3 }}
          />
        </div>

        {/* Right Side - Login Form */}
        <div className="w-1/2 flex flex-col justify-center px-16 py-12">

          {/* Big Login Title */}
          <h1
            className="font-black mb-12 leading-none"
            style={{ fontSize: '6rem', color: '#1a1a1a' }}
          >
            Login
          </h1>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4 max-w-md">
            <p className="font-bold text-sm" style={{ color: '#1a1a1a' }}>
              Please login to continue
            </p>

            {/* Email / Username */}
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Username"
              className="w-full px-5 py-4 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-600"
              style={{ backgroundColor: '#fff' }}
            />

            {/* Password */}
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
                className="w-full px-5 py-4 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-600"
                style={{ backgroundColor: '#fff' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? (
                  // Eye-off icon
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  // Eye icon
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-800 text-sm font-semibold bg-red-100 px-4 py-2 rounded-lg">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 font-bold text-white rounded-lg transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#7B1111' }}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>

            <p className="font-black text-xs tracking-widest" style={{ color: '#7B1111' }}>
              USER ACCOUNTS ARE PROVIDED
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
