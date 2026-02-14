/**
 * FRED (Federal Reserve Economic Data) API client
 * Uses the user's FRED API key from LDGR when available.
 * https://fred.stlouisfed.org/docs/api/fred/
 */

import { getApiKey } from './ldgrBridge'
import { API } from './api'
import { saveAiCache, loadAiCache } from './aiCache'
import { setPipelineState } from './pipelineStatus'

export interface FredObservation {
  date: string
  value: number
}

export interface FredSeriesData {
  seriesId: string
  label: string
  unit: string
  latestValue: number
  previousValue: number
  change: number
  observations: FredObservation[]
}

// Key macro series we track
export const FRED_SERIES = [
  { id: 'DFF', label: 'Fed Funds Rate', unit: '%' },
  { id: 'CPIAUCSL', label: 'CPI (All Urban)', unit: 'Index' },
  { id: 'UNRATE', label: 'Unemployment Rate', unit: '%' },
  { id: 'T10Y2Y', label: '10Y-2Y Spread', unit: '%' },
  { id: 'GDP', label: 'Real GDP', unit: 'B$' },
  { id: 'M2SL', label: 'M2 Money Supply', unit: 'B$' },
  { id: 'DTWEXBGS', label: 'Trade-Weighted USD', unit: 'Index' },
  { id: 'VIXCLS', label: 'VIX', unit: 'Index' },
] as const

const FRED_PROXY = API.fred('/fred')
const SCRP_API_FRED = 'https://scrp-api.onrender.com/fred'

/**
 * Fetch a FRED URL, trying multiple proxy strategies:
 * 1. scrp-api backend (server-side proxy, no CORS)
 * 2. Render _redirects proxy (may return HTML)
 * 3. Direct FRED API (works in dev via Vite proxy)
 */
async function fetchFred(path: string): Promise<Response> {
  // 1. Try scrp-api backend proxy (most reliable — server-side fetch)
  try {
    const res = await fetch(`${SCRP_API_FRED}${path}`, { headers: { 'Accept': 'application/json' } })
    if (res.ok) return res
    console.warn('[FRED] scrp-api proxy returned', res.status)
  } catch (err) {
    console.warn('[FRED] scrp-api proxy failed:', err)
  }

  // 2. Try local Render _redirects proxy
  try {
    const res = await fetch(`${FRED_PROXY}${path}`, { headers: { 'Accept': 'application/json' } })
    if (res.ok) {
      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('text/html')) return res
    }
  } catch {
    // proxy failed
  }

  // All proxies failed
  return new Response(null, { status: 502, statusText: 'All FRED proxies failed' })
}

let cachedKey: string | null = null
let keyChecked = false
let cachedData: { data: FredSeriesData[]; ts: number } | null = null
const CACHE_TTL = 600_000 // 10 min in-memory
const SUPABASE_CACHE_KEY = 'fred-macro'

async function getFredKey(): Promise<string | null> {
  // Only cache a successful key lookup; retry on null so auth bootstrap has time
  if (cachedKey) return cachedKey
  if (keyChecked && cachedKey === null) {
    // Retry once more after a delay (auth may have bootstrapped late)
    keyChecked = false
  }
  const key = await getApiKey('fred')
  if (key) cachedKey = key
  keyChecked = true
  return key
}

/** Check if user has a FRED key available */
export async function hasFredKey(): Promise<boolean> {
  return (await getFredKey()) !== null
}

/** Clear cached key (call on auth change) */
export function clearFredCache() {
  cachedKey = null
  keyChecked = false
  cachedData = null
}

/**
 * Fetch a single FRED series with observations.
 * Returns last ~2 years of data.
 */
async function fetchSeries(
  seriesId: string,
  apiKey: string,
  label: string,
  unit: string
): Promise<FredSeriesData | null> {
  try {
    // Get observations for last 2 years
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const startDate = twoYearsAgo.toISOString().split('T')[0]

    const path = `/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}&sort_order=asc`
    const res = await fetchFred(path)
    if (!res.ok) return null

    const json = await res.json()
    const obs: FredObservation[] = (json.observations || [])
      .filter((o: any) => o.value !== '.')
      .map((o: any) => ({ date: o.date.slice(0, 7), value: parseFloat(o.value) }))
      .filter((o: FredObservation) => !isNaN(o.value))

    if (obs.length === 0) return null

    // Deduplicate by month (keep last observation per month)
    const byMonth = new Map<string, FredObservation>()
    obs.forEach(o => byMonth.set(o.date, o))
    const deduped = Array.from(byMonth.values())

    const latest = deduped[deduped.length - 1]
    const prev = deduped.length > 1 ? deduped[deduped.length - 2] : latest
    const change = latest.value - prev.value

    return {
      seriesId,
      label,
      unit,
      latestValue: latest.value,
      previousValue: prev.value,
      change,
      observations: deduped.slice(-12), // last 12 months for chart
    }
  } catch (err) {
    console.warn(`[FRED] Failed to fetch ${seriesId}:`, err)
    return null
  }
}

/**
 * Fetch all macro series. Returns cached data if fresh.
 * Returns null if no FRED key available.
 */
export async function fetchFredData(
  seriesIds?: typeof FRED_SERIES[number]['id'][]
): Promise<FredSeriesData[] | null> {
  const apiKey = await getFredKey()
  if (!apiKey) {
    setPipelineState('fred', 'error', 'No FRED API key — add one in LDGR')
    return null
  }

  setPipelineState('fred', 'loading', undefined, true)

  // Check cache
  if (cachedData && Date.now() - cachedData.ts < CACHE_TTL) {
    if (!seriesIds) return cachedData.data
    return cachedData.data.filter(d => seriesIds.includes(d.seriesId as any))
  }

  const targets = seriesIds
    ? FRED_SERIES.filter(s => seriesIds.includes(s.id))
    : FRED_SERIES.slice(0, 4) // Default: first 4 (dashboard view)

  const results = await Promise.allSettled(
    targets.map(s => fetchSeries(s.id, apiKey, s.label, s.unit))
  )

  const data = results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean) as FredSeriesData[]

  if (data.length > 0) {
    cachedData = { data, ts: Date.now() }
    setPipelineState('fred', 'ok', `${data.length} series`, true)
    // Persist to Supabase for fast reload (fire-and-forget)
    saveAiCache(SUPABASE_CACHE_KEY, data).catch(() => {})
  } else {
    setPipelineState('fred', 'error', 'No data returned')
  }

  return data.length > 0 ? data : null
}

/**
 * Load FRED data from Supabase cache (instant load on revisit).
 * Returns null if no cache or expired.
 */
export async function loadCachedFredData(): Promise<FredSeriesData[] | null> {
  // Check in-memory first
  if (cachedData && Date.now() - cachedData.ts < CACHE_TTL) {
    return cachedData.data
  }
  // Try Supabase cache
  try {
    const cached = await loadAiCache<FredSeriesData[]>(SUPABASE_CACHE_KEY)
    if (cached && cached.content && cached.content.length > 0) {
      cachedData = { data: cached.content, ts: Date.now() }
      return cached.content
    }
  } catch { /* no cache */ }
  return null
}

/**
 * Fetch the latest observation for a FRED series near a given date.
 * Used by Economic Calendar to show actual values after release.
 * Returns { value, date } or null.
 */
export async function fetchFredObservationNear(
  seriesId: string,
  targetDate: string // YYYY-MM-DD
): Promise<{ value: number; date: string } | null> {
  const apiKey = await getFredKey()
  if (!apiKey) return null

  try {
    // Fetch observations in a window around the target date
    const start = new Date(targetDate + 'T00:00:00')
    start.setMonth(start.getMonth() - 2)
    const end = new Date(targetDate + 'T00:00:00')
    end.setMonth(end.getMonth() + 1)

    const path = `/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${start.toISOString().split('T')[0]}&observation_end=${end.toISOString().split('T')[0]}&sort_order=desc&limit=2`
    const res = await fetchFred(path)
    if (!res.ok) return null

    const json = await res.json()
    const obs = (json.observations || [])
      .filter((o: any) => o.value !== '.')
      .map((o: any) => ({ date: o.date, value: parseFloat(o.value) }))
      .filter((o: any) => !isNaN(o.value))

    if (obs.length === 0) return null
    return obs[0] // most recent observation near the target date
  } catch {
    return null
  }
}

// FRED series IDs mapped to calendar event categories
export const FRED_CALENDAR_SERIES: Record<string, { seriesId: string; format: (v: number) => string }> = {
  cpi: { seriesId: 'CPIAUCSL', format: (v) => `${v.toFixed(1)}` },
  jobs: { seriesId: 'UNRATE', format: (v) => `${v.toFixed(1)}%` },
  gdp: { seriesId: 'GDP', format: (v) => `$${(v / 1000).toFixed(2)}T` },
  fomc: { seriesId: 'DFF', format: (v) => `${v.toFixed(2)}%` },
}

/**
 * Build a context string of FRED data for the AI prediction engine.
 */
export async function buildFredContext(): Promise<string | null> {
  const allSeries = FRED_SERIES.map(s => s.id) as any
  const data = await fetchFredData(allSeries)
  if (!data || data.length === 0) return null

  const lines = data.map(s => {
    const dir = s.change >= 0 ? '+' : ''
    const val = Math.abs(s.latestValue) > 1000
      ? `${(s.latestValue / 1000).toFixed(1)}T`
      : s.latestValue.toFixed(2)
    return `  ${s.label}: ${val} ${s.unit} (${dir}${s.change.toFixed(2)} MoM)`
  })

  return 'FRED MACRO DATA (LIVE):\n' + lines.join('\n')
}
