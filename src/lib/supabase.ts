import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://meqfiyuaxgwbstcdmjgz.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_tAz66t2aypFcvz51fHjXgQ_Ww_-aTqX'

let supabaseInstance: SupabaseClient | null = null
let authedInstance: { client: SupabaseClient; token: string } | null = null

export function getSupabase(accessToken?: string): SupabaseClient {
  if (accessToken) {
    // Reuse cached authenticated client if token hasn't changed
    if (authedInstance && authedInstance.token === accessToken) {
      return authedInstance.client
    }
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    })
    authedInstance = { client, token: accessToken }
    return client
  }

  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  }
  return supabaseInstance
}
