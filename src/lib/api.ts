// Proxy paths work in both dev (Vite proxy) and prod (Netlify _redirects)
export const API = {
  coingecko: (path: string) => `/api/coingecko${path}`,
  polymarket: (path: string) => `/api/polymarket${path}`,
  fng: (path: string) => `/api/fng${path}`,
  rss: (path: string) => `/api/rss${path}`,
  yahoo: (path: string) => `/api/yahoo${path}`,
}

// CoinGecko rate-limiter with response cache
// Free tier: ~10-30 req/min. We queue requests with a 4s gap and cache responses for 60s.
const cgQueue: (() => Promise<void>)[] = []
let cgProcessing = false
const cgCache = new Map<string, { data: any; ts: number }>()
const CG_CACHE_TTL = 60_000 // 60s
const CG_GAP_MS = 4_000     // 4s between requests

async function processCgQueue() {
  if (cgProcessing) return
  cgProcessing = true
  while (cgQueue.length > 0) {
    const next = cgQueue.shift()
    if (next) {
      await next()
      if (cgQueue.length > 0) await new Promise(r => setTimeout(r, CG_GAP_MS))
    }
  }
  cgProcessing = false
}

// Shared coins/markets data — one fetch serves TickerTape, CryptoHeatmap, TopMovers, predictionEngine
let sharedMarketsCache: { data: any[]; ts: number } | null = null
const SHARED_MARKETS_TTL = 60_000

export async function getSharedMarkets(): Promise<any[]> {
  if (sharedMarketsCache && Date.now() - sharedMarketsCache.ts < SHARED_MARKETS_TTL) {
    return sharedMarketsCache.data
  }
  const res = await fetchCoinGecko(
    '/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&sparkline=false&price_change_percentage=24h%2C7d%2C30d'
  )
  if (!res.ok) return sharedMarketsCache?.data || []
  const data = await res.json()
  sharedMarketsCache = { data, ts: Date.now() }
  return data
}

export function fetchCoinGecko(path: string, options?: RequestInit): Promise<Response> {
  // Normalize path for cache key (strip trailing &, sort params)
  const cacheKey = path.split('?')[0] + '?' + (path.split('?')[1] || '')
    .split('&').sort().join('&')

  // Return cached response if fresh
  const cached = cgCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CG_CACHE_TTL) {
    return Promise.resolve(new Response(JSON.stringify(cached.data), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
  }

  return new Promise((resolve, reject) => {
    cgQueue.push(async () => {
      // Double-check cache (another queued request may have filled it)
      const c2 = cgCache.get(cacheKey)
      if (c2 && Date.now() - c2.ts < CG_CACHE_TTL) {
        resolve(new Response(JSON.stringify(c2.data), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        }))
        return
      }
      try {
        const res = await fetch(API.coingecko(path), options)
        if (res.ok) {
          try {
            const data = await res.json()
            cgCache.set(cacheKey, { data, ts: Date.now() })
            resolve(new Response(JSON.stringify(data), {
              status: 200, headers: { 'Content-Type': 'application/json' },
            }))
          } catch {
            resolve(res)
          }
        } else {
          resolve(res)
        }
      } catch (err) {
        reject(err)
      }
    })
    processCgQueue()
  })
}
