/**
 * AI Cache — persists AI Briefing & Predictions to Supabase
 * so results survive across devices for 24 hours.
 *
 * Table: nsit_ai_cache (user_id, cache_type, content, expires_at)
 * RLS: users can only read/write their own rows.
 */

import { getSupabase } from './supabase'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function getAuthToken(): string | null {
  for (const k of ['sb-meqfiyuaxgwbstcdmjgz-auth-token', 'supabase.auth.token', 'sb-auth-token']) {
    const d = localStorage.getItem(k)
    if (d) {
      try {
        const p = JSON.parse(d)
        if (p.access_token) return p.access_token
        if (p.token) return p.token
      } catch { /* skip */ }
    }
  }
  return sessionStorage.getItem('nsit_auth_token') || null
}

function getUserId(): string | null {
  for (const k of ['sb-meqfiyuaxgwbstcdmjgz-auth-token', 'supabase.auth.token']) {
    const d = localStorage.getItem(k)
    if (d) {
      try {
        const p = JSON.parse(d)
        const id = p.user?.id
        if (id) return id
      } catch { /* skip */ }
    }
  }
  return null
}

/**
 * Save AI result to Supabase cache.
 * cacheType: 'briefing' | 'predictions'
 */
export async function saveAiCache(cacheType: string, content: any): Promise<void> {
  const token = getAuthToken()
  const userId = getUserId()
  if (!token || !userId) return

  try {
    const sb = getSupabase(token)
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()

    await sb.from('nsit_ai_cache').upsert({
      user_id: userId,
      cache_type: cacheType,
      content,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'user_id,cache_type' })
  } catch (err) {
    console.warn('[AI Cache] Save failed:', err)
  }
}

/**
 * Load AI result from Supabase cache.
 * Returns null if no cache, expired, or not authenticated.
 */
export async function loadAiCache<T = any>(cacheType: string): Promise<{ content: T; createdAt: string } | null> {
  const token = getAuthToken()
  const userId = getUserId()
  if (!token || !userId) return null

  try {
    const sb = getSupabase(token)
    const { data, error } = await sb
      .from('nsit_ai_cache')
      .select('content, created_at, expires_at')
      .eq('user_id', userId)
      .eq('cache_type', cacheType)
      .single()

    if (error || !data) return null

    // Check expiry
    if (new Date(data.expires_at) < new Date()) return null

    return { content: data.content as T, createdAt: data.created_at }
  } catch {
    return null
  }
}
