/**
 * Conflict data APIs — OpenSky, AIS Vessels, ACLED, NASA FIRMS, GDELT
 * OpenSky supports authenticated requests via LDGR API key (username:password).
 * Authenticated users get 4x rate limit (4000 req/day vs 400).
 * AIS vessel tracking uses Digitraffic (free) with optional premium AIS-Hub key.
 */

import { getApiKeyWithName } from './ldgrBridge'
import { setPipelineState } from './pipelineStatus'

// ── Types ──

export interface Aircraft {
  icao24: string
  callsign: string
  originCountry: string
  longitude: number | null
  latitude: number | null
  baroAltitude: number | null
  velocity: number | null
  trueTrack: number | null
  onGround: boolean
  squawk: string | null
  category: number
}

export interface ConflictEvent {
  id: string
  eventDate: string
  eventType: string
  subEventType: string
  actor1: string
  actor2: string
  country: string
  admin1: string
  location: string
  latitude: number
  longitude: number
  fatalities: number
  notes: string
  source: string
}

export interface Hotspot {
  latitude: number
  longitude: number
  brightness: number
  confidence: string
  acqDate: string
  acqTime: string
  satellite: string
  frp: number // fire radiative power
}

export interface GdeltEvent {
  title: string
  url: string
  domain: string
  language: string
  sourcecountry: string
  tone: number
  dateadded: string
  image?: string
}

export interface GdeltTension {
  country: string
  avgTone: number
  eventCount: number
  goldsteinScale: number // -10 (conflict) to +10 (cooperation)
}

// ── OpenSky Network — Live Aircraft ──
// Auth: OAuth2 Client Credentials flow (post-March 2025 accounts)
//   LDGR Key Name = client_id, API Key = client_secret
//   Token endpoint: POST auth.opensky-network.org/.../token
//   Bearer token cached ~25min (expires at 30min)
//   Falls back to Basic Auth for legacy accounts, then anonymous
// Credit system: bounded area queries cost 1-4 credits vs 4 for global

const OPENSKY_API = 'https://opensky-network.org/api'
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'

// Military ICAO24 hex ranges (partial — US, UK, NATO)
const MILITARY_PREFIXES = [
  'ae', // US military
  'af', // US military
  '43c', // UK military
  '3f', // Germany military
  '3e', // Germany military
  '380', // France military
  '340', // Italy military
]

function isMilitaryIcao(icao24: string): boolean {
  const lower = icao24.toLowerCase()
  return MILITARY_PREFIXES.some(p => lower.startsWith(p))
}

// OAuth2 token cache
let openskyToken: { token: string; expiresAt: number } | null = null
let openskyAuthMode: 'oauth2' | 'basic' | 'anon' = 'anon'
// Remember when OAuth2/Basic Auth are CORS-blocked so we don't spam failed requests
let openskyAuthCorsBlocked = false
let openskyAuthCorsBlockedAt = 0
const OPENSKY_AUTH_CORS_RETRY = 1_800_000 // 30 min before retrying auth

/**
 * Get a Bearer token via OAuth2 Client Credentials flow.
 * Returns null if no LDGR key or token fetch fails.
 */
async function getOAuth2Token(clientId: string, clientSecret: string, forceRefresh = false): Promise<string | null> {
  // Return cached token if still valid (refresh 5min before expiry)
  if (!forceRefresh && openskyToken && Date.now() < openskyToken.expiresAt - 300_000) {
    return openskyToken.token
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    })

    const res = await fetch(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn(`[OpenSky] OAuth2 token request failed: ${res.status}`)
      openskyToken = null
      return null
    }

    const json = await res.json()
    const token = json.access_token
    const expiresIn = json.expires_in || 1800 // default 30min

    openskyToken = {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    }

    return token
  } catch (err) {
    console.warn('[OpenSky] OAuth2 token fetch error:', err)
    openskyToken = null
    return null
  }
}

// Default bounded regions for credit-efficient queries (1 credit each)
// These cover major conflict/military activity zones
const OPENSKY_REGIONS = [
  { name: 'Europe', lamin: 35, lomin: -12, lamax: 72, lomax: 45 },
  { name: 'Middle East', lamin: 12, lomin: 25, lamax: 42, lomax: 65 },
  { name: 'East Asia', lamin: 20, lomin: 95, lamax: 50, lomax: 145 },
]

let aircraftCache: { data: Aircraft[]; ts: number } | null = null
let openskyFailed = false
let openskyFailedAt = 0
let openskyInflight: Promise<Aircraft[]> | null = null
const AIRCRAFT_CACHE_TTL = 60_000 // 1 min (OpenSky rate-limits aggressively)
const OPENSKY_RETRY_BACKOFF = 120_000 // 2 min after 429

export function fetchLiveAircraft(bounds?: {
  lamin: number; lomin: number; lamax: number; lomax: number
}): Promise<Aircraft[]> {
  if (aircraftCache && Date.now() - aircraftCache.ts < AIRCRAFT_CACHE_TTL) {
    return Promise.resolve(aircraftCache.data)
  }
  if (openskyFailed && Date.now() - openskyFailedAt < OPENSKY_RETRY_BACKOFF) {
    return Promise.resolve(aircraftCache?.data || [])
  }
  // Deduplicate concurrent calls
  if (openskyInflight) return openskyInflight
  openskyInflight = _fetchLiveAircraftImpl(bounds).finally(() => { openskyInflight = null })
  return openskyInflight
}

/**
 * Build Authorization header for OpenSky.
 * Tries OAuth2 first (new accounts), falls back to Basic Auth (legacy), then anonymous.
 */
async function getOpenSkyAuth(): Promise<{ headers: Record<string, string>; usingKey: boolean }> {
  const headers: Record<string, string> = {}
  let usingKey = false

  // If auth is known to be CORS-blocked, skip entirely until retry window
  if (openskyAuthCorsBlocked && Date.now() - openskyAuthCorsBlockedAt < OPENSKY_AUTH_CORS_RETRY) {
    openskyAuthMode = 'anon'
    return { headers, usingKey }
  }

  try {
    const creds = await getApiKeyWithName('opensky')
    if (creds) {
      // Try OAuth2 Client Credentials flow first (post-March 2025 accounts)
      const token = await getOAuth2Token(creds.keyName, creds.key)
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
        openskyAuthMode = 'oauth2'
        usingKey = true
      } else {
        // OAuth2 failed (likely CORS) — skip Basic Auth too since OpenSky's
        // auth endpoints don't support CORS from browser origins.
        // Fall back to anonymous mode.
        openskyAuthCorsBlocked = true
        openskyAuthCorsBlockedAt = Date.now()
        openskyAuthMode = 'anon'
        console.info('[OpenSky] Auth CORS-blocked — using anonymous mode for 30min')
      }
    } else {
      openskyAuthMode = 'anon'
    }
  } catch {
    openskyAuthMode = 'anon'
  }

  return { headers, usingKey }
}

/**
 * Fetch a single OpenSky region. Returns Aircraft[], 'retry-auth' on 401, or 'error'.
 */
async function _fetchOpenSkyRegion(
  bounds: { lamin: number; lomin: number; lamax: number; lomax: number } | undefined,
  headers: Record<string, string>
): Promise<Aircraft[] | 'retry-auth' | 'error'> {
  let url = `${OPENSKY_API}/states/all`
  if (bounds) {
    url += `?lamin=${bounds.lamin}&lomin=${bounds.lomin}&lamax=${bounds.lamax}&lomax=${bounds.lomax}`
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers })

  if (!res.ok) {
    if (res.status === 401) return 'retry-auth'
    if (res.status === 429) {
      openskyFailed = true
      openskyFailedAt = Date.now()
      setPipelineState('opensky', 'rate-limited', `429 — ${openskyAuthMode} limit hit`)
    }
    return 'error'
  }

  const json = await res.json()
  const states: any[][] = json.states || []

  return states
    .filter(s => s[5] != null && s[6] != null)
    .map(s => ({
      icao24: s[0],
      callsign: (s[1] || '').trim(),
      originCountry: s[2],
      longitude: s[5],
      latitude: s[6],
      baroAltitude: s[7],
      velocity: s[9],
      trueTrack: s[10],
      onGround: s[8],
      squawk: s[14],
      category: s[17] || 0,
    }))
}

/**
 * Handle a 401 by force-refreshing the OAuth2 token and returning new headers.
 * Returns null if refresh fails (e.g. legacy account with wrong creds).
 */
async function _handleOpenSky401(
  _oldHeaders: Record<string, string>
): Promise<Record<string, string> | null> {
  // Don't retry auth if we know it's CORS-blocked
  if (openskyAuthCorsBlocked) return null

  try {
    const creds = await getApiKeyWithName('opensky')
    if (!creds) return null

    // Force refresh the token
    openskyToken = null
    const token = await getOAuth2Token(creds.keyName, creds.key, true)
    if (token) {
      return { 'Authorization': `Bearer ${token}` }
    }

    // OAuth2 refresh failed — mark as CORS-blocked, don't try Basic Auth
    openskyAuthCorsBlocked = true
    openskyAuthCorsBlockedAt = Date.now()
    return null
  } catch {
    return null
  }
}

async function _fetchLiveAircraftImpl(bounds?: {
  lamin: number; lomin: number; lamax: number; lomax: number
}): Promise<Aircraft[]> {
  try {
    const { headers, usingKey } = await getOpenSkyAuth()
    setPipelineState('opensky', 'loading', undefined, usingKey)

    let allAircraft: Aircraft[] = []

    if (bounds) {
      // Single bounded query (1-4 credits depending on area)
      const result = await _fetchOpenSkyRegion(bounds, headers)
      if (result === 'retry-auth') {
        // 401 — token expired, force refresh and retry once
        const retryResult = await _handleOpenSky401(headers)
        if (retryResult) {
          const r2 = await _fetchOpenSkyRegion(bounds, retryResult)
          if (Array.isArray(r2)) allAircraft = r2
        }
      } else if (Array.isArray(result)) {
        allAircraft = result
      } else {
        return aircraftCache?.data || []
      }
    } else if (usingKey) {
      // Authenticated: fetch multiple regions for better credit efficiency
      // 3 regions × 2 credits each = 6 credits vs 4 for global (but better coverage focus)
      const regionResults = await Promise.allSettled(
        OPENSKY_REGIONS.map(r => _fetchOpenSkyRegion(r, headers))
      )

      for (const r of regionResults) {
        if (r.status === 'fulfilled') {
          if (r.value === 'retry-auth') {
            // Token expired mid-batch — refresh and re-fetch this region
            const retryHeaders = await _handleOpenSky401(headers)
            if (retryHeaders) {
              // Re-fetch all regions with new token
              const retryResults = await Promise.allSettled(
                OPENSKY_REGIONS.map(reg => _fetchOpenSkyRegion(reg, retryHeaders))
              )
              allAircraft = []
              for (const rr of retryResults) {
                if (rr.status === 'fulfilled' && Array.isArray(rr.value)) {
                  allAircraft.push(...rr.value)
                }
              }
            }
            break
          } else if (Array.isArray(r.value)) {
            allAircraft.push(...r.value)
          }
        }
      }

      // Deduplicate by icao24 (regions may overlap slightly)
      const seen = new Set<string>()
      allAircraft = allAircraft.filter(a => {
        if (seen.has(a.icao24)) return false
        seen.add(a.icao24)
        return true
      })
    } else {
      // Anonymous: single global query (4 credits, but no auth needed)
      const result = await _fetchOpenSkyRegion(undefined, headers)
      if (Array.isArray(result)) {
        allAircraft = result
      } else {
        return aircraftCache?.data || []
      }
    }

    openskyFailed = false
    aircraftCache = { data: allAircraft, ts: Date.now() }
    const authLabel = openskyAuthMode === 'oauth2' ? 'OAuth2' : openskyAuthMode === 'basic' ? 'Basic' : 'Anon'
    setPipelineState('opensky', 'ok', `${allAircraft.length} aircraft · ${authLabel}`, usingKey)
    return allAircraft
  } catch (err) {
    console.warn('[Conflict] OpenSky fetch failed:', err)
    setPipelineState('opensky', 'error', err instanceof Error ? err.message : 'Network error')
    return aircraftCache?.data || []
  }
}

export async function fetchMilitaryAircraft(): Promise<Aircraft[]> {
  const all = await fetchLiveAircraft()
  return all.filter(a => isMilitaryIcao(a.icao24))
}

// ── OpenSky — Track by Aircraft ──
// GET /tracks?icao24=<hex>&time=0  (time=0 → live track)
// Returns waypoints: [time, lat, lng, baro_altitude, true_track, on_ground]

export interface AircraftTrackWaypoint {
  time: number
  latitude: number | null
  longitude: number | null
  baroAltitude: number | null
  trueTrack: number | null
  onGround: boolean
}

export interface AircraftTrack {
  icao24: string
  callsign: string
  startTime: number
  endTime: number
  path: AircraftTrackWaypoint[]
}

// Simple per-icao track cache (short TTL — tracks change frequently)
const trackCache = new Map<string, { data: AircraftTrack; ts: number }>()
const TRACK_CACHE_TTL = 60_000 // 1 min

export async function fetchAircraftTrack(icao24: string, time = 0): Promise<AircraftTrack | null> {
  const cacheKey = `${icao24}-${time}`
  const cached = trackCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < TRACK_CACHE_TTL) return cached.data

  try {
    const { headers } = await getOpenSkyAuth()
    const url = `${OPENSKY_API}/tracks/all?icao24=${icao24.toLowerCase()}&time=${time}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers })

    if (!res.ok) {
      if (res.status === 404) return null // no track available
      console.warn(`[OpenSky] Track fetch failed: ${res.status}`)
      return null
    }

    const json = await res.json()
    const track: AircraftTrack = {
      icao24: json.icao24 || icao24,
      callsign: (json.callsign || '').trim(),
      startTime: json.startTime || 0,
      endTime: json.endTime || 0,
      path: (json.path || []).map((wp: any[]) => ({
        time: wp[0],
        latitude: wp[1],
        longitude: wp[2],
        baroAltitude: wp[3],
        trueTrack: wp[4],
        onGround: wp[5] ?? false,
      })),
    }

    trackCache.set(cacheKey, { data: track, ts: Date.now() })
    return track
  } catch (err) {
    console.warn('[OpenSky] Track fetch error:', err)
    return null
  }
}

// ── OpenSky — Flights by Aircraft ──
// GET /flights/aircraft?icao24=<hex>&begin=<unix>&end=<unix>
// Max interval: 2 days. Batch-processed nightly (previous day or earlier).

export interface FlightRecord {
  icao24: string
  callsign: string
  firstSeen: number
  lastSeen: number
  estDepartureAirport: string | null
  estArrivalAirport: string | null
  estDepartureAirportHorizDistance: number
  estDepartureAirportVertDistance: number
  estArrivalAirportHorizDistance: number
  estArrivalAirportVertDistance: number
  departureAirportCandidatesCount: number
  arrivalAirportCandidatesCount: number
}

const flightHistoryCache = new Map<string, { data: FlightRecord[]; ts: number }>()
const FLIGHT_HISTORY_CACHE_TTL = 300_000 // 5 min (data is nightly batch, doesn't change often)

export async function fetchFlightsByAircraft(icao24: string, days = 2): Promise<FlightRecord[]> {
  const cached = flightHistoryCache.get(icao24)
  if (cached && Date.now() - cached.ts < FLIGHT_HISTORY_CACHE_TTL) return cached.data

  try {
    const { headers } = await getOpenSkyAuth()
    const end = Math.floor(Date.now() / 1000)
    const begin = end - days * 86400
    const url = `${OPENSKY_API}/flights/aircraft?icao24=${icao24.toLowerCase()}&begin=${begin}&end=${end}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers })

    if (!res.ok) {
      if (res.status === 404) return [] // no flights found
      console.warn(`[OpenSky] Flight history fetch failed: ${res.status}`)
      return []
    }

    const json = await res.json()
    const flights: FlightRecord[] = (Array.isArray(json) ? json : []).map((f: any) => ({
      icao24: f.icao24 || icao24,
      callsign: (f.callsign || '').trim(),
      firstSeen: f.firstSeen || 0,
      lastSeen: f.lastSeen || 0,
      estDepartureAirport: f.estDepartureAirport || null,
      estArrivalAirport: f.estArrivalAirport || null,
      estDepartureAirportHorizDistance: f.estDepartureAirportHorizDistance || 0,
      estDepartureAirportVertDistance: f.estDepartureAirportVertDistance || 0,
      estArrivalAirportHorizDistance: f.estArrivalAirportHorizDistance || 0,
      estArrivalAirportVertDistance: f.estArrivalAirportVertDistance || 0,
      departureAirportCandidatesCount: f.departureAirportCandidatesCount || 0,
      arrivalAirportCandidatesCount: f.arrivalAirportCandidatesCount || 0,
    }))

    flightHistoryCache.set(icao24, { data: flights, ts: Date.now() })
    return flights
  } catch (err) {
    console.warn('[OpenSky] Flight history error:', err)
    return []
  }
}

// ── OpenSky — Airport Activity (Arrivals + Departures) ──
// GET /flights/arrival?airport=<ICAO>&begin=<unix>&end=<unix>
// GET /flights/departure?airport=<ICAO>&begin=<unix>&end=<unix>
// Max interval: 2 days. Batch-processed nightly.

// Key military/strategic airbases to monitor
export const MILITARY_AIRBASES: { icao: string; name: string; country: string }[] = [
  { icao: 'ETAR', name: 'Ramstein AB', country: 'Germany' },
  { icao: 'ETAD', name: 'Spangdahlem AB', country: 'Germany' },
  { icao: 'EGVA', name: 'RAF Fairford', country: 'UK' },
  { icao: 'EGUN', name: 'RAF Mildenhall', country: 'UK' },
  { icao: 'LIPA', name: 'Aviano AB', country: 'Italy' },
  { icao: 'LTAG', name: 'Incirlik AB', country: 'Turkey' },
  { icao: 'OKBK', name: 'Al Mubarak AB', country: 'Kuwait' },
  { icao: 'OKAS', name: 'Ali Al Salem AB', country: 'Kuwait' },
  { icao: 'OMAD', name: 'Al Dhafra AB', country: 'UAE' },
  { icao: 'RJTY', name: 'Yokota AB', country: 'Japan' },
  { icao: 'RKSO', name: 'Osan AB', country: 'South Korea' },
  { icao: 'PGUA', name: 'Andersen AFB', country: 'Guam' },
  { icao: 'PHNL', name: 'Hickam AFB', country: 'Hawaii' },
  { icao: 'KDOV', name: 'Dover AFB', country: 'US' },
  { icao: 'KWRI', name: 'McGuire AFB', country: 'US' },
]

export interface AirportActivity {
  airport: { icao: string; name: string; country: string }
  arrivals: FlightRecord[]
  departures: FlightRecord[]
  totalMovements: number
}

const airportActivityCache = new Map<string, { data: AirportActivity; ts: number }>()
const AIRPORT_ACTIVITY_CACHE_TTL = 600_000 // 10 min

export async function fetchAirportActivity(
  airportIcao: string,
  hours = 24
): Promise<AirportActivity | null> {
  const cached = airportActivityCache.get(airportIcao)
  if (cached && Date.now() - cached.ts < AIRPORT_ACTIVITY_CACHE_TTL) return cached.data

  const base = MILITARY_AIRBASES.find(a => a.icao === airportIcao)
  const airport = base || { icao: airportIcao, name: airportIcao, country: '' }

  try {
    const { headers } = await getOpenSkyAuth()
    const end = Math.floor(Date.now() / 1000)
    const begin = end - hours * 3600

    const [arrRes, depRes] = await Promise.allSettled([
      fetch(`${OPENSKY_API}/flights/arrival?airport=${airportIcao}&begin=${begin}&end=${end}`, {
        signal: AbortSignal.timeout(10000), headers,
      }),
      fetch(`${OPENSKY_API}/flights/departure?airport=${airportIcao}&begin=${begin}&end=${end}`, {
        signal: AbortSignal.timeout(10000), headers,
      }),
    ])

    // If both fetches were rejected (CORS/network), bail immediately
    if (arrRes.status === 'rejected' && depRes.status === 'rejected') {
      throw new Error('OPENSKY_NETWORK_ERROR')
    }

    // Bail immediately on 429 so the sequential loop can stop
    const check429 = (result: PromiseSettledResult<Response>) => {
      if (result.status === 'fulfilled' && result.value.status === 429) {
        throw new Error('OPENSKY_RATE_LIMITED')
      }
    }
    check429(arrRes)
    check429(depRes)

    const parseFlights = async (result: PromiseSettledResult<Response>): Promise<FlightRecord[]> => {
      if (result.status !== 'fulfilled' || !result.value.ok) return []
      try {
        const json = await result.value.json()
        return (Array.isArray(json) ? json : []).map((f: any) => ({
          icao24: f.icao24 || '',
          callsign: (f.callsign || '').trim(),
          firstSeen: f.firstSeen || 0,
          lastSeen: f.lastSeen || 0,
          estDepartureAirport: f.estDepartureAirport || null,
          estArrivalAirport: f.estArrivalAirport || null,
          estDepartureAirportHorizDistance: f.estDepartureAirportHorizDistance || 0,
          estDepartureAirportVertDistance: f.estDepartureAirportVertDistance || 0,
          estArrivalAirportHorizDistance: f.estArrivalAirportHorizDistance || 0,
          estArrivalAirportVertDistance: f.estArrivalAirportVertDistance || 0,
          departureAirportCandidatesCount: f.departureAirportCandidatesCount || 0,
          arrivalAirportCandidatesCount: f.arrivalAirportCandidatesCount || 0,
        }))
      } catch { return [] }
    }

    const arrivals = await parseFlights(arrRes)
    const departures = await parseFlights(depRes)

    const activity: AirportActivity = {
      airport,
      arrivals,
      departures,
      totalMovements: arrivals.length + departures.length,
    }

    airportActivityCache.set(airportIcao, { data: activity, ts: Date.now() })
    return activity
  } catch (err: any) {
    // Re-throw rate limit errors so the sequential loop can bail out
    if (err?.message === 'OPENSKY_RATE_LIMITED') throw err
    // Re-throw network errors (CORS blocks, timeouts) so the loop can bail
    if (err?.message === 'OPENSKY_NETWORK_ERROR') throw err
    // If both fetches failed with TypeError (CORS), signal network error
    if (err instanceof TypeError) {
      throw new Error('OPENSKY_NETWORK_ERROR')
    }
    console.warn(`[OpenSky] Airport activity error for ${airportIcao}:`, err)
    return null
  }
}

/** Fetch activity for all monitored military airbases — sequential with delay to avoid 429 */
let airbaseActivityAllCache: { data: AirportActivity[]; ts: number } | null = null
const AIRBASE_ALL_CACHE_TTL = 600_000 // 10 min

export async function fetchAllMilitaryAirbaseActivity(hours = 24): Promise<AirportActivity[]> {
  // Return cache if fresh
  if (airbaseActivityAllCache && Date.now() - airbaseActivityAllCache.ts < AIRBASE_ALL_CACHE_TTL) {
    return airbaseActivityAllCache.data
  }

  const results: AirportActivity[] = []
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
  let consecutiveFailures = 0

  for (const base of MILITARY_AIRBASES) {
    try {
      const activity = await fetchAirportActivity(base.icao, hours)
      if (activity) {
        results.push(activity)
        consecutiveFailures = 0
      } else {
        consecutiveFailures++
      }
    } catch (err: any) {
      // Stop immediately if rate-limited or network-blocked
      if (err?.message === 'OPENSKY_RATE_LIMITED') {
        console.warn('[OpenSky] Rate limited — stopping airbase activity fetch')
        break
      }
      if (err?.message === 'OPENSKY_NETWORK_ERROR') {
        console.warn('[OpenSky] Network/CORS error — stopping airbase activity fetch')
        break
      }
      consecutiveFailures++
    }
    // Bail after 2 consecutive failures (API is likely down or blocked)
    if (consecutiveFailures >= 2) {
      console.warn(`[OpenSky] ${consecutiveFailures} consecutive failures — stopping airbase fetch`)
      break
    }
    // 1.5s delay between bases to stay under rate limits
    await delay(1500)
  }

  const sorted = results.sort((a, b) => b.totalMovements - a.totalMovements)
  airbaseActivityAllCache = { data: sorted, ts: Date.now() }
  return sorted
}

// ── Conflict Events (via GDELT Event API) ──
// ACLED requires paid API key; using GDELT event search instead (free, no auth)
const SCRP_API = 'https://scrp-api.onrender.com'

let conflictEventsCache: { data: ConflictEvent[]; ts: number } | null = null
let conflictEventsFailed = false
let conflictEventsFailedAt = 0
const CONFLICT_EVENTS_CACHE_TTL = 600_000 // 10 min
const CONFLICT_EVENTS_RETRY_BACKOFF = 120_000 // 2 min after failure

export async function fetchConflictEvents(options?: {
  country?: string
  limit?: number
  eventType?: string
}): Promise<ConflictEvent[]> {
  // Return cache if fresh
  if (conflictEventsCache && Date.now() - conflictEventsCache.ts < CONFLICT_EVENTS_CACHE_TTL) {
    let data = conflictEventsCache.data
    if (options?.country) data = data.filter(e => e.country.toLowerCase().includes(options.country!.toLowerCase()))
    if (options?.eventType) data = data.filter(e => e.eventType === options.eventType)
    return data.slice(0, options?.limit || 100)
  }

  // Don't retry too soon after a failure
  if (conflictEventsFailed && Date.now() - conflictEventsFailedAt < CONFLICT_EVENTS_RETRY_BACKOFF) {
    return conflictEventsCache?.data || []
  }

  try {
    // Fetch conflict news from GDELT and convert to event-like format
    const params = new URLSearchParams({
      query: 'conflict OR war OR battle OR airstrike OR bombing OR troops OR protest',
      mode: 'ArtList',
      maxrecords: '100',
      format: 'json',
      timespan: '7d',
      sort: 'DateDesc',
    })

    const res = await fetch(`${SCRP_API}/gdelt?${params}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) {
      if (res.status === 429) console.warn('[Conflict] GDELT rate limited (429)')
      conflictEventsFailed = true
      conflictEventsFailedAt = Date.now()
      return conflictEventsCache?.data || []
    }

    const text = await res.text()
    if (!text.startsWith('{') && !text.startsWith('[')) {
      console.warn('[Conflict] GDELT events returned non-JSON')
      conflictEventsFailed = true
      conflictEventsFailedAt = Date.now()
      return conflictEventsCache?.data || []
    }

    const json = JSON.parse(text)
    const articles = json.articles || []

    // Convert GDELT articles to ConflictEvent format
    const events: ConflictEvent[] = articles.map((a: any, i: number) => {
      const title = (a.title || '').toLowerCase()
      let eventType = 'Strategic developments'
      if (title.match(/battle|combat|fighting|clash/)) eventType = 'Battles'
      else if (title.match(/airstrike|missile|bomb|explos|drone|shell/)) eventType = 'Explosions/Remote violence'
      else if (title.match(/civilian|massacre|killed|dead|casualt/)) eventType = 'Violence against civilians'
      else if (title.match(/protest|demonstrat|rally|march|riot/)) eventType = 'Protests'

      return {
        id: `gdelt-${i}-${Date.now()}`,
        eventDate: a.seendate ? `${a.seendate.slice(0,4)}-${a.seendate.slice(4,6)}-${a.seendate.slice(6,8)}` : new Date().toISOString().split('T')[0],
        eventType,
        subEventType: eventType,
        actor1: a.sourcecountry || 'Unknown',
        actor2: '',
        country: a.sourcecountry || 'Unknown',
        admin1: '',
        location: a.domain || '',
        latitude: 0,
        longitude: 0,
        fatalities: 0,
        notes: a.title || '',
        source: a.domain || 'GDELT',
      }
    })

    conflictEventsFailed = false
    conflictEventsCache = { data: events, ts: Date.now() }
    return events.slice(0, options?.limit || 100)
  } catch (err) {
    console.warn('[Conflict] Conflict events fetch failed:', err)
    conflictEventsFailed = true
    conflictEventsFailedAt = Date.now()
    return conflictEventsCache?.data || []
  }
}

// ── NASA FIRMS — Fire / Hotspot Detection ──

const FIRMS_API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
const FIRMS_DEFAULT_KEY = 'DEMO_KEY' // NASA demo key, rate limited

let firmsCache: { data: Hotspot[]; ts: number } | null = null
const FIRMS_CACHE_TTL = 600_000 // 10 min

export async function fetchHotspots(options?: {
  source?: 'VIIRS_SNPP_NRT' | 'MODIS_NRT'
  dayRange?: 1 | 2 | 10
}): Promise<Hotspot[]> {
  if (firmsCache && Date.now() - firmsCache.ts < FIRMS_CACHE_TTL) {
    return firmsCache.data
  }

  const source = options?.source || 'VIIRS_SNPP_NRT'
  const days = options?.dayRange || 1

  try {
    // Try LDGR key first, fall back to demo key
    let firmsKey = FIRMS_DEFAULT_KEY
    let usingKey = false
    try {
      const ldgrResult = await getApiKeyWithName('nasa-firms')
      if (ldgrResult) { firmsKey = ldgrResult.key; usingKey = true }
    } catch { /* use default */ }

    setPipelineState('firms', 'loading', undefined, usingKey)
    const url = `${FIRMS_API}/${firmsKey}/${source}/world/${days}`
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) {
      setPipelineState('firms', res.status === 429 ? 'rate-limited' : 'error', `HTTP ${res.status}`)
      return firmsCache?.data || []
    }

    const text = await res.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []

    const headers = lines[0].split(',')
    const latIdx = headers.indexOf('latitude')
    const lonIdx = headers.indexOf('longitude')
    const brightIdx = headers.indexOf('bright_ti4') !== -1 ? headers.indexOf('bright_ti4') : headers.indexOf('brightness')
    const confIdx = headers.indexOf('confidence')
    const dateIdx = headers.indexOf('acq_date')
    const timeIdx = headers.indexOf('acq_time')
    const satIdx = headers.indexOf('satellite')
    const frpIdx = headers.indexOf('frp')

    const hotspots: Hotspot[] = lines.slice(1).map(line => {
      const cols = line.split(',')
      return {
        latitude: parseFloat(cols[latIdx]),
        longitude: parseFloat(cols[lonIdx]),
        brightness: parseFloat(cols[brightIdx]) || 0,
        confidence: cols[confIdx] || 'n',
        acqDate: cols[dateIdx] || '',
        acqTime: cols[timeIdx] || '',
        satellite: cols[satIdx] || '',
        frp: parseFloat(cols[frpIdx]) || 0,
      }
    }).filter(h => !isNaN(h.latitude) && !isNaN(h.longitude))

    // Only keep high-confidence hotspots to reduce noise
    const filtered = hotspots.filter(h => h.confidence === 'h' || h.confidence === 'high' || h.frp > 10)

    firmsCache = { data: filtered, ts: Date.now() }
    setPipelineState('firms', 'ok', `${filtered.length} hotspots`, usingKey)
    return filtered
  } catch (err) {
    console.warn('[Conflict] FIRMS fetch failed:', err)
    setPipelineState('firms', 'error', err instanceof Error ? err.message : 'Network error')
    return firmsCache?.data || []
  }
}

// ── AIS Vessel Tracking (Digitraffic — free, no auth) ──
// Finnish Transport Agency provides real-time AIS data for vessels worldwide
// Premium: AIS-Hub key via LDGR for broader coverage

const DIGITRAFFIC_AIS = 'https://meri.digitraffic.fi/api/ais/v1'

export interface Vessel {
  mmsi: number
  name: string
  shipType: number
  shipTypeName: string
  callSign: string
  destination: string
  latitude: number
  longitude: number
  sog: number       // speed over ground (knots)
  cog: number       // course over ground (degrees)
  heading: number
  draught: number
  length: number
  width: number
  navStatus: number
  navStatusName: string
  timestamp: number
  flag: string
}

// AIS ship type codes → human-readable names
const SHIP_TYPE_NAMES: Record<number, string> = {
  0: 'Unknown',
  20: 'Wing in Ground',
  30: 'Fishing',
  31: 'Towing',
  32: 'Towing (large)',
  33: 'Dredging',
  34: 'Diving Ops',
  35: 'Military Ops',
  36: 'Sailing',
  37: 'Pleasure Craft',
  40: 'High Speed Craft',
  50: 'Pilot Vessel',
  51: 'SAR',
  52: 'Tug',
  53: 'Port Tender',
  54: 'Anti-Pollution',
  55: 'Law Enforcement',
  58: 'Medical',
  60: 'Passenger',
  70: 'Cargo',
  80: 'Tanker',
  90: 'Other',
}

function getShipTypeName(code: number): string {
  // Exact match
  if (SHIP_TYPE_NAMES[code]) return SHIP_TYPE_NAMES[code]
  // Range match (e.g. 60-69 = Passenger, 70-79 = Cargo, 80-89 = Tanker)
  const decade = Math.floor(code / 10) * 10
  return SHIP_TYPE_NAMES[decade] || 'Unknown'
}

const NAV_STATUS_NAMES: Record<number, string> = {
  0: 'Under Way (Engine)',
  1: 'At Anchor',
  2: 'Not Under Command',
  3: 'Restricted Maneuverability',
  4: 'Constrained by Draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in Fishing',
  8: 'Under Way (Sailing)',
  11: 'Towing Astern',
  12: 'Towing Alongside',
  14: 'AIS-SART Active',
  15: 'Undefined',
}

// Military-interest vessel types
const MILITARY_SHIP_TYPES = new Set([35, 51, 55])

let vesselCache: { data: Vessel[]; ts: number } | null = null
let vesselFailed = false
let vesselFailedAt = 0
let vesselInflight: Promise<Vessel[]> | null = null
const VESSEL_CACHE_TTL = 120_000 // 2 min
const VESSEL_RETRY_BACKOFF = 120_000

export function fetchVessels(): Promise<Vessel[]> {
  // Inflight deduplication
  if (vesselInflight) return vesselInflight
  vesselInflight = _fetchVesselsImpl()
  vesselInflight.finally(() => { vesselInflight = null })
  return vesselInflight
}

async function _fetchVesselsImpl(): Promise<Vessel[]> {
  // Return cache if fresh
  if (vesselCache && Date.now() - vesselCache.ts < VESSEL_CACHE_TTL) {
    return vesselCache.data
  }

  // Don't retry too soon after failure
  if (vesselFailed && Date.now() - vesselFailedAt < VESSEL_RETRY_BACKOFF) {
    return vesselCache?.data || []
  }

  try {
    setPipelineState('ais', 'loading')

    // Fetch vessel locations from Digitraffic
    const res = await fetch(`${DIGITRAFFIC_AIS}/locations`, {
      signal: AbortSignal.timeout(20000),
      headers: { 'Accept': 'application/json', 'Digitraffic-User': 'NSIT/RMG' },
    })

    if (!res.ok) {
      if (res.status === 429) {
        setPipelineState('ais', 'rate-limited', 'Digitraffic rate limited')
        vesselFailed = true
        vesselFailedAt = Date.now()
        return vesselCache?.data || []
      }
      throw new Error(`HTTP ${res.status}`)
    }

    const json = await res.json()
    const features = json.features || []

    // NOTE: We intentionally skip the /vessels metadata endpoint.
    // It downloads the ENTIRE vessel database (50k+ records, ~10MB) which
    // kills performance. The /locations endpoint has enough data (mmsi,
    // position, speed, heading, navStatus, shipType) for our use case.

    const MAX_VESSELS = 500 // cap markers for map performance

    const vessels: Vessel[] = features
      .filter((f: any) => f.geometry?.coordinates)
      .slice(0, MAX_VESSELS * 2) // pre-filter before mapping (some will be filtered out)
      .map((f: any) => {
        const props = f.properties || {}
        const [lng, lat] = f.geometry.coordinates
        const mmsi = props.mmsi || 0
        const shipType = props.shipType ?? 0

        return {
          mmsi,
          name: props.name || `MMSI ${mmsi}`,
          shipType,
          shipTypeName: getShipTypeName(shipType),
          callSign: props.callSign || '',
          destination: props.destination || '',
          latitude: lat,
          longitude: lng,
          sog: props.sog ?? 0,
          cog: props.cog ?? 0,
          heading: props.heading ?? props.cog ?? 0,
          draught: props.draught ?? 0,
          length: 0,
          width: 0,
          navStatus: props.navStat ?? 15,
          navStatusName: NAV_STATUS_NAMES[props.navStat] || 'Unknown',
          timestamp: props.timestampExternal || Date.now(),
          flag: mmsiToFlag(mmsi),
        }
      })
      .filter((v: Vessel) => v.latitude !== 0 && v.longitude !== 0)
      .slice(0, MAX_VESSELS)

    vesselFailed = false
    vesselCache = { data: vessels, ts: Date.now() }
    setPipelineState('ais', 'ok', `${vessels.length} vessels`)
    return vessels
  } catch (err) {
    console.warn('[Conflict] AIS vessel fetch failed:', err)
    vesselFailed = true
    vesselFailedAt = Date.now()
    setPipelineState('ais', 'error', err instanceof Error ? err.message : 'Network error')
    return vesselCache?.data || []
  }
}

/** Filter to military/government/SAR vessels */
export async function fetchMilitaryVessels(): Promise<Vessel[]> {
  const all = await fetchVessels()
  return all.filter(v =>
    MILITARY_SHIP_TYPES.has(v.shipType) ||
    MILITARY_SHIP_TYPES.has(Math.floor(v.shipType / 10) * 10) ||
    v.name.match(/navy|coast guard|patrol|military|warship/i) ||
    v.shipTypeName === 'Military Ops' ||
    v.shipTypeName === 'Law Enforcement' ||
    v.shipTypeName === 'SAR'
  )
}

/** Derive flag country from MMSI MID (Maritime Identification Digits) */
function mmsiToFlag(mmsi: number): string {
  const mid = Math.floor(mmsi / 1_000_000)
  const MID_FLAGS: Record<number, string> = {
    201: '🇦🇱', 202: '🇦🇩', 203: '🇦🇹', 204: '🇵🇹', 205: '🇧🇪', 206: '🇧🇾',
    207: '🇧🇬', 209: '🇨🇾', 210: '🇨🇾', 211: '🇩🇪', 212: '🇨🇾', 213: '🇬🇪',
    214: '🇲🇩', 215: '🇲🇹', 216: '🇦🇲', 218: '🇩🇪', 219: '🇩🇰', 220: '🇩🇰',
    224: '🇪🇸', 225: '🇪🇸', 226: '🇫🇷', 227: '🇫🇷', 228: '🇫🇷', 229: '🇲🇹',
    230: '🇫🇮', 231: '🇫🇴', 232: '🇬🇧', 233: '🇬🇧', 234: '🇬🇧', 235: '🇬🇧',
    236: '🇬🇮', 237: '🇬🇷', 238: '🇭🇷', 239: '🇬🇷', 240: '🇬🇷', 241: '🇬🇷',
    242: '🇲🇦', 243: '🇭🇺', 244: '🇳🇱', 245: '🇳🇱', 246: '🇳🇱', 247: '🇮🇹',
    248: '🇲🇹', 249: '🇲🇹', 250: '🇮🇪', 251: '🇮🇸', 252: '🇱🇮', 253: '🇱🇺',
    254: '🇲🇨', 255: '🇵🇹', 256: '🇲🇹', 257: '🇳🇴', 258: '🇳🇴', 259: '🇳🇴',
    261: '🇵🇱', 263: '🇵🇹', 265: '🇸🇪', 266: '🇸🇪', 267: '🇸🇰', 268: '🇸🇲',
    269: '🇨🇭', 270: '🇨🇿', 271: '🇹🇷', 272: '🇺🇦', 273: '🇷🇺', 274: '🇲🇰',
    275: '🇱🇻', 276: '🇪🇪', 277: '🇱🇹', 278: '🇸🇮', 279: '🇷🇸',
    301: '🇦🇮', 303: '🇺🇸', 304: '🇦🇬', 305: '🇦🇬', 306: '🇳🇱', 307: '🇳🇱',
    308: '🇧🇸', 309: '🇧🇸', 310: '🇧🇲', 311: '🇧🇸', 312: '🇧🇿', 314: '🇧🇧',
    316: '🇨🇦', 319: '🇰🇾', 321: '🇨🇷', 323: '🇨🇺', 325: '🇩🇲', 327: '🇩🇴',
    329: '🇫🇷', 330: '🇬🇩', 332: '🇬🇹', 334: '🇭🇳', 336: '🇭🇹', 338: '🇺🇸',
    339: '🇯🇲', 341: '🇰🇳', 343: '🇱🇨', 345: '🇲🇽', 347: '🇫🇷', 348: '🇳🇮',
    350: '🇵🇦', 351: '🇵🇦', 352: '🇵🇦', 353: '🇵🇦', 354: '🇵🇦', 355: '🇵🇦',
    356: '🇵🇦', 357: '🇵🇦', 358: '🇵🇷', 359: '🇸🇻', 361: '🇵🇲',
    366: '🇺🇸', 367: '🇺🇸', 368: '🇺🇸', 369: '🇺🇸',
    370: '🇵🇦', 371: '🇵🇦', 372: '🇵🇦', 373: '🇵🇦',
    375: '🇻🇨', 376: '🇻🇨', 377: '🇻🇨', 378: '🇬🇧',
    401: '🇦🇫', 403: '🇸🇦', 405: '🇧🇩', 408: '🇧🇭', 410: '🇧🇹', 412: '🇨🇳',
    413: '🇨🇳', 414: '🇨🇳', 416: '🇹🇼', 417: '🇱🇰', 419: '🇮🇳', 422: '🇮🇷',
    423: '🇦🇿', 425: '🇮🇶', 428: '🇮🇱', 431: '🇯🇵', 432: '🇯🇵',
    440: '🇰🇷', 441: '🇰🇷', 443: '🇵🇸', 445: '🇰🇵', 447: '🇰🇼', 450: '🇱🇧',
    455: '🇲🇻', 457: '🇲🇳', 459: '🇳🇵', 461: '🇴🇲', 463: '🇵🇰', 466: '🇶🇦',
    468: '🇸🇾', 470: '🇦🇪', 472: '🇹🇯', 473: '🇾🇪', 475: '🇹🇲',
    477: '🇭🇰', 478: '🇧🇦',
    501: '🇫🇷', 503: '🇦🇺', 506: '🇲🇲', 508: '🇧🇳', 510: '🇫🇲', 511: '🇵🇼',
    512: '🇳🇿', 514: '🇰🇭', 515: '🇰🇭', 516: '🇨🇽', 518: '🇨🇰', 520: '🇫🇯',
    523: '🇨🇰', 525: '🇮🇩', 529: '🇰🇮', 531: '🇱🇦', 533: '🇲🇾', 536: '🇳🇷',
    538: '🇲🇭', 540: '🇳🇨', 542: '🇳🇺', 544: '🇳🇷', 546: '🇫🇷',
    548: '🇵🇭', 553: '🇵🇬', 555: '🇵🇳', 557: '🇸🇧', 559: '🇦🇸',
    561: '🇼🇸', 563: '🇸🇬', 564: '🇸🇬', 565: '🇸🇬', 566: '🇸🇬', 567: '🇹🇭',
    570: '🇹🇴', 572: '🇹🇻', 574: '🇻🇳', 576: '🇻🇺', 577: '🇻🇺', 578: '🇼🇫',
    601: '🇿🇦', 603: '🇦🇴', 605: '🇩🇿', 607: '🇫🇷', 608: '🇬🇧', 609: '🇧🇮',
    610: '🇧🇯', 611: '🇧🇼', 612: '🇨🇲', 613: '🇨🇬', 615: '🇨🇩', 616: '🇰🇲',
    617: '🇨🇻', 618: '🇫🇷', 619: '🇨🇮', 620: '🇰🇲', 621: '🇩🇯', 622: '🇪🇬',
    624: '🇪🇹', 625: '🇪🇷', 626: '🇬🇦', 627: '🇬🇭', 629: '🇬🇲', 630: '🇬🇼',
    631: '🇬🇶', 632: '🇬🇳', 633: '🇧🇫', 634: '🇰🇪', 635: '🇫🇷', 636: '🇱🇷',
    637: '🇱🇷', 638: '🇸🇸', 642: '🇱🇾', 644: '🇱🇸', 645: '🇲🇺', 647: '🇲🇬',
    649: '🇲🇱', 650: '🇲🇿', 654: '🇲🇷', 655: '🇲🇼', 656: '🇳🇪', 657: '🇳🇬',
    659: '🇳🇦', 660: '🇫🇷', 661: '🇷🇼', 662: '🇸🇹', 663: '🇸🇳', 664: '🇸🇨',
    665: '🇸🇱', 666: '🇸🇴', 667: '🇸🇿', 668: '🇸🇩', 669: '🇸🇿', 670: '🇹🇩',
    671: '🇹🇬', 672: '🇹🇳', 674: '🇹🇿', 675: '🇺🇬', 676: '🇨🇩', 677: '🇹🇿',
    678: '🇿🇲', 679: '🇿🇼',
  }
  return MID_FLAGS[mid] || '🏴'
}

// ── GDELT — Global Tension & Conflict News ──

// GDELT sometimes returns non-JSON from browser — route through scrp-api proxy
const GDELT_DOC_API = `${SCRP_API}/gdelt`

let gdeltNewsCache: { data: GdeltEvent[]; ts: number } | null = null
let gdeltFailed = false
let gdeltFailedAt = 0
const GDELT_CACHE_TTL = 600_000 // 10 min
const GDELT_RETRY_BACKOFF = 120_000 // 2 min after failure

export async function fetchConflictNews(query?: string): Promise<GdeltEvent[]> {
  if (gdeltNewsCache && Date.now() - gdeltNewsCache.ts < GDELT_CACHE_TTL) {
    return gdeltNewsCache.data
  }

  // Don't retry too soon after a failure
  if (gdeltFailed && Date.now() - gdeltFailedAt < GDELT_RETRY_BACKOFF) {
    return gdeltNewsCache?.data || []
  }

  try {
    // Use a simpler query to avoid GDELT rate limits / query complexity errors
    const q = query || 'conflict war military'
    const params = new URLSearchParams({
      query: q,
      mode: 'ArtList',
      maxrecords: '30',
      format: 'json',
      timespan: '24h',
      sort: 'DateDesc',
    })

    const res = await fetch(`${GDELT_DOC_API}?${params}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) {
      if (res.status === 429) console.warn('[Conflict] GDELT news rate limited (429)')
      gdeltFailed = true
      gdeltFailedAt = Date.now()
      return gdeltNewsCache?.data || []
    }

    // GDELT sometimes returns non-JSON error pages ("Queries co...")
    const text = await res.text()
    if (!text.startsWith('{') && !text.startsWith('[')) {
      console.warn('[Conflict] GDELT returned non-JSON:', text.slice(0, 80))
      gdeltFailed = true
      gdeltFailedAt = Date.now()
      return gdeltNewsCache?.data || []
    }

    const json = JSON.parse(text)
    const articles: GdeltEvent[] = (json.articles || []).map((a: any) => ({
      title: a.title || '',
      url: a.url || '',
      domain: a.domain || '',
      language: a.language || 'English',
      sourcecountry: a.sourcecountry || '',
      tone: parseFloat(a.tone?.split(',')[0]) || 0,
      dateadded: a.seendate || '',
      image: a.socialimage || undefined,
    }))

    gdeltFailed = false
    gdeltNewsCache = { data: articles, ts: Date.now() }
    return articles
  } catch (err) {
    console.warn('[Conflict] GDELT fetch failed:', err)
    gdeltFailed = true
    gdeltFailedAt = Date.now()
    return gdeltNewsCache?.data || []
  }
}

// ── CYBER — CVE Feed + Cyber Threat News ──

export interface CveEntry {
  id: string
  summary: string
  cvss: number | null
  published: string
  modified: string
  references: string[]
}

export interface CyberEvent {
  id: string
  title: string
  url: string
  domain: string
  category: 'ransomware' | 'apt' | 'ddos' | 'breach' | 'vulnerability' | 'cyber'
  sourcecountry: string
  dateadded: string
  tone: number
}

let cveCache: { data: CveEntry[]; ts: number } | null = null
let cveFailed = false
let cveFailedAt = 0
const CVE_CACHE_TTL = 600_000 // 10 min
const CVE_RETRY_BACKOFF = 120_000

export async function fetchLatestCVEs(limit = 30): Promise<CveEntry[]> {
  if (cveCache && Date.now() - cveCache.ts < CVE_CACHE_TTL) {
    return cveCache.data.slice(0, limit)
  }
  if (cveFailed && Date.now() - cveFailedAt < CVE_RETRY_BACKOFF) {
    return cveCache?.data?.slice(0, limit) || []
  }

  try {
    // Proxy through Render rewrite to avoid CORS (cve.circl.lu sends duplicate ACAO headers)
    const cveBase = import.meta.env.DEV ? 'https://cve.circl.lu' : '/api/cve'
    const res = await fetch(`${cveBase}/api/last/30`, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) {
      cveFailed = true
      cveFailedAt = Date.now()
      return cveCache?.data?.slice(0, limit) || []
    }

    const json = await res.json()
    const cves: CveEntry[] = (Array.isArray(json) ? json : []).map((c: any) => ({
      id: c.id || c.cveId || '',
      summary: c.summary || c.descriptions?.[0]?.value || '',
      cvss: c.cvss ?? c.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore ?? null,
      published: c.Published || c.published || '',
      modified: c.Modified || c.lastModified || '',
      references: (c.references || []).slice(0, 3).map((r: any) => typeof r === 'string' ? r : r.url || ''),
    }))

    cveFailed = false
    cveCache = { data: cves, ts: Date.now() }
    return cves.slice(0, limit)
  } catch (err) {
    console.warn('[Conflict] CVE fetch failed:', err)
    cveFailed = true
    cveFailedAt = Date.now()
    return cveCache?.data?.slice(0, limit) || []
  }
}

let cyberNewsCache: { data: CyberEvent[]; ts: number } | null = null
let cyberNewsFailed = false
let cyberNewsFailedAt = 0
const CYBER_NEWS_CACHE_TTL = 600_000
const CYBER_NEWS_RETRY_BACKOFF = 120_000

export async function fetchCyberNews(): Promise<CyberEvent[]> {
  if (cyberNewsCache && Date.now() - cyberNewsCache.ts < CYBER_NEWS_CACHE_TTL) {
    return cyberNewsCache.data
  }
  if (cyberNewsFailed && Date.now() - cyberNewsFailedAt < CYBER_NEWS_RETRY_BACKOFF) {
    return cyberNewsCache?.data || []
  }

  try {
    const params = new URLSearchParams({
      query: 'cyberattack OR ransomware OR "data breach" OR hacking OR APT OR DDoS OR "zero day"',
      mode: 'ArtList',
      maxrecords: '30',
      format: 'json',
      timespan: '3d',
      sort: 'DateDesc',
    })

    const res = await fetch(`${SCRP_API}/gdelt?${params}`, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) {
      cyberNewsFailed = true
      cyberNewsFailedAt = Date.now()
      return cyberNewsCache?.data || []
    }

    const text = await res.text()
    if (!text.startsWith('{') && !text.startsWith('[')) {
      cyberNewsFailed = true
      cyberNewsFailedAt = Date.now()
      return cyberNewsCache?.data || []
    }

    const json = JSON.parse(text)
    const articles: CyberEvent[] = (json.articles || []).map((a: any, i: number) => {
      const title = (a.title || '').toLowerCase()
      let category: CyberEvent['category'] = 'cyber'
      if (title.match(/ransomware|ransom/)) category = 'ransomware'
      else if (title.match(/apt|nation.state|espionage|spy/)) category = 'apt'
      else if (title.match(/ddos|denial.of.service/)) category = 'ddos'
      else if (title.match(/breach|leak|exfiltrat/)) category = 'breach'
      else if (title.match(/vulnerabilit|cve|zero.day|exploit|patch/)) category = 'vulnerability'

      return {
        id: `cyber-${i}-${Date.now()}`,
        title: a.title || '',
        url: a.url || '',
        domain: a.domain || '',
        category,
        sourcecountry: a.sourcecountry || '',
        dateadded: a.seendate || '',
        tone: parseFloat(a.tone?.split(',')[0]) || 0,
      }
    })

    cyberNewsFailed = false
    cyberNewsCache = { data: articles, ts: Date.now() }
    return articles
  } catch (err) {
    console.warn('[Conflict] Cyber news fetch failed:', err)
    cyberNewsFailed = true
    cyberNewsFailedAt = Date.now()
    return cyberNewsCache?.data || []
  }
}

// ── Defense sector tickers ──

export const DEFENSE_TICKERS = ['RTX', 'LMT', 'NOC', 'BA', 'GD', 'HII', 'LHX', 'LDOS']
