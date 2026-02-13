/**
 * FRED (Federal Reserve Economic Data) API client
 * Uses the user's FRED API key from LDGR when available.
 * https://fred.stlouisfed.org/docs/api/fred/
 */

import { getApiKey } from './ldgrBridge'

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

const FRED_BASE = 'https://api.stlouisfed.org/fred'

let cachedKey: string | null | undefined = undefined
let cachedData: { data: FredSeriesData[]; ts: number } | null = null
const CACHE_TTL = 600_000 // 10 minutes

async function getFredKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey
  cachedKey = await getApiKey('fred')
  return cachedKey
}

/** Check if user has a FRED key available */
export async function hasFredKey(): Promise<boolean> {
  return (await getFredKey()) !== null
}

/** Clear cached key (call on auth change) */
export function clearFredCache() {
  cachedKey = undefined
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

    const url = `${FRED_BASE}/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startDate}&sort_order=asc`
    const res = await fetch(url)
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
  if (!apiKey) return null

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
  }

  return data.length > 0 ? data : null
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
