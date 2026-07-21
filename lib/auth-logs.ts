import { supabase } from './supabase'

export interface AuthLogEntry {
  id: string
  user_id: string
  action: 'login' | 'logout'
  created_at: string
  profiles?: { full_name: string; role: string } | null
}

/**
 * Records a login or logout event. Failures here are logged to console but
 * never thrown — auth logging should never block an actual login/logout.
 */
export async function logAuthEvent(userId: string, action: 'login' | 'logout'): Promise<void> {
  try {
    const { error } = await supabase
      .from('auth_logs')
      .insert({ user_id: userId, action })
    if (error) console.error('Failed to log auth event:', error)
  } catch (err) {
    console.error('Failed to log auth event:', err)
  }
}

export async function getAllAuthLogs(limit = 500): Promise<AuthLogEntry[]> {
  const { data, error } = await supabase
    .from('auth_logs')
    .select('*, profiles (full_name, role)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as unknown as AuthLogEntry[]) || []
}