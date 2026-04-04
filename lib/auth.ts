import { supabase } from './supabase'
import type { UserRole, Profile } from './supabase'

const PROFILE_CACHE_KEY = 'freds_user_profile'

function getCachedProfile(): Profile | null {
  try {
    const cached = sessionStorage.getItem(PROFILE_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

function setCachedProfile(profile: Profile): void {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
  } catch {}
}

function clearCachedProfile(): void {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {}
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  clearCachedProfile()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getUserProfile(userId: string): Promise<Profile | null> {
  // Return cached profile if available and matches current user
  const cached = getCachedProfile()
  if (cached && cached.id === userId) return cached

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    console.error('Error fetching profile:', error)
    return null
  }

  // Cache it for subsequent page loads this session
  if (data) setCachedProfile(data)
  return data
}

export async function createUser(
  email: string,
  password: string,
  fullName: string,
  role: UserRole
) {
  const response = await fetch('/api/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, fullName, role }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Failed to create user')
  return data.user
}

export async function updateUserRole(userId: string, role: UserRole) {
  clearCachedProfile() // invalidate cache since role changed
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
  if (error) throw error
}

export async function deactivateUser(userId: string) {
  clearCachedProfile() // invalidate cache since profile changed
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: false })
    .eq('id', userId)
  if (error) throw error
}

export async function getAllUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
