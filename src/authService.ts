import { supabase } from './supabaseClient'

export interface UserProfile {
  id: string
  username: string
  avatar_url?: string
  translation_language?: string
}

// Convert clean username to internal auth email
function getAuthEmail(username: string): string {
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '')
  return `${clean || 'user'}@notion.internal`
}

/**
 * Sign up a new user with Username and Password
 */
export async function signUpWithUsername(username: string, password: string): Promise<{ user: any; error: string | null }> {
  if (!username.trim() || !password) {
    return { user: null, error: 'Username and password are required' }
  }

  const email = getAuthEmail(username)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: username.trim(),
      },
    },
  })

  if (error) {
    return { user: null, error: error.message }
  }

  if (data.user) {
    // Upsert into public.profiles
    await supabase.from('profiles').upsert({
      id: data.user.id,
      username: username.trim(),
      updated_at: new Date().toISOString(),
    })
  }

  return { user: data.user, error: null }
}

/**
 * Sign in existing user with Username and Password
 */
export async function signInWithUsername(username: string, password: string): Promise<{ user: any; error: string | null }> {
  if (!username.trim() || !password) {
    return { user: null, error: 'Username and password are required' }
  }

  const email = getAuthEmail(username)
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { user: null, error: error.message }
  }

  return { user: data.user, error: null }
}

/**
 * Sign out current session
 */
export async function signOutUser(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signOut()
  return { error: error ? error.message : null }
}

/**
 * Fetch current user profile
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data
}
