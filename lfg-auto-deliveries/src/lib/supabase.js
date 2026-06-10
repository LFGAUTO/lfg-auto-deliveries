import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  // Friendly message instead of a blank screen if env vars are missing.
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. See .env.example')
}

export const supabase = createClient(url || 'http://localhost', anon || 'public-anon-key')

// We log people in with a username; Supabase needs an email, so we map them.
export const EMAIL_DOMAIN = 'lfgauto.app'
export const usernameToEmail = (username) => `${String(username).trim().toLowerCase()}@${EMAIL_DOMAIN}`
