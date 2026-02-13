/**
 * Yahoo Finance quote fetcher
 * Uses the v8/finance/chart endpoint on query2 — free, no API key.
 * Fetches each symbol individually via Promise.allSettled.
 */

import { API } from './api'

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
const CACHE_TTL = 90_000 // 90 seconds

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
    const results = await Promise.allSettled(toFetch.map(s => fetchSingleChart(s)))

    for (let i = 0; i < toFetch.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled' && r.value) {
        cache.data.set(toFetch[i], r.value)
      }
    }
    cache.ts = now
  } catch (err) {
    console.warn('[Yahoo Finance] Batch fetch failed:', err)
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

// Gold/Silver Ratio helper
export function calcGSR(quotes: Map<string, YahooQuote>): number | null {
  const gold = quotes.get('GC=F')
  const silver = quotes.get('SI=F')
  if (!gold || !silver || silver.regularMarketPrice === 0) return null
  return gold.regularMarketPrice / silver.regularMarketPrice
}
