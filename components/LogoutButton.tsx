'use client'

import { useState } from 'react'

interface LogoutButtonProps {
  onLogout: () => void | Promise<void>
}

export default function LogoutButton({ onLogout }: LogoutButtonProps) {
  const [loggingOut, setLoggingOut] = useState(false)

  const handleClick = async () => {
    setLoggingOut(true)
    await onLogout()
    // no need to reset loggingOut — page navigates away on logout
  }

  return (
    <button
      onClick={handleClick}
      disabled={loggingOut}
      className="flex flex-col items-center gap-0.5 px-5 py-2 bg-white rounded-sm text-gray-800 hover:bg-gray-100 hover:brightness-95 active:scale-[0.95] transition-all duration-150 shrink-0 disabled:opacity-60"
    >
      {loggingOut ? (
        <>
          <svg className="animate-spin h-4 w-4 text-gray-800" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-xs font-semibold">Logging out...</span>
        </>
      ) : (
        <>
          <span className="text-base font-bold">→</span>
          <span className="text-xs font-semibold">Logout</span>
        </>
      )}
    </button>
  )
}