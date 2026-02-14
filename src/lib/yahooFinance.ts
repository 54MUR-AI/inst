/**
 * Yahoo Finance quote fetcher
 * Uses the v8/finance/chart endpoint on query2 — free, no API key.
 * Fetches each symbol individually via Promise.allSettled.
 */

import { API } from './api'
import { setPipelineState } from './pipelineStatus'

export interface YahooQuote {
  symbol: string
  shortName: string
  regularMarketPrice: number
  regularMarketChange: number
  regularMarketChangePercent: number
  regularMarketPreviousClose: number
  regularMarketOpen: number
  regularMarketDayHigh: number
  regularMarketDayLow: number
  regularMarketVolume: number
  currency: string
  marketState: string
  quoteType: string
}

let cache: { data: Map<string, YahooQuote>; ts: number } = { data: new Map(), ts: 0 }
const CACHE_TTL = 300_000 // 5 min (client-side simulation fills the gap)

async function fetchSingleChart(symbol: string): Promise<YahooQuote | null> {
  try {
    const url = API.yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`)
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()

    const result = json.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta
    const price = meta.regularMarketPrice ?? 0
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change = price - prevClose
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0

    // Extract day high/low from indicators if available
    const indicators = result.indicators?.quote?.[0]
    const dayHigh = indicators?.high?.[indicators.high.length - 1] ?? meta.regularMarketDayHigh ?? price
    const dayLow = indicators?.low?.[indicators.low.length - 1] ?? meta.regularMarketDayLow ?? price
    const dayOpen = indicators?.open?.[indicators.open.length - 1] ?? price
    const dayVol = indicators?.volume?.[indicators.volume.length - 1] ?? 0

    return {
      symbol: meta.symbol || symbol,
      shortName: meta.shortName || meta.symbol || symbol,
      regularMarketPrice: price,
      regularMarketChange: change,
      regularMarketChangePercent: changePct,
      regularMarketPreviousClose: prevClose,
      regularMarketOpen: dayOpen,
      regularMarketDayHigh: dayHigh,
      regularMarketDayLow: dayLow,
      regularMarketVolume: dayVol,
      currency: meta.currency || 'USD',
      marketState: meta.marketState || 'CLOSED',
      quoteType: meta.instrumentType || meta.quoteType || 'EQUITY',
    }
  } catch {
    return null
  }
}

export async function fetchQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const now = Date.now()

  // Return cache if fresh and has all requested symbols
  if (now - cache.ts < CACHE_TTL && symbols.every(s => cache.data.has(s))) {
    return cache.data
  }

  // Only fetch symbols not in cache (or all if cache expired)
  const toFetch = now - cache.ts >= CACHE_TTL ? symbols : symbols.filter(s => !cache.data.has(s))

  try {
    setPipelineState('yahoo', 'loading')
    const results = await Promise.allSettled(toFetch.map(s => fetchSingleChart(s)))

    let okCount = 0
    for (let i = 0; i < toFetch.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled' && r.value) {
        cache.data.set(toFetch[i], r.value)
        okCount++
      }
    }
    cache.ts = now
    if (okCount > 0) {
      setPipelineState('yahoo', 'ok', `${cache.data.size} quotes`)
    } else if (cache.data.size > 0) {
      setPipelineState('yahoo', 'stale', 'Using cached data')
    } else {
      setPipelineState('yahoo', 'error', 'No quotes returned')
    }
  } catch (err) {
    console.warn('[Yahoo Finance] Batch fetch failed:', err)
    setPipelineState('yahoo', 'error', err instanceof Error ? err.message : 'Network error')
  }

  return cache.data
}

// ── Symbol groups ──

export const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', flag: '🇺🇸' },
  { symbol: '^DJI', name: 'Dow Jones', flag: '🇺🇸' },
  { symbol: '^IXIC', name: 'NASDAQ', flag: '🇺🇸' },
  { symbol: '^RUT', name: 'Russell 2000', flag: '🇺🇸' },
  { symbol: '^FTSE', name: 'FTSE 100', flag: '🇬🇧' },
  { symbol: '^GDAXI', name: 'DAX', flag: '🇩🇪' },
  { symbol: '^FCHI', name: 'CAC 40', flag: '🇫🇷' },
  { symbol: '^N225', name: 'Nikkei 225', flag: '🇯🇵' },
  { symbol: '000001.SS', name: 'Shanghai', flag: '🇨🇳' },
  { symbol: '^HSI', name: 'Hang Seng', flag: '🇭🇰' },
  { symbol: '^BSESN', name: 'BSE Sensex', flag: '🇮🇳' },
]

export const METALS = [
  { symbol: 'GC=F', name: 'Gold', unit: '/oz' },
  { symbol: 'SI=F', name: 'Silver', unit: '/oz' },
  { symbol: 'PL=F', name: 'Platinum', unit: '/oz' },
  { symbol: 'PA=F', name: 'Palladium', unit: '/oz' },
  { symbol: 'HG=F', name: 'Copper', unit: '/lb' },
]

export const ENERGY = [
  { symbol: 'CL=F', name: 'WTI Crude', unit: '/bbl' },
  { symbol: 'BZ=F', name: 'Brent Crude', unit: '/bbl' },
  { symbol: 'NG=F', name: 'Natural Gas', unit: '/MMBtu' },
]

export const FOREX = [
  { symbol: 'DX-Y.NYB', name: 'DXY (USD Index)', flag: '💵' },
  { symbol: 'EURUSD=X', name: 'EUR/USD', flag: '🇪🇺' },
  { symbol: 'GBPUSD=X', name: 'GBP/USD', flag: '🇬🇧' },
  { symbol: 'USDJPY=X', name: 'USD/JPY', flag: '🇯🇵' },
  { symbol: 'USDCNY=X', name: 'USD/CNY', flag: '🇨🇳' },
  { symbol: 'USDCHF=X', name: 'USD/CHF', flag: '🇨🇭' },
  { symbol: 'AUDUSD=X', name: 'AUD/USD', flag: '🇦🇺' },
  { symbol: 'USDCAD=X', name: 'USD/CAD', flag: '🇨🇦' },
]

export const BONDS = [
  { symbol: '^IRX', name: '3-Month', tenor: '3M' },
  { symbol: '^FVX', name: '5-Year', tenor: '5Y' },
  { symbol: '^TNX', name: '10-Year', tenor: '10Y' },
  { symbol: '^TYX', name: '30-Year', tenor: '30Y' },
]

// Popular stocks for fundamentals analysis in predictions
export const POPULAR_STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'JPM', name: 'JPMorgan' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'XOM', name: 'ExxonMobil' },
]

/**
 * Client-side price simulation (inspired by bloomberg-terminal project).
 * Applies tiny random movements to cached quotes so the UI feels live
 * between real API fetches. Call on a fast interval (5-10s).
 * Only mutates price/change fields — never overwrites real API data.
 */
export function simulateQuoteUpdates(): Map<string, YahooQuote> {
  if (cache.data.size === 0) return cache.data

  for (const [sym, q] of cache.data) {
    // 30% chance each symbol gets a micro-update
    if (Math.random() > 0.30) continue

    // Determine volatility multiplier by asset type
    let vol = 0.02 // default: ±0.02% max move
    if (sym.includes('=F')) vol = 0.04        // futures/commodities
    else if (sym.includes('=X')) vol = 0.01   // forex (less volatile)
    else if (sym.startsWith('^')) vol = 0.015 // indices
    // crypto would be higher but CoinGecko handles that

    const direction = Math.random() > 0.5 ? 1 : -1
    const magnitude = Math.random() * vol
    const priceDelta = q.regularMarketPrice * (magnitude / 100) * direction

    const newPrice = +(q.regularMarketPrice + priceDelta).toFixed(
      q.regularMarketPrice > 100 ? 2 : q.regularMarketPrice > 1 ? 4 : 6
    )
    const newChange = +(newPrice - q.regularMarketPreviousClose).toFixed(4)
    const newChangePct = q.regularMarketPreviousClose !== 0
      ? +((newChange / q.regularMarketPreviousClose) * 100).toFixed(4)
      : 0

    // Update high/low if breached
    const newHigh = Math.max(q.regularMarketDayHigh, newPrice)
    const newLow = Math.min(q.regularMarketDayLow, newPrice)

    cache.data.set(sym, {
      ...q,
      regularMarketPrice: newPrice,
      regularMarketChange: newChange,
      regularMarketChangePercent: newChangePct,
      regularMarketDayHigh: newHigh,
      regularMarketDayLow: newLow,
    })
  }
  return cache.data
}

/** Returns cached quotes without fetching. Useful for simulation ticks. */
export function getCachedQuotes(): Map<string, YahooQuote> {
  return cache.data
}

// Gold/Silver Ratio helper
export function calcGSR(quotes: Map<string, YahooQuote>): number | null {
  const gold = quotes.get('GC=F')
  const silver = quotes.get('SI=F')
  if (!gold || !silver || silver.regularMarketPrice === 0) return null
  return gold.regularMarketPrice / silver.regularMarketPrice
}

// ── OHLC Candlestick data ──

export interface OHLCBar {
  time: number  // Unix timestamp (seconds)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

let ohlcCache: Map<string, { data: OHLCBar[]; ts: number }> = new Map()
const OHLC_CACHE_TTL = 120_000 // 2 minutes

export async function fetchOHLC(
  symbol: string,
  interval: string = '1d',
  range: string = '6mo'
): Promise<OHLCBar[]> {
  const cacheKey = `${symbol}-${interval}-${range}`
  const cached = ohlcCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < OHLC_CACHE_TTL) return cached.data

  try {
    const url = API.yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`)
    const res = await fetch(url)
    if (!res.ok) return cached?.data || []
    const json = await res.json()

    const result = json.chart?.result?.[0]
    if (!result) return []

    const timestamps: number[] = result.timestamp || []
    const q = result.indicators?.quote?.[0]
    if (!q || !timestamps.length) return []

    const bars: OHLCBar[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i], v = q.volume?.[i]
      if (o != null && h != null && l != null && c != null) {
        bars.push({ time: timestamps[i], open: o, high: h, low: l, close: c, volume: v || 0 })
      }
    }

    ohlcCache.set(cacheKey, { data: bars, ts: Date.now() })
    return bars
  } catch {
    return cached?.data || []
  }
}

// ── Sparkline data (5-day hourly closes) ──

let sparkCache: { data: Map<string, number[]>; ts: number } = { data: new Map(), ts: 0 }
const SPARK_CACHE_TTL = 300_000 // 5 minutes

export async function fetchSparkline(symbol: string): Promise<number[]> {
  if (Date.now() - sparkCache.ts < SPARK_CACHE_TTL && sparkCache.data.has(symbol)) {
    return sparkCache.data.get(symbol)!
  }
  try {
    const url = API.yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1h&range=5d`)
    const res = await fetch(url)
    if (!res.ok) return []
    const json = await res.json()
    const closes: number[] = json.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []
    const filtered = closes.filter((v: any) => v != null && !isNaN(v))
    sparkCache.data.set(symbol, filtered)
    sparkCache.ts = Date.now()
    return filtered
  } catch { return [] }
}

export async function fetchSparklines(symbols: string[]): Promise<Map<string, number[]>> {
  const results = await Promise.allSettled(symbols.map(s => fetchSparkline(s)))
  const map = new Map<string, number[]>()
  symbols.forEach((s, i) => {
    const r = results[i]
    if (r.status === 'fulfilled' && r.value.length > 0) map.set(s, r.value)
  })
  return map
}
