import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://meqfiyuaxgwbstcdmjgz.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_tAz66t2aypFcvz51fHjXgQ_Ww_-aTqX'

let supabaseInstance: SupabaseClient | null = null

export function getSupabase(accessToken?: string): SupabaseClient {
  if (accessToken) {
    // Create authenticated client with user's token
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    })
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabaseInstance
}
