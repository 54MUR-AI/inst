/**
 * LDGR Bridge for NSIT
 * Fetches encrypted API keys from Supabase and decrypts them client-side
 * using the same AES-256-GCM + PBKDF2 scheme as RMG/LDGR.
 */

import { getSupabase } from './supabase'

// ── Decryption (mirrors RMG/src/lib/ldgr/encryption.ts) ──

async function deriveKey(userId: string, purpose: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(userId),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )
  const salt = encoder.encode(`ldgr:${purpose}:${userId}`)
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
}

async function decryptText(encryptedBase64: string, userId: string, purpose: string): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  const key = await deriveKey(userId, purpose)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)
  return new TextDecoder().decode(decrypted)
}

// ── Auth state ──

interface AuthState {
  accessToken: string | null
  userId: string | null
}

const auth: AuthState = {
  accessToken: null,
  userId: null,
}

/** Called when RMG sends an auth token via postMessage */
export function setAuthToken(rawToken: string) {
  try {
    const parsed = JSON.parse(rawToken)
    if (parsed.access_token) {
      auth.accessToken = parsed.access_token
      // Decode JWT to get user ID
      const payload = JSON.parse(atob(parsed.access_token.split('.')[1]))
      auth.userId = payload.sub || null
    }
  } catch {
    // ignore parse errors
  }
}

export function getAuth(): Readonly<AuthState> {
  return auth
}

export function isAuthenticated(): boolean {
  return !!auth.accessToken && !!auth.userId
}

/**
 * Bootstrap auth from localStorage when running standalone (not embedded in RMG).
 * Reads the Supabase session stored by the auth provider.
 */
export function bootstrapAuth(): boolean {
  if (auth.accessToken && auth.userId) return true // already authenticated

  const STORAGE_KEYS = [
    'sb-meqfiyuaxgwbstcdmjgz-auth-token',
    'supabase.auth.token',
    'sb-auth-token',
  ]

  for (const key of STORAGE_KEYS) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      const token = parsed.access_token || parsed.token
      if (token) {
        setAuthToken(JSON.stringify({ access_token: token }))
        if (auth.accessToken && auth.userId) return true
      }
    } catch {
      // skip malformed entries
    }
  }

  // Also check sessionStorage (set by App.tsx on RMG_AUTH_TOKEN)
  const sessionToken = sessionStorage.getItem('nsit_auth_token')
  if (sessionToken) {
    setAuthToken(JSON.stringify({ access_token: sessionToken }))
    if (auth.accessToken && auth.userId) return true
  }

  return false
}

// ── API Key fetching ──

export interface LdgrApiKey {
  id: string
  service_name: string
  key_name: string
  encrypted_key: string
  is_active: boolean
}

// In-memory cache: service_name → { key, keyName }
const keyCache = new Map<string, { key: string; keyName: string }>()

/**
 * Get a decrypted API key for a given service.
 * Returns null if not authenticated or no key found.
 */
export async function getApiKey(serviceName: string): Promise<string | null> {
  const result = await getApiKeyWithName(serviceName)
  return result?.key ?? null
}

/**
 * Get a decrypted API key AND its key_name for a given service.
 * key_name serves as the clientId/username for APIs that require one
 * (e.g. OpenSky username, RapidAPI app name).
 * Returns null if not authenticated or no key found.
 */
export async function getApiKeyWithName(serviceName: string): Promise<{ key: string; keyName: string } | null> {
  if (!auth.accessToken || !auth.userId) return null

  // Check cache first
  const cached = keyCache.get(serviceName)
  if (cached) return cached

  try {
    const supabase = getSupabase(auth.accessToken)
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, service_name, key_name, encrypted_key, is_active')
      .eq('user_id', auth.userId)
      .eq('service_name', serviceName)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) return null

    // Decrypt
    const decrypted = await decryptText(data.encrypted_key, auth.userId, 'apikeys')
    const entry = { key: decrypted, keyName: data.key_name }
    keyCache.set(serviceName, entry)

    // Update last_used_at
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)

    return entry
  } catch (err) {
    console.warn(`[LDGR Bridge] Failed to get key for ${serviceName}:`, err)
    return null
  }
}

/**
 * List all available API key service names for the current user.
 */
export async function listAvailableServices(): Promise<string[]> {
  if (!auth.accessToken || !auth.userId) return []

  try {
    const supabase = getSupabase(auth.accessToken)
    const { data, error } = await supabase
      .from('api_keys')
      .select('service_name')
      .eq('user_id', auth.userId)
      .eq('is_active', true)

    if (error || !data) return []
    return [...new Set(data.map(d => d.service_name))]
  } catch {
    return []
  }
}

/** Clear the key cache (e.g. on auth change) */
export function clearKeyCache() {
  keyCache.clear()
}

/**
 * Decrypt an API key using user email (matches SCRP's ldgrDecryption.js).
 * Used by SettingsPanel when decrypting keys fetched directly from Supabase.
 */
export async function decryptApiKey(encryptedBase64: string, userEmail: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(userEmail), 'PBKDF2', false, ['deriveBits', 'deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(userEmail), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)
  return new TextDecoder().decode(decrypted)
}
