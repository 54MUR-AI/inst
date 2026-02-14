/**
 * Conflict data APIs — OpenSky, ACLED, NASA FIRMS, GDELT
 * All free-tier, no API keys required (except FIRMS which uses a demo key).
 */

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
const AIRCRAFT_CACHE_TTL = 15_000 // 15s

export async function fetchLiveAircraft(bounds?: {
  lamin: number; lomin: number; lamax: number; lomax: number
}): Promise<Aircraft[]> {
  if (aircraftCache && Date.now() - aircraftCache.ts < AIRCRAFT_CACHE_TTL) {
    return aircraftCache.data
  }

  try {
    let url = `${OPENSKY_API}/states/all`
    if (bounds) {
      url += `?lamin=${bounds.lamin}&lomin=${bounds.lomin}&lamax=${bounds.lamax}&lomax=${bounds.lomax}`
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return aircraftCache?.data || []

    const json = await res.json()
    const states: any[][] = json.states || []

    const aircraft: Aircraft[] = states
      .filter(s => s[5] != null && s[6] != null) // must have position
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

    aircraftCache = { data: aircraft, ts: Date.now() }
    return aircraft
  } catch (err) {
    console.warn('[Conflict] OpenSky fetch failed:', err)
    return aircraftCache?.data || []
  }
}

export async function fetchMilitaryAircraft(): Promise<Aircraft[]> {
  const all = await fetchLiveAircraft()
  return all.filter(a => isMilitaryIcao(a.icao24))
}

// ── ACLED — Conflict Events ──
// ACLED moved their API from api.acleddata.com to acleddata.com/api in 2025
const ACLED_API = 'https://acleddata.com/api/acled/read'

let acledCache: { data: ConflictEvent[]; ts: number } | null = null
let acledFailed = false
let acledFailedAt = 0
const ACLED_CACHE_TTL = 600_000 // 10 min
const ACLED_RETRY_BACKOFF = 120_000 // 2 min after failure before retrying

export async function fetchConflictEvents(options?: {
  country?: string
  limit?: number
  eventType?: string
}): Promise<ConflictEvent[]> {
  // Return cache if fresh
  if (acledCache && Date.now() - acledCache.ts < ACLED_CACHE_TTL) {
    let data = acledCache.data
    if (options?.country) data = data.filter(e => e.country.toLowerCase().includes(options.country!.toLowerCase()))
    if (options?.eventType) data = data.filter(e => e.eventType === options.eventType)
    return data.slice(0, options?.limit || 100)
  }

  // Don't retry too soon after a failure
  if (acledFailed && Date.now() - acledFailedAt < ACLED_RETRY_BACKOFF) {
    return acledCache?.data || []
  }

  try {
    const params = new URLSearchParams({
      limit: '500',
      order: 'desc',
    })

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    params.set('event_date', thirtyDaysAgo.toISOString().split('T')[0])
    params.set('event_date_where', '>=')

    const res = await fetch(`${ACLED_API}?${params}`, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) {
      acledFailed = true
      acledFailedAt = Date.now()
      return acledCache?.data || []
    }

    const text = await res.text()
    // Guard against non-JSON responses
    if (!text.startsWith('{') && !text.startsWith('[')) {
      console.warn('[Conflict] ACLED returned non-JSON response')
      acledFailed = true
      acledFailedAt = Date.now()
      return acledCache?.data || []
    }

    const json = JSON.parse(text)
    const events: ConflictEvent[] = (json.data || []).map((e: any) => ({
      id: e.data_id || e.event_id_cnty,
      eventDate: e.event_date,
      eventType: e.event_type,
      subEventType: e.sub_event_type,
      actor1: e.actor1,
      actor2: e.actor2 || '',
      country: e.country,
      admin1: e.admin1,
      location: e.location,
      latitude: parseFloat(e.latitude),
      longitude: parseFloat(e.longitude),
      fatalities: parseInt(e.fatalities) || 0,
      notes: e.notes || '',
      source: e.source || '',
    }))

    acledFailed = false
    acledCache = { data: events, ts: Date.now() }
    return events.slice(0, options?.limit || 100)
  } catch (err) {
    console.warn('[Conflict] ACLED fetch failed:', err)
    acledFailed = true
    acledFailedAt = Date.now()
    return acledCache?.data || []
  }
}

// ── NASA FIRMS — Fire / Hotspot Detection ──

const FIRMS_API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
const FIRMS_MAP_KEY = 'DEMO_KEY' // NASA demo key, rate limited

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
    const url = `${FIRMS_API}/${FIRMS_MAP_KEY}/${source}/world/${days}`
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return firmsCache?.data || []

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
    return filtered
  } catch (err) {
    console.warn('[Conflict] FIRMS fetch failed:', err)
    return firmsCache?.data || []
  }
}

// ── GDELT — Global Tension & Conflict News ──

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc'

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

    const res = await fetch(`${GDELT_DOC_API}?${params}`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
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

// ── Defense sector tickers ──

export const DEFENSE_TICKERS = ['RTX', 'LMT', 'NOC', 'BA', 'GD', 'HII', 'LHX', 'LDOS']
