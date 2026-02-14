/**
 * Conflict data APIs — OpenSky, ACLED, NASA FIRMS, GDELT
 * OpenSky supports authenticated requests via LDGR API key (username:password).
 * Authenticated users get 4x rate limit (4000 req/day vs 400).
 */

import { getApiKey } from './ldgrBridge'
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

const OPENSKY_API = 'https://opensky-network.org/api'

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

async function _fetchLiveAircraftImpl(bounds?: {
  lamin: number; lomin: number; lamax: number; lomax: number
}): Promise<Aircraft[]> {
  try {
    let url = `${OPENSKY_API}/states/all`
    if (bounds) {
      url += `?lamin=${bounds.lamin}&lomin=${bounds.lomin}&lamax=${bounds.lamax}&lomax=${bounds.lomax}`
    }

    // Try to get OpenSky credentials from LDGR for authenticated requests (4x rate limit)
    const headers: Record<string, string> = {}
    let usingKey = false
    try {
      const creds = await getApiKey('opensky')
      if (creds) {
        headers['Authorization'] = 'Basic ' + btoa(creds)
        usingKey = true
      }
    } catch { /* no key available, use anonymous */ }

    setPipelineState('opensky', 'loading', undefined, usingKey)
    const res = await fetch(url, { signal: AbortSignal.timeout(10000), headers })
    if (!res.ok) {
      if (res.status === 429) {
        openskyFailed = true
        openskyFailedAt = Date.now()
        setPipelineState('opensky', 'rate-limited', `429 — ${usingKey ? 'auth' : 'anon'} limit hit`)
      } else {
        setPipelineState('opensky', 'error', `HTTP ${res.status}`)
      }
      return aircraftCache?.data || []
    }

    const json = await res.json()
    const states: any[][] = json.states || []

    const aircraft: Aircraft[] = states
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

    openskyFailed = false
    aircraftCache = { data: aircraft, ts: Date.now() }
    setPipelineState('opensky', 'ok', `${aircraft.length} aircraft`, usingKey)
    return aircraft
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
      const ldgrKey = await getApiKey('nasa-firms')
      if (ldgrKey) { firmsKey = ldgrKey; usingKey = true }
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
    const res = await fetch('https://cve.circl.lu/api/last/30', { signal: AbortSignal.timeout(15000) })
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
